use base64::{engine::general_purpose, Engine as _};
use image::{DynamicImage, ImageOutputFormat};
use screenshots::Screen;
use serde::{Deserialize, Serialize};
use std::{
  io::{Read, Write},
  io::Cursor,
  net::{TcpListener, TcpStream},
  sync::{Arc, Mutex},
  thread,
  time::Duration
};
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

const SERVICE_NAME: &str = "TinyBu";
const OPENAI_ACCOUNT: &str = "openai_api_key";
const CAPTURE_BRIDGE_ADDR: &str = "127.0.0.1:1421";
const CAPTURE_BRIDGE_EVENT: &str = "nomi-capture-bridge-updated";
const CLIPBOARD_PROMPT_EVENT: &str = "nomi-clipboard-prompt";
const CLIPBOARD_SUPPRESS_EVENT: &str = "nomi-clipboard-suppress";
const OPEN_CAPTURES_EVENT: &str = "nomi-open-captures";
const SCREENSHOT_CAPTURE_EVENT: &str = "tinybu-screenshot-captured";

type SharedCaptureBridge = Arc<Mutex<CaptureBridgeState>>;
type SharedScreenshotVisibility = Arc<Mutex<ScreenshotVisibilityState>>;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExternalCapturePayload {
  kind: String,
  title: String,
  url: String,
  text: String,
  captured_at: String
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CaptureBridgeSnapshot {
  count: u32,
  pending_count: usize
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ClipboardSuppressPayload {
  text: String
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PetVisibilityPayload {
  hidden: bool
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScreenshotArea {
  x: i32,
  y: i32,
  width: u32,
  height: u32
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScreenshotCapturePayload {
  image_data_url: String,
  width: u32,
  height: u32,
  captured_at: String,
  capture_area: Option<ScreenshotArea>
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScreenshotCaptureResult {
  image_data_url: String,
  width: u32,
  height: u32
}

#[derive(Default)]
struct CaptureBridgeState {
  count: u32,
  pending_captures: Vec<ExternalCapturePayload>
}

#[derive(Default)]
struct ScreenshotVisibilityState {
  main_was_visible: bool,
  pet_was_visible: bool
}

impl CaptureBridgeState {
  fn snapshot(&self) -> CaptureBridgeSnapshot {
    CaptureBridgeSnapshot {
      count: self.count,
      pending_count: self.pending_captures.len()
    }
  }
}

#[tauri::command]
fn save_api_key(key: String) -> Result<(), String> {
  let entry = keyring::Entry::new(SERVICE_NAME, OPENAI_ACCOUNT).map_err(|error| error.to_string())?;
  entry.set_password(&key).map_err(|error| error.to_string())
}

#[tauri::command]
fn load_api_key() -> Result<Option<String>, String> {
  let entry = keyring::Entry::new(SERVICE_NAME, OPENAI_ACCOUNT).map_err(|error| error.to_string())?;

  match entry.get_password() {
    Ok(password) => Ok(Some(password)),
    Err(keyring::Error::NoEntry) => Ok(None),
    Err(error) => Err(error.to_string())
  }
}

#[tauri::command]
fn clear_api_key() -> Result<(), String> {
  let entry = keyring::Entry::new(SERVICE_NAME, OPENAI_ACCOUNT).map_err(|error| error.to_string())?;

  match entry.delete_credential() {
    Ok(_) | Err(keyring::Error::NoEntry) => Ok(()),
    Err(error) => Err(error.to_string())
  }
}

#[tauri::command]
fn get_capture_bridge_state(state: tauri::State<'_, SharedCaptureBridge>) -> Result<CaptureBridgeSnapshot, String> {
  let bridge = state.lock().map_err(|error| error.to_string())?;
  Ok(bridge.snapshot())
}

#[tauri::command]
fn drain_pending_captures(state: tauri::State<'_, SharedCaptureBridge>) -> Result<Vec<ExternalCapturePayload>, String> {
  let mut bridge = state.lock().map_err(|error| error.to_string())?;
  Ok(bridge.pending_captures.drain(..).collect())
}

#[tauri::command]
fn reset_capture_count(
  app: tauri::AppHandle,
  state: tauri::State<'_, SharedCaptureBridge>
) -> Result<CaptureBridgeSnapshot, String> {
  let snapshot = {
    let mut bridge = state.lock().map_err(|error| error.to_string())?;
    bridge.count = 0;
    bridge.snapshot()
  };
  emit_capture_bridge_state(&app, &snapshot);
  Ok(snapshot)
}

#[tauri::command]
fn undo_last_capture(
  app: tauri::AppHandle,
  state: tauri::State<'_, SharedCaptureBridge>
) -> Result<CaptureBridgeSnapshot, String> {
  let snapshot = {
    let mut bridge = state.lock().map_err(|error| error.to_string())?;
    if bridge.pending_captures.pop().is_some() {
      bridge.count = bridge.count.saturating_sub(1);
    }
    bridge.snapshot()
  };

  emit_capture_bridge_state(&app, &snapshot);
  Ok(snapshot)
}

#[tauri::command]
fn capture_clipboard_text(
  app: tauri::AppHandle,
  state: tauri::State<'_, SharedCaptureBridge>,
  mut payload: ExternalCapturePayload
) -> Result<CaptureBridgeSnapshot, String> {
  payload.text = payload.text.trim().to_string();

  if payload.text.is_empty() {
    return Err("Clipboard text is empty.".to_string());
  }

  if payload.kind.trim().is_empty() {
    payload.kind = "selection".to_string();
  }

  if payload.title.trim().is_empty() {
    payload.title = "Clipboard Capture".to_string();
  }

  store_capture(&app, state.inner(), payload)
}

#[tauri::command]
fn open_capture_practice(app: tauri::AppHandle) -> Result<(), String> {
  if let Some(window) = app.get_webview_window("main") {
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())?;
  }

  app.emit_to("main", OPEN_CAPTURES_EVENT, ())
    .map_err(|error| error.to_string())
}

#[tauri::command]
fn hide_pet_window(app: tauri::AppHandle) -> Result<(), String> {
  if let Some(window) = app.get_webview_window("pet") {
    window.hide().map_err(|error| error.to_string())?;
  }
  Ok(())
}

#[tauri::command]
fn open_screenshot_capture(
  app: tauri::AppHandle,
  visibility_state: tauri::State<'_, SharedScreenshotVisibility>
) -> Result<bool, String> {
  if let Some(window) = app.get_webview_window("screenshot") {
    let _ = window.close();
  }

  let monitor = app
    .get_webview_window("pet")
    .and_then(|window| window.current_monitor().ok().flatten())
    .or_else(|| {
      app
        .get_webview_window("main")
        .and_then(|window| window.current_monitor().ok().flatten())
    })
    .or_else(|| app.primary_monitor().ok().flatten())
    .ok_or_else(|| "Unable to find a monitor for screenshot capture.".to_string())?;

  let main_was_visible = app
    .get_webview_window("main")
    .and_then(|window| window.is_visible().ok())
    .unwrap_or(false);
  let pet_was_visible = app
    .get_webview_window("pet")
    .and_then(|window| window.is_visible().ok())
    .unwrap_or(false);
  {
    let mut visibility = visibility_state.lock().map_err(|error| error.to_string())?;
    visibility.main_was_visible = main_was_visible;
    visibility.pet_was_visible = pet_was_visible;
  }

  if let Some(window) = app.get_webview_window("main") {
    let _ = window.hide();
  }

  if let Some(window) = app.get_webview_window("pet") {
    let _ = window.hide();
  }

  let scale_factor = monitor.scale_factor();
  let position = monitor.position();
  let size = monitor.size();
  let logical_x = position.x as f64 / scale_factor;
  let logical_y = position.y as f64 / scale_factor;
  let logical_width = size.width as f64 / scale_factor;
  let logical_height = size.height as f64 / scale_factor;

  WebviewWindowBuilder::new(&app, "screenshot", WebviewUrl::App("/?view=screenshot".into()))
    .title("TinyBu Screenshot")
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .visible_on_all_workspaces(true)
    .position(logical_x, logical_y)
    .inner_size(logical_width, logical_height)
    .resizable(false)
    .fullscreen(false)
    .focused(true)
    .skip_taskbar(true)
    .shadow(false)
    .build()
    .map_err(|error| {
      restore_screenshot_windows(&app, visibility_state.inner(), false);
      error.to_string()
    })?;

  Ok(true)
}

#[tauri::command]
fn cancel_screenshot_capture(
  app: tauri::AppHandle,
  visibility_state: tauri::State<'_, SharedScreenshotVisibility>
) -> Result<(), String> {
  if let Some(window) = app.get_webview_window("screenshot") {
    let _ = window.close();
  }

  restore_screenshot_windows(&app, visibility_state.inner(), false);
  Ok(())
}

#[tauri::command]
fn capture_screen_area(area: ScreenshotArea) -> Result<ScreenshotCaptureResult, String> {
  if area.width < 12 || area.height < 12 {
    return Err("Screenshot area is too small.".to_string());
  }

  let screen = Screen::from_point(area.x, area.y).map_err(|error| error.to_string())?;
  let local_x = area.x - screen.display_info.x;
  let local_y = area.y - screen.display_info.y;
  let image = screen
    .capture_area(local_x, local_y, area.width, area.height)
    .map_err(|error| error.to_string())?;
  let mut bytes = Vec::new();
  DynamicImage::ImageRgba8(image)
    .write_to(&mut Cursor::new(&mut bytes), ImageOutputFormat::Png)
    .map_err(|error| error.to_string())?;
  let base64_png = general_purpose::STANDARD.encode(bytes);

  Ok(ScreenshotCaptureResult {
    image_data_url: format!("data:image/png;base64,{base64_png}"),
    width: area.width,
    height: area.height
  })
}

#[tauri::command]
fn submit_screenshot_capture(
  app: tauri::AppHandle,
  visibility_state: tauri::State<'_, SharedScreenshotVisibility>,
  payload: ScreenshotCapturePayload
) -> Result<(), String> {
  restore_screenshot_windows(&app, visibility_state.inner(), true);

  if let Some(window) = app.get_webview_window("main") {
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())?;
  }

  app.emit_to("main", SCREENSHOT_CAPTURE_EVENT, payload)
    .map_err(|error| error.to_string())
}

pub fn run() {
  let capture_bridge: SharedCaptureBridge = Arc::new(Mutex::new(CaptureBridgeState::default()));
  let screenshot_visibility: SharedScreenshotVisibility = Arc::new(Mutex::new(ScreenshotVisibilityState::default()));

  tauri::Builder::default()
    .manage(capture_bridge.clone())
    .manage(screenshot_visibility)
    .plugin(tauri_plugin_clipboard_manager::init())
    .plugin(tauri_plugin_global_shortcut::Builder::new().build())
    .plugin(
      tauri_plugin_window_state::Builder::new()
        .skip_initial_state("pet")
        .with_filter(|label| label != "pet")
        .build()
    )
    .setup(move |app| {
      start_capture_bridge(app.handle().clone(), capture_bridge.clone());
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      save_api_key,
      load_api_key,
      clear_api_key,
      get_capture_bridge_state,
      drain_pending_captures,
      reset_capture_count,
      undo_last_capture,
      capture_clipboard_text,
      open_capture_practice,
      hide_pet_window,
      open_screenshot_capture,
      cancel_screenshot_capture,
      capture_screen_area,
      submit_screenshot_capture
    ])
    .run(tauri::generate_context!())
    .expect("error while running TinyBu");
}

fn restore_screenshot_windows(app: &tauri::AppHandle, state: &SharedScreenshotVisibility, force_main: bool) {
  let visibility = match state.lock() {
    Ok(visibility) => ScreenshotVisibilityState {
      main_was_visible: visibility.main_was_visible,
      pet_was_visible: visibility.pet_was_visible
    },
    Err(error) => {
      eprintln!("TinyBu could not restore screenshot windows: {error}");
      ScreenshotVisibilityState::default()
    }
  };

  if (force_main || visibility.main_was_visible) && app.get_webview_window("main").is_some() {
    if let Some(window) = app.get_webview_window("main") {
      let _ = window.show();
    }
  }

  if visibility.pet_was_visible && app.get_webview_window("pet").is_some() {
    if let Some(window) = app.get_webview_window("pet") {
      let _ = window.show();
    }
  }
}

fn start_capture_bridge(app: tauri::AppHandle, state: SharedCaptureBridge) {
  thread::spawn(move || {
    let listener = match TcpListener::bind(CAPTURE_BRIDGE_ADDR) {
      Ok(listener) => listener,
      Err(error) => {
        eprintln!("TinyBu capture bridge could not bind {CAPTURE_BRIDGE_ADDR}: {error}");
        return;
      }
    };

    for stream in listener.incoming() {
      match stream {
        Ok(stream) => {
          let app = app.clone();
          let state = state.clone();
          thread::spawn(move || handle_bridge_stream(stream, app, state));
        }
        Err(error) => eprintln!("TinyBu capture bridge connection failed: {error}")
      }
    }
  });
}

fn handle_bridge_stream(mut stream: TcpStream, app: tauri::AppHandle, state: SharedCaptureBridge) {
  let (headers, body) = match read_http_request(&mut stream) {
    Ok(request) => request,
    Err(error) => {
      let _ = write_http_json(&mut stream, 400, &serde_json::json!({ "ok": false, "error": error }));
      return;
    }
  };

  let first_line = headers.lines().next().unwrap_or_default();
  let mut parts = first_line.split_whitespace();
  let method = parts.next().unwrap_or_default();
  let path = parts.next().unwrap_or_default();

  if method == "OPTIONS" {
    let _ = write_http_empty(&mut stream, 204);
    return;
  }

  if method == "POST" && path == "/v1/pet-visibility" {
    let payload = match serde_json::from_slice::<PetVisibilityPayload>(&body) {
      Ok(payload) => payload,
      Err(error) => {
        let _ = write_http_json(
          &mut stream,
          400,
          &serde_json::json!({ "ok": false, "error": format!("Invalid pet visibility payload: {error}") })
        );
        return;
      }
    };

    if let Some(window) = app.get_webview_window("pet") {
      let result = if payload.hidden { window.hide() } else { window.show() };
      if let Err(error) = result {
        eprintln!("TinyBu could not update pet visibility: {error}");
      }
    }

    let _ = write_http_json(&mut stream, 200, &serde_json::json!({ "ok": true }));
    return;
  }

  if method == "POST" && path == "/v1/clipboard-prompt" {
    let payload = match serde_json::from_slice::<ClipboardSuppressPayload>(&body) {
      Ok(payload) => payload,
      Err(error) => {
        let _ = write_http_json(
          &mut stream,
          400,
          &serde_json::json!({ "ok": false, "error": format!("Invalid clipboard prompt payload: {error}") })
        );
        return;
      }
    };

    if let Some(window) = app.get_webview_window("pet") {
      if let Err(error) = window.show() {
        eprintln!("TinyBu could not show pet window for clipboard prompt: {error}");
      }
    }

    if let Err(error) = app.emit_to("pet", CLIPBOARD_PROMPT_EVENT, payload) {
      eprintln!("TinyBu could not emit clipboard prompt event: {error}");
    }

    let _ = write_http_json(&mut stream, 200, &serde_json::json!({ "ok": true }));
    return;
  }

  if method == "POST" && path == "/v1/clipboard-suppress" {
    let payload = match serde_json::from_slice::<ClipboardSuppressPayload>(&body) {
      Ok(payload) => payload,
      Err(error) => {
        let _ = write_http_json(
          &mut stream,
          400,
          &serde_json::json!({ "ok": false, "error": format!("Invalid clipboard suppress payload: {error}") })
        );
        return;
      }
    };

    if let Err(error) = app.emit_to("pet", CLIPBOARD_SUPPRESS_EVENT, payload) {
      eprintln!("TinyBu could not emit clipboard suppress event: {error}");
    }

    let _ = write_http_json(&mut stream, 200, &serde_json::json!({ "ok": true }));
    return;
  }

  if method != "POST" || path != "/v1/captures" {
    let _ = write_http_json(&mut stream, 404, &serde_json::json!({ "ok": false, "error": "Not found" }));
    return;
  }

  let payload = match serde_json::from_slice::<ExternalCapturePayload>(&body) {
    Ok(payload) => payload,
    Err(error) => {
      let _ = write_http_json(
        &mut stream,
        400,
        &serde_json::json!({ "ok": false, "error": format!("Invalid capture payload: {error}") })
      );
      return;
    }
  };

  let snapshot = match store_capture(&app, &state, payload) {
    Ok(snapshot) => snapshot,
    Err(error) => {
      let _ = write_http_json(&mut stream, 500, &serde_json::json!({ "ok": false, "error": error }));
      return;
    }
  };

  let _ = write_http_json(
    &mut stream,
    200,
    &serde_json::json!({
      "ok": true,
      "count": snapshot.count,
      "pendingCount": snapshot.pending_count
    })
  );
}

fn store_capture(
  app: &tauri::AppHandle,
  state: &SharedCaptureBridge,
  payload: ExternalCapturePayload
) -> Result<CaptureBridgeSnapshot, String> {
  let snapshot = {
    let mut bridge = state.lock().map_err(|error| error.to_string())?;
    bridge.count = bridge.count.saturating_add(1);
    bridge.pending_captures.push(payload);
    bridge.snapshot()
  };

  emit_capture_bridge_state(app, &snapshot);
  Ok(snapshot)
}

fn emit_capture_bridge_state(app: &tauri::AppHandle, snapshot: &CaptureBridgeSnapshot) {
  if let Err(error) = app.emit_to("pet", CAPTURE_BRIDGE_EVENT, snapshot.clone()) {
    eprintln!("TinyBu could not emit capture bridge state: {error}");
  }

  if let Err(error) = app.emit_to("main", CAPTURE_BRIDGE_EVENT, snapshot.clone()) {
    eprintln!("TinyBu could not emit capture bridge state to main: {error}");
  }
}

fn read_http_request(stream: &mut TcpStream) -> Result<(String, Vec<u8>), String> {
  stream
    .set_read_timeout(Some(Duration::from_secs(2)))
    .map_err(|error| error.to_string())?;

  let mut data = Vec::new();
  let mut buffer = [0_u8; 8192];

  loop {
    let read = stream.read(&mut buffer).map_err(|error| error.to_string())?;
    if read == 0 {
      break;
    }

    data.extend_from_slice(&buffer[..read]);
    if data.len() > 200_000 {
      return Err("Capture request is too large.".to_string());
    }

    if let Some(header_end) = find_header_end(&data) {
      let headers = String::from_utf8_lossy(&data[..header_end]).to_string();
      let content_length = parse_content_length(&headers);
      let body_start = header_end + 4;
      let body_end = body_start + content_length;

      if data.len() >= body_end {
        return Ok((headers, data[body_start..body_end].to_vec()));
      }
    }
  }

  Err("Incomplete capture request.".to_string())
}

fn find_header_end(data: &[u8]) -> Option<usize> {
  data.windows(4).position(|window| window == b"\r\n\r\n")
}

fn parse_content_length(headers: &str) -> usize {
  headers
    .lines()
    .find_map(|line| {
      let (name, value) = line.split_once(':')?;
      if name.trim().eq_ignore_ascii_case("content-length") {
        value.trim().parse::<usize>().ok()
      } else {
        None
      }
    })
    .unwrap_or(0)
}

fn write_http_empty(stream: &mut TcpStream, status: u16) -> std::io::Result<()> {
  let reason = status_reason(status);
  write!(
    stream,
    "HTTP/1.1 {status} {reason}\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\nContent-Length: 0\r\n\r\n"
  )
}

fn write_http_json(stream: &mut TcpStream, status: u16, body: &serde_json::Value) -> std::io::Result<()> {
  let reason = status_reason(status);
  let body = body.to_string();
  write!(
    stream,
    "HTTP/1.1 {status} {reason}\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\nContent-Length: {}\r\n\r\n{}",
    body.len(),
    body
  )
}

fn status_reason(status: u16) -> &'static str {
  match status {
    200 => "OK",
    204 => "No Content",
    400 => "Bad Request",
    404 => "Not Found",
    500 => "Internal Server Error",
    _ => "OK"
  }
}
