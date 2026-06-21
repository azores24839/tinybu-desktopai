use base64::{engine::general_purpose, Engine as _};
use image::{DynamicImage, ImageOutputFormat};
use screenshots::Screen;
use serde::{Deserialize, Serialize};
use std::{
  collections::{HashMap, HashSet},
  io::{Read, Write},
  io::Cursor,
  net::{TcpListener, TcpStream},
  sync::{Arc, Mutex},
  thread,
  time::Duration
};
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::GlobalShortcutExt;
use tauri_plugin_shell::{process::{CommandChild, CommandEvent}, ShellExt};

const SERVICE_NAME: &str = "TinyBu";
const OPENAI_ACCOUNT: &str = "openai_api_key";
const CAPTURE_BRIDGE_ADDR: &str = "127.0.0.1:1421";
const CAPTURE_BRIDGE_EVENT: &str = "tinybu-capture-bridge-updated";
const CLIPBOARD_PROMPT_EVENT: &str = "tinybu-clipboard-prompt";
const CLIPBOARD_SUPPRESS_EVENT: &str = "tinybu-clipboard-suppress";
const OPEN_CAPTURES_EVENT: &str = "tinybu-open-captures";
const SCREENSHOT_CAPTURE_EVENT: &str = "tinybu-screenshot-captured";
const DESKTOP_COMPANION_FALLBACK_EVENT: &str = "tinybu-desktop-companion-fallback";
const PET_MODE_ACTIVE_EVENT: &str = "tinybu-pet-mode-active";
const PET_CLIPBOARD_SHORTCUT: &str = "CommandOrControl+Shift+Space";
const SWIFT_NOTCH_SIDECAR: &str = "tinybu-notch";
const SWIFT_NOTCH_IPC_PREFIX: &str = "TINYBU_IPC ";
const SWIFT_NOTCH_CAPTURE_EVENT: &str = "tinybu-notch-capture-requested";
const SWIFT_NOTCH_QUESTION_EVENT: &str = "tinybu-notch-question-requested";
const SWIFT_NOTCH_CLIPBOARD_SAVE_EVENT: &str = "tinybu-notch-clipboard-save-requested";
const SWIFT_NOTCH_TRAY_DELETE_EVENT: &str = "tinybu-notch-tray-delete-requested";
const SWIFT_NOTCH_TRAY_OCR_EVENT: &str = "tinybu-notch-tray-ocr-requested";

