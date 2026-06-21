# Swift Notch Local OCR and AI Q&A Design

## Objective

Make Swift notch screenshot OCR reliable without a network connection or API key, while keeping AI questions optional and recoverable. A captured screenshot must always reach Tray even when OCR or AI fails.

## Responsibilities

- Swift sidecar: notch UI, loading animation, Apple Vision OCR, speech input, and task-state rendering.
- Rust/Tauri: display capture, temporary PNG lifecycle, sidecar IPC, job correlation, and routing events to React.
- React: database persistence, capture metadata, AI-provider routing, question history, and user-facing AI errors.

No API credentials or model-routing logic move into Swift.

## Capture and OCR Flow

1. User activates `Ask about this page`.
2. Swift starts `loading.gif`, collapses the notch, waits for the collapse animation, and sends `captureCurrentDisplay` with a unique job ID and display ID.
3. Rust captures the full display into a temporary PNG and records only its path, dimensions, and job state. It does not retain a full Base64 screenshot in the shared state.
4. Rust sends `screenshotCaptured` with the temporary path to Swift.
5. Swift loads both an `NSImage` preview and a `CGImage` for OCR before the file can be deleted, re-expands the notch, and displays `Reading this page…`.
6. Swift performs `VNRecognizeTextRequest` on a background queue using accurate recognition, language correction, and Chinese/English recognition languages.
7. Swift sends `ocrCompleted` with normalized text, visible lines, detected language hint, truncation state, and an optional OCR error.
8. Rust reads the temporary PNG, creates a bounded Tray image with a maximum 2,560-pixel long edge and JPEG quality around 0.86, then emits one combined capture event containing that image and the local OCR result.
9. React creates or updates one screenshot record in Tray and replies with `screenshotReady`.
10. Swift stops the loading GIF, restores the static pet, enables the question field, and retains the screenshot preview.

The temporary full-resolution PNG is deleted only after OCR has loaded its `CGImage` and React has received the bounded screenshot payload, or when the job is cancelled/times out. The database does not retain an unbounded Retina PNG.

## OCR Rules

- Framework: Apple Vision `VNRecognizeTextRequest`.
- Recognition level: accurate.
- Languages: Simplified Chinese, Traditional Chinese, and US English when supported by the installed macOS version.
- Language correction: enabled.
- Execution: dedicated background queue; never block AppKit’s main thread.
- Output order: observations sorted top-to-bottom, then left-to-right.
- Normalization: trim lines, remove empty duplicates, preserve paragraph order.
- IPC limit: at most 50,000 UTF-8 characters and 1,000 visible lines; set `truncated: true` when capped.
- Empty or failed OCR: store the image in Tray with an OCR-unavailable notice and keep AI visual questions enabled.

## AI Question Flow

1. User submits typed, F5 Dictation, or Speech-framework text.
2. Swift sends `askScreenshot` with job ID, capture ID, and question.
3. React loads the persisted capture and invokes the existing screenshot-question provider.
4. The request includes local OCR text and a resized screenshot for every notch-originated screenshot question, not only questions matched by a visual-keyword heuristic.
5. AI images are resized to a maximum 1,600-pixel long edge and encoded as JPEG at approximately 0.78 quality. The original Tray screenshot is not mutated.
6. The answer is saved to the existing screenshot question history and returned to Swift.
7. Swift displays the answer in the notch.

An AI failure keeps the screenshot, OCR text, and typed question available for retry.

## State Machine

States are `idle`, `collapsing`, `capturing`, `ocr`, `persisting`, `ready`, `asking`, and `failed`.

- Every transition carries one job ID.
- Late results for cancelled or superseded jobs are ignored.
- Starting a new capture cancels the old capture/OCR job.
- Closing the result returns to `idle` but never deletes the Tray record.
- Switching desktop mode or exiting clears jobs and temporary files.

## Error and Timeout Handling

- Screen permission/capture failure: restore static pet, expand, show a permission-specific retry message.
- OCR failure or 15-second timeout: save screenshot with an OCR notice, restore static pet, and allow AI visual questions.
- React persistence failure: keep the Swift preview, show `Couldn’t save to Tray`, and retain the temporary file until cleanup timeout.
- Missing AI configuration: show `Set up AI in TinyBu Settings`; do not label it as OCR failure.
- AI/network timeout: 45 seconds, preserve the question for retry.
- Sidecar termination or cancellation: clean all matching temporary files.

## Packaging and Permissions

- Link the Vision framework in the Swift package.
- Screen Recording permission remains owned by the TinyBu app.
- Vision OCR requires no additional privacy permission and works offline.
- Bundle static pet, loading GIF, and sidecar resources in debug and release builds.

## Verification

- Unit-test IPC parsing, job correlation, text normalization, output caps, stale-result rejection, and timeout cleanup.
- Test Chinese, English, mixed Chinese/English, empty images, Retina screenshots, and multiple displays.
- Test offline OCR with no API key.
- Test AI failure after successful OCR and verify the screenshot remains in Tray.
- Test rapid repeated captures and mode switching for stale results and temporary-file leaks.
- Verify loading GIF runs through collapse, capture, OCR, and persistence, then restores the static pet on success or failure.
- Run Swift debug/release builds, Rust tests/checks, TypeScript checks, regression tests, and macOS bundle validation.
