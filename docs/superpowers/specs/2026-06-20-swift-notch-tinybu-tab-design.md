# Swift Notch TinyBu Tab Design

## Scope

Extend the existing native Swift notch without changing pet mode. The expanded notch gains two tabs, `TinyBu` on the left and `Tray` on the right. It opens on `TinyBu` by default. The work also fixes the island pet animation anchor and adds full-screen visual Q&A with typed or spoken questions.

## Interaction

### Island pet

- The collapsed pet keeps its current small size.
- The pet uses a fixed top-left visual anchor in collapsed and expanded states.
- Expanding changes its size without moving that anchor upward or sideways.
- The pet remains inside the black island in both states and does not intercept pointer events.

### Tabs

- Expanded state shows `TinyBu` then `Tray`, left to right.
- Every new expansion defaults to `TinyBu`.
- `Tray` retains the existing collected-image list, preview, delete, and image-question behavior.
- Switching tabs does not discard the active screenshot or an in-progress answer.

### Ask about this page

The initial TinyBu view shows `Ask about this page`. Activating it:

1. Collapses the notch and waits for the collapse animation to finish.
2. Keeps the collapsed notch and pet visible.
3. Captures the entire currently active display, equivalent in scope to a single-display Command-Shift-3 capture.
4. Stores the screenshot in Tray.
5. Runs the existing screenshot-recognition pipeline.
6. Re-expands the notch on the TinyBu tab and shows the recognized screenshot with a question field.

The current display is the display containing the notch panel at capture time, falling back to the main display.

### Questions and answers

- The question field accepts typing and speech transcription.
- Sending reuses the existing screenshot-question provider and persistence logic.
- Loading, answer, and error states appear directly in the TinyBu tab.
- A successful answer is stored with the screenshot's existing question history.
- Starting another page capture cancels the visible task while safely ignoring any late result from it.

### Voice input

- Clicking the microphone once starts recording; clicking again stops.
- Final transcription is inserted into the question field and is not sent automatically.
- The Speech framework locale follows the currently selected keyboard input source when it maps to a supported Chinese or English locale; otherwise it falls back to the current system locale.
- Pressing the user's configured F5 shortcut continues to invoke macOS system Dictation in the focused native text field.
- The app does not synthesize F5 or use private Dictation APIs.

## Architecture

### Responsibilities

- Swift owns native notch presentation, tab state, microphone capture, and rendering task states.
- Rust owns the sidecar lifecycle, current-display capture, IPC routing, and job correlation.
- The React application owns recognition, AI provider routing, API credentials, database persistence, Tray records, and screenshot question history.

No AI credentials or provider logic move into the Swift executable.

### Sidecar IPC

Use the sidecar's existing stdin/stdout pipes. Messages are newline-delimited JSON prefixed with a fixed protocol marker. Swift protocol messages go to stdout; diagnostics go to stderr. Rust sends responses through the child's stdin.

Every request contains a unique job ID. Supported message families are:

- Swift to Rust: capture current display, ask screenshot question, cancel job.
- Rust to Swift: capture started, recognition started, screenshot ready, answer ready, permission denied, and failed.
- React to Rust: recognition result and question result through narrowly scoped Tauri commands.

Images never travel through stdin or stdout. Rust passes the capture to the existing React screenshot pipeline, and Swift receives only job metadata, display-ready status, and text results.

## State and lifecycle

Rust keeps a small in-memory job table keyed by job ID. Each job records its capture identity and latest state. React receives the job ID with the screenshot payload and returns it with results. Swift ignores results whose job ID is no longer active.

Stopping or switching away from Swift notch clears pending jobs. A sidecar restart starts with no assumed pending work. Persisted screenshots and completed answers remain in the existing TinyBu database.

## Permissions

- Screen capture uses the existing macOS screen-recording path and permission behavior.
- Microphone and speech-recognition usage descriptions are included in the macOS app metadata.
- Permission denial produces an inline explanation and retry action; it does not switch desktop companion mode or crash the sidecar.
- System Dictation via F5 remains controlled entirely by macOS.

## Failure handling

- Capture failure: show an inline error and leave Tray unchanged.
- Recognition failure after capture: keep the screenshot in Tray with a retryable diagnostic state.
- Question failure: keep the question text and screenshot, then allow retry.
- Sidecar IPC parse failure: log to stderr, reject only that message, and keep the process alive.
- Late or duplicate result: ignore it by job ID.

## Verification

- Unit-test message parsing, job correlation, stale-result rejection, and locale mapping.
- Regression-test that pet mode and existing desktop companion selection remain unchanged.
- Verify full-screen capture stores one screenshot in Tray and leaves the collapsed notch visible in the image.
- Verify TinyBu is the default expanded tab and Tray remains usable.
- Verify the pet's top-left anchor is unchanged across expansion.
- Verify typed questions and microphone transcription populate the same input field.
- Verify screen, microphone, and speech permission denial states.
- Build the Swift sidecar, run Rust checks, TypeScript checks, and the existing regression suite.