type SharedCaptureBridge = Arc<Mutex<CaptureBridgeState>>;
type SharedScreenshotVisibility = Arc<Mutex<ScreenshotVisibilityState>>;
type SharedSwiftNotchState = Arc<Mutex<SwiftNotchState>>;

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
struct LocalOcrPayload {
  text: String,
  lines: Vec<String>,
  language: String,
  truncated: bool,
  error: Option<String>
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScreenshotCapturePayload {
  image_data_url: String,
  width: u32,
  height: u32,
  captured_at: String,
  capture_area: Option<ScreenshotArea>,
  local_ocr: Option<LocalOcrPayload>
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScreenshotCaptureResult {
  image_data_url: String,
  width: u32,
  height: u32
}

#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
enum SwiftNotchCommand {
  CaptureCurrentDisplay { job_id: String, display_id: u32 },
  OcrCompleted {
    job_id: String,
    text: String,
    lines: Vec<String>,
    language: String,
    truncated: bool,
    error: Option<String>
  },
  AskScreenshot { job_id: String, capture_id: String, question: String },
  SaveClipboard { job_id: String, text: String },
  DeleteTrayCapture { capture_id: String },
  TrayOcrCompleted {
    job_id: String,
    capture_id: String,
    text: String,
    lines: Vec<String>,
    language: String,
    truncated: bool,
    error: Option<String>
  },
  CancelJob { job_id: String }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SwiftNotchCaptureCompletion {
  job_id: String,
  capture_id: String,
  title: String,
  summary: String,
  ocr_text: String,
  ocr_truncated: bool
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SwiftNotchQuestionCompletion {
  job_id: String,
  answer: String
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SwiftNotchClipboardCompletion {
  job_id: String
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SwiftNotchClipboardSaveRequest {
  job_id: String,
  text: String
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SwiftNotchTraySyncRecord {
  capture_id: String,
  image_data_url: String,
  ocr_text: String,
  summary: String,
  ocr_truncated: bool
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SwiftNotchTrayOcrRequest {
  job_id: String,
  capture_id: String,
  text: String,
  lines: Vec<String>,
  language: String,
  truncated: bool,
  error: Option<String>
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SwiftNotchCaptureRequest {
  job_id: String,
  screenshot: ScreenshotCapturePayload
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SwiftNotchQuestionRequest {
  job_id: String,
  capture_id: String,
  question: String
}

#[derive(Default)]
struct CaptureBridgeState {
  count: u32,
  pending_captures: Vec<ExternalCapturePayload>
}

#[derive(Default)]
struct ScreenshotVisibilityState {
  main_was_visible: bool,
  pet_was_visible: bool,
  swift_notch_was_running: bool
}

struct SwiftNotchProcess {
  pid: u32,
  child: CommandChild
}

struct PendingNotchCapture {
  path: std::path::PathBuf,
  width: u32,
  height: u32,
  ocr_submitted: bool
}

#[derive(Default)]
struct SwiftNotchState {
  selected: bool,
  process: Option<SwiftNotchProcess>,
  active_jobs: HashSet<String>,
  capture_jobs: HashMap<String, PendingNotchCapture>,
  tray_paths: HashMap<String, std::path::PathBuf>
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
  visibility_state: tauri::State<'_, SharedScreenshotVisibility>,
  notch_state: tauri::State<'_, SharedSwiftNotchState>
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
  let swift_notch_was_running = stop_swift_notch(notch_state.inner())?;
  {
    let mut visibility = visibility_state.lock().map_err(|error| error.to_string())?;
    visibility.main_was_visible = main_was_visible;
    visibility.pet_was_visible = pet_was_visible;
    visibility.swift_notch_was_running = swift_notch_was_running;
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
      restore_screenshot_windows(&app, visibility_state.inner(), notch_state.inner(), false);
      error.to_string()
    })?;

  Ok(true)
}

#[tauri::command]
fn cancel_screenshot_capture(
  app: tauri::AppHandle,
  visibility_state: tauri::State<'_, SharedScreenshotVisibility>,
  notch_state: tauri::State<'_, SharedSwiftNotchState>
) -> Result<(), String> {
  if let Some(window) = app.get_webview_window("screenshot") {
    let _ = window.close();
  }

  restore_screenshot_windows(&app, visibility_state.inner(), notch_state.inner(), false);
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
  notch_state: tauri::State<'_, SharedSwiftNotchState>,
  payload: ScreenshotCapturePayload
) -> Result<(), String> {
  restore_screenshot_windows(&app, visibility_state.inner(), notch_state.inner(), true);

  if let Some(window) = app.get_webview_window("main") {
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())?;
  }

  app.emit_to("main", SCREENSHOT_CAPTURE_EVENT, payload)
    .map_err(|error| error.to_string())
}

#[tauri::command]
fn complete_swift_notch_capture(
  notch_state: tauri::State<'_, SharedSwiftNotchState>,
  payload: SwiftNotchCaptureCompletion
) -> Result<(), String> {
  let (is_active, capture) = {
    let mut state = notch_state.lock().map_err(|error| error.to_string())?;
    let is_active = state.active_jobs.contains(&payload.job_id);
    let capture = state.capture_jobs.remove(&payload.job_id);
    (is_active, capture)
  };
  if let Some(capture) = capture {
    let _ = std::fs::remove_file(capture.path);
  }
  if !is_active {
    return Ok(());
  }
  send_swift_notch_result(
    notch_state.inner(),
    &payload.job_id,
    serde_json::json!({
      "type": "screenshotReady",
      "jobId": payload.job_id,
      "captureId": payload.capture_id,
      "title": payload.title,
      "summary": payload.summary,
      "ocrText": payload.ocr_text,
      "ocrTruncated": payload.ocr_truncated
    })
  )
}

#[tauri::command]
fn complete_swift_notch_question(
  notch_state: tauri::State<'_, SharedSwiftNotchState>,
  payload: SwiftNotchQuestionCompletion
) -> Result<(), String> {
  send_swift_notch_result(
    notch_state.inner(),
    &payload.job_id,
    serde_json::json!({
      "type": "answerReady",
      "jobId": payload.job_id,
      "answer": payload.answer
    })
  )
}

#[tauri::command]
fn complete_swift_notch_clipboard_save(
  notch_state: tauri::State<'_, SharedSwiftNotchState>,
  payload: SwiftNotchClipboardCompletion
) -> Result<(), String> {
  send_swift_notch_result(
    notch_state.inner(),
    &payload.job_id,
    serde_json::json!({ "type": "clipboardSaved", "jobId": payload.job_id })
  )
}

#[tauri::command]
fn sync_swift_notch_tray(
  notch_state: tauri::State<'_, SharedSwiftNotchState>,
  records: Vec<SwiftNotchTraySyncRecord>
) -> Result<(), String> {
  let records = records.into_iter().take(5).collect::<Vec<_>>();
  let mut staged = Vec::with_capacity(records.len());
  for record in records {
    let staged_record = (|| -> Result<(SwiftNotchTraySyncRecord, std::path::PathBuf), String> {
      let (_, encoded) = record
        .image_data_url
        .split_once(',')
        .ok_or_else(|| "Tray screenshot is not a valid data URL.".to_string())?;
      if encoded.len() > 16_000_000 {
        return Err("Tray screenshot is too large.".to_string());
      }
      let bytes = general_purpose::STANDARD.decode(encoded).map_err(|error| error.to_string())?;
      let safe_id = record
        .capture_id
        .chars()
        .filter(|character| character.is_ascii_alphanumeric() || *character == '-')
        .collect::<String>();
      let path = std::env::temp_dir().join(format!("tinybu-tray-{}.jpg", safe_id));
      std::fs::write(&path, bytes).map_err(|error| error.to_string())?;
      Ok((record, path))
    })();
    match staged_record {
      Ok(staged_record) => staged.push(staged_record),
      Err(error) => {
        for (_, path) in staged {
          let _ = std::fs::remove_file(path);
        }
        return Err(error);
      }
    }
  }

  let message_records = staged
    .iter()
    .map(|(record, path)| {
      serde_json::json!({
        "captureId": record.capture_id,
        "previewPath": path.to_string_lossy(),
        "ocrText": record.ocr_text,
        "summary": record.summary,
        "ocrTruncated": record.ocr_truncated
      })
    })
    .collect::<Vec<_>>();

  {
    let mut state = notch_state.lock().map_err(|error| error.to_string())?;
    let next_ids = staged.iter().map(|(record, _)| record.capture_id.clone()).collect::<HashSet<_>>();
    let removed_ids = state
      .tray_paths
      .keys()
      .filter(|capture_id| !next_ids.contains(*capture_id))
      .cloned()
      .collect::<Vec<_>>();
    for capture_id in removed_ids {
      if let Some(path) = state.tray_paths.remove(&capture_id) {
        let _ = std::fs::remove_file(path);
      }
    }
    for (record, path) in &staged {
      state.tray_paths.insert(record.capture_id.clone(), path.clone());
    }
  }

  send_swift_notch_message(
    notch_state.inner(),
    &serde_json::json!({ "type": "traySnapshot", "records": message_records })
  )
}

#[tauri::command]
fn complete_swift_notch_tray_ocr(
  notch_state: tauri::State<'_, SharedSwiftNotchState>,
  payload: SwiftNotchClipboardCompletion
) -> Result<(), String> {
  send_swift_notch_result(
    notch_state.inner(),
    &payload.job_id,
    serde_json::json!({ "type": "trayOcrSaved", "jobId": payload.job_id })
  )
}

#[tauri::command]
fn fail_swift_notch_job(
  notch_state: tauri::State<'_, SharedSwiftNotchState>,
  job_id: String,
  message: String
) -> Result<(), String> {
  send_swift_notch_result(
    notch_state.inner(),
    &job_id,
    serde_json::json!({ "type": "failed", "jobId": job_id, "message": message })
  )
}

#[tauri::command]
fn set_desktop_companion_mode(
  app: tauri::AppHandle,
  notch_state: tauri::State<'_, SharedSwiftNotchState>,
  mode: String
) -> Result<(), String> {
  match mode.as_str() {
    "pet" => {
      stop_swift_notch(notch_state.inner())?;
      set_swift_notch_selected(notch_state.inner(), false)?;
      show_pet_window(&app)?;
      set_pet_mode_active(&app, true);
      Ok(())
    }
    "swift-notch" => {
      #[cfg(not(target_os = "macos"))]
      {
        set_swift_notch_selected(notch_state.inner(), false)?;
        show_pet_window(&app)?;
        set_pet_mode_active(&app, true);
        return Err("Swift notch is only available on macOS.".to_string());
      }

      #[cfg(target_os = "macos")]
      {
        set_swift_notch_selected(notch_state.inner(), true)?;
        set_pet_mode_active(&app, false);
        if let Err(error) = hide_pet_window(app.clone()) {
          let _ = set_swift_notch_selected(notch_state.inner(), false);
          set_pet_mode_active(&app, true);
          return Err(error);
        }
        if let Err(error) = start_swift_notch(&app, notch_state.inner()) {
          let _ = set_swift_notch_selected(notch_state.inner(), false);
          let _ = show_pet_window(&app);
          set_pet_mode_active(&app, true);
          return Err(error);
        }
        Ok(())
      }
    }
    _ => Err(format!("Unsupported desktop companion mode: {mode}"))
  }
}

#[tauri::command]
fn get_desktop_companion_mode(
  notch_state: tauri::State<'_, SharedSwiftNotchState>
) -> Result<&'static str, String> {
  let state = notch_state.lock().map_err(|error| error.to_string())?;
  Ok(if state.selected { "swift-notch" } else { "pet" })
}

fn start_swift_notch(app: &tauri::AppHandle, state: &SharedSwiftNotchState) -> Result<(), String> {
  {
    let state = state.lock().map_err(|error| error.to_string())?;
    if state.process.is_some() {
      return Ok(());
    }
  }

  let source_asset_path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
    .join("../native/notch-prototype/Assets/islandpet.png");
  let bundled_asset_path = app
    .path()
    .resource_dir()
    .map_err(|error| error.to_string())?
    .join("islandpet.png");
  let island_pet_path = if source_asset_path.exists() { source_asset_path } else { bundled_asset_path };
  let source_loading_path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
    .join("../native/notch-prototype/Assets/loading.gif");
  let bundled_loading_path = app
    .path()
    .resource_dir()
    .map_err(|error| error.to_string())?
    .join("loading.gif");
  let island_pet_loading_path = if source_loading_path.exists() {
    source_loading_path
  } else {
    bundled_loading_path
  };

  let (mut events, child) = app
    .shell()
    .sidecar(SWIFT_NOTCH_SIDECAR)
    .map_err(|error| error.to_string())?
    .args(["--parent-pid", &std::process::id().to_string()])
    .arg("--island-pet-path")
    .arg(island_pet_path)
    .arg("--island-pet-loading-path")
    .arg(island_pet_loading_path)
    .spawn()
    .map_err(|error| error.to_string())?;
  let pid = child.pid();

  {
    let mut state = state.lock().map_err(|error| error.to_string())?;
    state.process = Some(SwiftNotchProcess { pid, child });
  }

  let app = app.clone();
  let state = state.clone();
  tauri::async_runtime::spawn(async move {
    let mut stdout_buffer = String::new();
    while let Some(event) = events.recv().await {
      match event {
        CommandEvent::Stdout(bytes) => {
          stdout_buffer.push_str(&String::from_utf8_lossy(&bytes));
          while let Some(newline_index) = stdout_buffer.find('\n') {
            let line = stdout_buffer[..newline_index].trim().to_string();
            stdout_buffer.drain(..=newline_index);
            if let Some(json) = line.strip_prefix(SWIFT_NOTCH_IPC_PREFIX) {
              match serde_json::from_str::<SwiftNotchCommand>(json) {
                Ok(command) => handle_swift_notch_command(&app, &state, command),
                Err(error) => eprintln!("TinyBu Swift notch sent invalid IPC: {error}")
              }
            }
          }
        }
        CommandEvent::Stderr(bytes) => {
          eprint!("{}", String::from_utf8_lossy(&bytes));
        }
        CommandEvent::Terminated(_) | CommandEvent::Error(_) => {
          let exited_unexpectedly = match state.lock() {
            Ok(mut state) if state.process.as_ref().map(|process| process.pid) == Some(pid) => {
              state.process.take();
              state.selected = false;
              state.active_jobs.clear();
              for capture in state.capture_jobs.drain().map(|(_, capture)| capture) {
                let _ = std::fs::remove_file(capture.path);
              }
              for path in state.tray_paths.drain().map(|(_, path)| path) {
                let _ = std::fs::remove_file(path);
              }
              true
            }
            _ => false
          };

          if exited_unexpectedly {
            let _ = show_pet_window(&app);
            set_pet_mode_active(&app, true);
            let _ = app.emit_to("main", DESKTOP_COMPANION_FALLBACK_EVENT, "pet");
          }
          break;
        }
        _ => {}
      }
    }
  });

  Ok(())
}

fn handle_swift_notch_command(
  app: &tauri::AppHandle,
  state: &SharedSwiftNotchState,
  command: SwiftNotchCommand
) {
  match command {
    SwiftNotchCommand::CaptureCurrentDisplay { job_id, display_id } => {
      if let Ok(mut notch) = state.lock() {
        notch.active_jobs.insert(job_id.clone());
      }

      if let Err(error) = send_swift_notch_message(
        state,
        &serde_json::json!({ "type": "captureStarted", "jobId": job_id })
      ) {
        eprintln!("TinyBu could not acknowledge notch capture: {error}");
      }

      match capture_full_display(display_id, &job_id) {
        Ok(capture) => {
          let preview_path_string = capture.path.to_string_lossy().to_string();
          if let Ok(mut notch) = state.lock() {
            notch.capture_jobs.insert(job_id.clone(), capture);
          }
          let timeout_state = state.clone();
          let timeout_job_id = job_id.clone();
          thread::spawn(move || {
            thread::sleep(Duration::from_secs(60));
            let pending_phase = timeout_state
              .lock()
              .ok()
              .and_then(|notch| {
                if !notch.active_jobs.contains(&timeout_job_id) {
                  return None;
                }
                notch.capture_jobs.get(&timeout_job_id).map(|capture| capture.ocr_submitted)
              });
            if let Some(ocr_submitted) = pending_phase {
              let message = if ocr_submitted {
                "Saving the screenshot to Tray timed out. The screenshot remains visible so you can retry."
              } else {
                "Local text recognition did not respond. Please try the screenshot again."
              };
              let _ = send_swift_notch_result(
                &timeout_state,
                &timeout_job_id,
                serde_json::json!({
                  "type": "failed",
                  "jobId": timeout_job_id,
                  "message": message
                })
              );
            }
          });
          if let Err(error) = send_swift_notch_message(
            state,
            &serde_json::json!({
              "type": "screenshotCaptured",
              "jobId": job_id,
              "previewPath": preview_path_string
            })
          ) {
            eprintln!("TinyBu could not show the captured screenshot in the notch: {error}");
            let _ = send_swift_notch_result(
              state,
              &job_id,
              serde_json::json!({
                "type": "failed",
                "jobId": job_id,
                "message": "TinyBu could not start local screenshot recognition."
              })
            );
          }
        }
        Err(error) => {
          let _ = send_swift_notch_result(
            state,
            &job_id,
            serde_json::json!({ "type": "failed", "jobId": job_id, "message": error })
          );
        }
      }
    }
    SwiftNotchCommand::OcrCompleted { job_id, text, lines, language, truncated, error } => {
      let capture = {
        let mut notch = match state.lock() {
          Ok(notch) => notch,
          Err(lock_error) => {
            eprintln!("TinyBu could not access notch capture state: {lock_error}");
            return;
          }
        };
        if !notch.active_jobs.contains(&job_id) {
          return;
        }
        match notch.capture_jobs.get_mut(&job_id) {
          Some(capture) if !capture.ocr_submitted => {
            capture.ocr_submitted = true;
            Some((capture.path.clone(), capture.width, capture.height))
          }
          _ => None
        }
      };
      let Some((path, width, height)) = capture else { return };
      let ocr = LocalOcrPayload { text, lines, language, truncated, error };
      match build_notch_capture_payload(&path, width, height, ocr) {
        Ok(screenshot) => {
          let payload = SwiftNotchCaptureRequest { job_id, screenshot };
          let failure_job_id = payload.job_id.clone();
          if let Err(emit_error) = app.emit_to("main", SWIFT_NOTCH_CAPTURE_EVENT, payload) {
            eprintln!("TinyBu could not route notch capture: {emit_error}");
            let _ = send_swift_notch_result(
              state,
              &failure_job_id,
              serde_json::json!({
                "type": "failed",
                "jobId": failure_job_id,
                "message": "TinyBu main app is not ready to save this screenshot."
              })
            );
          }
        }
        Err(payload_error) => {
          let _ = send_swift_notch_result(
            state,
            &job_id,
            serde_json::json!({ "type": "failed", "jobId": job_id, "message": payload_error })
          );
        }
      }
    }
    SwiftNotchCommand::AskScreenshot { job_id, capture_id, question } => {
      let question = question.trim().to_string();
      if question.is_empty() {
        return;
      }
      if let Ok(mut notch) = state.lock() {
        notch.active_jobs.insert(job_id.clone());
      }
      schedule_swift_job_timeout(state, &job_id, 90, "AI question timed out. Your screenshot and question are still available.");
      let payload = SwiftNotchQuestionRequest { job_id, capture_id, question };
      let failure_job_id = payload.job_id.clone();
      if let Err(error) = app.emit_to("main", SWIFT_NOTCH_QUESTION_EVENT, payload) {
        eprintln!("TinyBu could not route notch question: {error}");
        let _ = send_swift_notch_result(
          state,
          &failure_job_id,
          serde_json::json!({
            "type": "failed",
            "jobId": failure_job_id,
            "message": "TinyBu main app is not ready to answer this question."
          })
        );
      }
    }
    SwiftNotchCommand::SaveClipboard { job_id, text } => {
      if text.trim().is_empty() {
        return;
      }
      if let Ok(mut notch) = state.lock() {
        notch.active_jobs.insert(job_id.clone());
      }
      schedule_swift_job_timeout(state, &job_id, 10, "Saving copied text timed out. Please click Save again.");
      let payload = SwiftNotchClipboardSaveRequest { job_id, text };
      let failure_job_id = payload.job_id.clone();
      if let Err(error) = app.emit_to("main", SWIFT_NOTCH_CLIPBOARD_SAVE_EVENT, payload) {
        eprintln!("TinyBu could not route notch clipboard save: {error}");
        let _ = send_swift_notch_result(
          state,
          &failure_job_id,
          serde_json::json!({
            "type": "failed",
            "jobId": failure_job_id,
            "message": "TinyBu could not save this copied text."
          })
        );
      }
    }
    SwiftNotchCommand::DeleteTrayCapture { capture_id } => {
      if let Err(error) = app.emit_to("main", SWIFT_NOTCH_TRAY_DELETE_EVENT, capture_id) {
        eprintln!("TinyBu could not route notch Tray deletion: {error}");
      }
    }
    SwiftNotchCommand::TrayOcrCompleted {
      job_id,
      capture_id,
      text,
      lines,
      language,
      truncated,
      error
    } => {
      if let Ok(mut notch) = state.lock() {
        notch.active_jobs.insert(job_id.clone());
      }
      schedule_swift_job_timeout(state, &job_id, 15, "Saving recognized text to Tray timed out. Please try again.");
      let payload = SwiftNotchTrayOcrRequest {
        job_id,
        capture_id,
        text,
        lines,
        language,
        truncated,
        error
      };
      let failure_job_id = payload.job_id.clone();
      if let Err(emit_error) = app.emit_to("main", SWIFT_NOTCH_TRAY_OCR_EVENT, payload) {
        eprintln!("TinyBu could not persist notch Tray OCR: {emit_error}");
        let _ = send_swift_notch_result(
          state,
          &failure_job_id,
          serde_json::json!({
            "type": "failed",
            "jobId": failure_job_id,
            "message": "TinyBu could not save the recognized text."
          })
        );
      }
    }
    SwiftNotchCommand::CancelJob { job_id } => {
      if let Ok(mut notch) = state.lock() {
        notch.active_jobs.remove(&job_id);
        if let Some(capture) = notch.capture_jobs.remove(&job_id) {
          let _ = std::fs::remove_file(capture.path);
        }
      }
    }
  }
}

fn schedule_swift_job_timeout(
  state: &SharedSwiftNotchState,
  job_id: &str,
  seconds: u64,
  message: &'static str
) {
  let timeout_state = state.clone();
  let timeout_job_id = job_id.to_string();
  thread::spawn(move || {
    thread::sleep(Duration::from_secs(seconds));
    let is_active = timeout_state
      .lock()
      .map(|notch| notch.active_jobs.contains(&timeout_job_id))
      .unwrap_or(false);
    if is_active {
      let _ = send_swift_notch_result(
        &timeout_state,
        &timeout_job_id,
        serde_json::json!({ "type": "failed", "jobId": timeout_job_id, "message": message })
      );
    }
  });
}

fn capture_full_display(
  display_id: u32,
  job_id: &str
) -> Result<PendingNotchCapture, String> {
  let screens = Screen::all().map_err(|error| error.to_string())?;
  let screen = screens
    .iter()
    .find(|screen| screen.display_info.id == display_id)
    .or_else(|| screens.iter().find(|screen| screen.display_info.is_primary))
    .or_else(|| screens.first())
    .ok_or_else(|| "Unable to find a display for screenshot capture.".to_string())?;
  let image = screen.capture().map_err(|error| error.to_string())?;
  let width = image.width();
  let height = image.height();
  let mut bytes = Vec::new();
  DynamicImage::ImageRgba8(image)
    .write_to(&mut Cursor::new(&mut bytes), ImageOutputFormat::Png)
    .map_err(|error| error.to_string())?;
  let preview_path = std::env::temp_dir().join(format!("tinybu-notch-{job_id}.png"));
  std::fs::write(&preview_path, &bytes).map_err(|error| error.to_string())?;

  Ok(PendingNotchCapture { path: preview_path, width, height, ocr_submitted: false })
}

fn build_notch_capture_payload(
  path: &std::path::Path,
  original_width: u32,
  original_height: u32,
  local_ocr: LocalOcrPayload
) -> Result<ScreenshotCapturePayload, String> {
  let image = image::open(path).map_err(|error| error.to_string())?;
  let resized = if original_width.max(original_height) > 2_560 {
    image.resize(2_560, 2_560, image::imageops::FilterType::Lanczos3)
  } else {
    image
  };
  let width = resized.width();
  let height = resized.height();
  let mut bytes = Vec::new();
  resized
    .write_to(&mut Cursor::new(&mut bytes), ImageOutputFormat::Jpeg(86))
    .map_err(|error| error.to_string())?;
  Ok(ScreenshotCapturePayload {
    image_data_url: format!("data:image/jpeg;base64,{}", general_purpose::STANDARD.encode(bytes)),
    width,
    height,
    captured_at: String::new(),
    capture_area: None,
    local_ocr: Some(local_ocr)
  })
}

fn send_swift_notch_result(
  state: &SharedSwiftNotchState,
  job_id: &str,
  message: serde_json::Value
) -> Result<(), String> {
  let mut notch = state.lock().map_err(|error| error.to_string())?;
  if !notch.active_jobs.remove(job_id) {
    return Ok(());
  }
  if message.get("type").and_then(|value| value.as_str()) == Some("failed") {
    if let Some(capture) = notch.capture_jobs.remove(job_id) {
      let _ = std::fs::remove_file(capture.path);
    }
  }
  let process = notch.process.as_mut().ok_or_else(|| "Swift notch is not running.".to_string())?;
  let mut line = serde_json::to_vec(&message).map_err(|error| error.to_string())?;
  line.push(b'\n');
  process.child.write(&line).map_err(|error| error.to_string())
}

fn send_swift_notch_message(state: &SharedSwiftNotchState, message: &serde_json::Value) -> Result<(), String> {
  let mut notch = state.lock().map_err(|error| error.to_string())?;
  let process = notch.process.as_mut().ok_or_else(|| "Swift notch is not running.".to_string())?;
  let mut line = serde_json::to_vec(message).map_err(|error| error.to_string())?;
  line.push(b'\n');
  process.child.write(&line).map_err(|error| error.to_string())
}

fn stop_swift_notch(state: &SharedSwiftNotchState) -> Result<bool, String> {
  let process = {
    let mut state = state.lock().map_err(|error| error.to_string())?;
    state.active_jobs.clear();
    for capture in state.capture_jobs.drain().map(|(_, capture)| capture) {
      let _ = std::fs::remove_file(capture.path);
    }
    for path in state.tray_paths.drain().map(|(_, path)| path) {
      let _ = std::fs::remove_file(path);
    }
    state.process.take()
  };

  if let Some(process) = process {
    if let Err(error) = process.child.kill() {
      eprintln!("TinyBu Swift notch was already stopped: {error}");
    }
    return Ok(true);
  }

  Ok(false)
}

fn set_swift_notch_selected(state: &SharedSwiftNotchState, selected: bool) -> Result<(), String> {
  let mut state = state.lock().map_err(|error| error.to_string())?;
  state.selected = selected;
  Ok(())
}

fn show_pet_window(app: &tauri::AppHandle) -> Result<(), String> {
  if let Some(window) = app.get_webview_window("pet") {
    window.show().map_err(|error| error.to_string())?;
  }
  Ok(())
}

fn set_pet_mode_active(app: &tauri::AppHandle, active: bool) {
  if !active {
    let _ = app.global_shortcut().unregister(PET_CLIPBOARD_SHORTCUT);
  }
  let _ = app.emit_to("pet", PET_MODE_ACTIVE_EVENT, active);
}

pub fn run() {
  let capture_bridge: SharedCaptureBridge = Arc::new(Mutex::new(CaptureBridgeState::default()));
  let screenshot_visibility: SharedScreenshotVisibility = Arc::new(Mutex::new(ScreenshotVisibilityState::default()));
  let swift_notch_state: SharedSwiftNotchState = Arc::new(Mutex::new(SwiftNotchState::default()));

  let app = tauri::Builder::default()
    .manage(capture_bridge.clone())
    .manage(screenshot_visibility)
    .manage(swift_notch_state)
    .plugin(tauri_plugin_clipboard_manager::init())
    .plugin(tauri_plugin_global_shortcut::Builder::new().build())
    .plugin(tauri_plugin_shell::init())
    .plugin(
      tauri_plugin_window_state::Builder::new()
        .skip_initial_state("pet")
        .with_filter(|label| label != "pet")
        .build()
    )
    .setup(move |app| {
      let notch_state = app.state::<SharedSwiftNotchState>().inner().clone();
      start_capture_bridge(app.handle().clone(), capture_bridge.clone(), notch_state);
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
      submit_screenshot_capture,
      complete_swift_notch_capture,
      complete_swift_notch_question,
      complete_swift_notch_clipboard_save,
      sync_swift_notch_tray,
      complete_swift_notch_tray_ocr,
      fail_swift_notch_job,
      set_desktop_companion_mode,
      get_desktop_companion_mode
    ])
    .build(tauri::generate_context!())
    .expect("error while building TinyBu");

  app.run(|app, event| {
    if let tauri::RunEvent::Exit = event {
      let state = app.state::<SharedSwiftNotchState>();
      let _ = stop_swift_notch(state.inner());
    }
  });
}

fn restore_screenshot_windows(
  app: &tauri::AppHandle,
  state: &SharedScreenshotVisibility,
  notch_state: &SharedSwiftNotchState,
  force_main: bool
) {
  let visibility = match state.lock() {
    Ok(visibility) => ScreenshotVisibilityState {
      main_was_visible: visibility.main_was_visible,
      pet_was_visible: visibility.pet_was_visible,
      swift_notch_was_running: visibility.swift_notch_was_running
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

  if visibility.swift_notch_was_running {
    if let Err(error) = start_swift_notch(app, notch_state) {
      eprintln!("TinyBu could not restore the Swift notch after screenshot capture: {error}");
      let _ = set_swift_notch_selected(notch_state, false);
      let _ = show_pet_window(app);
      set_pet_mode_active(app, true);
      let _ = app.emit_to("main", DESKTOP_COMPANION_FALLBACK_EVENT, "pet");
    }
  }
}

fn start_capture_bridge(
  app: tauri::AppHandle,
  state: SharedCaptureBridge,
  notch_state: SharedSwiftNotchState
) {
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
          let notch_state = notch_state.clone();
          thread::spawn(move || handle_bridge_stream(stream, app, state, notch_state));
        }
        Err(error) => eprintln!("TinyBu capture bridge connection failed: {error}")
      }
    }
  });
}

fn handle_bridge_stream(
  mut stream: TcpStream,
  app: tauri::AppHandle,
  state: SharedCaptureBridge,
  notch_state: SharedSwiftNotchState
) {
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
      let notch_is_active = notch_state.lock().map(|state| state.selected).unwrap_or(false);
      let result = if payload.hidden || notch_is_active { window.hide() } else { window.show() };
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

    let notch_is_active = notch_state.lock().map(|state| state.selected).unwrap_or(false);
    if !notch_is_active {
      if let Some(window) = app.get_webview_window("pet") {
        if let Err(error) = window.show() {
          eprintln!("TinyBu could not show pet window for clipboard prompt: {error}");
        }
      }

      if let Err(error) = app.emit_to("pet", CLIPBOARD_PROMPT_EVENT, payload) {
        eprintln!("TinyBu could not emit clipboard prompt event: {error}");
      }
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

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn swift_notch_ipc_parses_capture_and_question_jobs() {
    let capture = serde_json::from_str::<SwiftNotchCommand>(
      r#"{"type":"captureCurrentDisplay","jobId":"capture-1","displayId":7}"#
    ).expect("capture command should parse");
    match capture {
      SwiftNotchCommand::CaptureCurrentDisplay { job_id, display_id } => {
        assert_eq!(job_id, "capture-1");
        assert_eq!(display_id, 7);
      }
      _ => panic!("expected capture command")
    }

    let ocr = serde_json::from_str::<SwiftNotchCommand>(
      r#"{"type":"ocrCompleted","jobId":"capture-1","text":"你好","lines":["你好"],"language":"zh","truncated":false}"#
    ).expect("OCR command should parse");
    match ocr {
      SwiftNotchCommand::OcrCompleted { job_id, text, lines, language, truncated, error } => {
        assert_eq!(job_id, "capture-1");
        assert_eq!(text, "你好");
        assert_eq!(lines, vec!["你好"]);
        assert_eq!(language, "zh");
        assert!(!truncated);
        assert!(error.is_none());
      }
      _ => panic!("expected OCR command")
    }

    let question = serde_json::from_str::<SwiftNotchCommand>(
      r#"{"type":"askScreenshot","jobId":"question-1","captureId":"capture-a","question":"What is this?"}"#
    ).expect("question command should parse");
    match question {
      SwiftNotchCommand::AskScreenshot { job_id, capture_id, question } => {
        assert_eq!(job_id, "question-1");
        assert_eq!(capture_id, "capture-a");
        assert_eq!(question, "What is this?");
      }
      _ => panic!("expected question command")
    }

    let clipboard = serde_json::from_str::<SwiftNotchCommand>(
      r#"{"type":"saveClipboard","jobId":"clipboard-1","text":"same copied text"}"#
    ).expect("clipboard save command should parse");
    match clipboard {
      SwiftNotchCommand::SaveClipboard { job_id, text } => {
        assert_eq!(job_id, "clipboard-1");
        assert_eq!(text, "same copied text");
      }
      _ => panic!("expected clipboard save command")
    }

    let tray_ocr = serde_json::from_str::<SwiftNotchCommand>(
      r#"{"type":"trayOcrCompleted","jobId":"tray-1","captureId":"capture-a","text":"Text","lines":["Text"],"language":"en","truncated":false}"#
    ).expect("Tray OCR command should parse");
    match tray_ocr {
      SwiftNotchCommand::TrayOcrCompleted { job_id, capture_id, text, .. } => {
        assert_eq!(job_id, "tray-1");
        assert_eq!(capture_id, "capture-a");
        assert_eq!(text, "Text");
      }
      _ => panic!("expected Tray OCR command")
    }
  }
}
