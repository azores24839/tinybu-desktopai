# Swift Notch Focused Workflow Design

Date: 2026-06-21

## Outcome

TinyBu's Swift notch becomes a focused, native macOS surface for three short-lived actions:

1. capture the active display;
2. inspect all locally recognized text, then ask about the screenshot;
3. offer to save copied text to TinyBu Inbox.

The notch is not a second full TinyBu application. Classification, editing, tagging, and long-term organization remain in the main app. Tray remains screenshot-only.

## Product boundaries

- Apple Vision performs screenshot OCR locally. OCR never requires an API key or network request.
- AI is used only after the user asks a screenshot question.
- Tray contains screenshots only.
- Clipboard text is saved to the main TinyBu Inbox only after an explicit click.
- Existing pet mode remains intact. Only the selected desktop companion handles clipboard prompts.
- The removed Tauri notch must not return.

## Screenshot flow

### Initial state

The TinyBu tab opens on `Ask about this page`. The pet image is static. No stale result, progress indicator, screenshot, or question remains visible.

### Capture and Reading

Clicking `Ask about this page`:

1. starts the loading GIF immediately;
2. collapses the notch;
3. captures the currently active full display;
4. expands after capture;
5. shows `Reading this page…` with a native horizontal indeterminate progress bar;
6. runs accurate Apple Vision OCR on a background queue.

The progress bar communicates activity, not a fabricated percentage. Capture, OCR, Tray persistence, and AI answer timeouts are separate phases with phase-accurate errors.

### OCR text state

After local OCR and Tray persistence complete, the first result is an OCR text view:

- Back in the upper-left;
- close × in the upper-right;
- all recognized text in a native selectable text view;
- internal vertical scrolling;
- no screenshot;
- no Ask input.

The notch keeps a fixed outer size. Text is bounded to the existing OCR safety limits and displays a truncation note if required. Empty or failed OCR keeps the screenshot in Tray and provides a recoverable error state.

### Screenshot question state

Back from OCR text opens a shallow screenshot question view:

- screenshot on the left;
- one concise page description on the right;
- Ask input fixed below;
- existing typed and speech input remain available;
- close × returns to the TinyBu initial state without deleting the screenshot.

The page description is derived from local OCR without making a second network request. Asking sends the bounded AI image plus local OCR through the existing provider path. Failed AI requests retain the screenshot and typed question.

## Tray

Tray displays recent screenshot thumbnails inside the notch safe area.

- A screenshot with OCR opens directly in its OCR text state.
- A legacy screenshot without OCR runs local OCR first, shows Reading progress, persists the result, and then opens its OCR text state.
- Back from OCR text opens the screenshot question state.
- Hovering a thumbnail reveals a circular × in its upper-right corner.
- Clicking × permanently deletes immediately. There is no confirmation and no Undo in this version.
- The delete control owns an independent hit region and must never open the thumbnail or collapse the notch.
- Removing an item closes the grid gap smoothly.

Tray does not add text captures, editing, tags, categories, or other library management.

## Clipboard prompt

Every Cmd+C that yields text produces a fresh prompt, even when the text equals the previous clipboard value.

- The notch remains collapsed and does not take focus.
- A `Save?` capsule appears immediately to the right of the pet.
- The entire capsule is a native clickable control with a larger, non-overlapping hit area.
- Hover visibly highlights the capsule.
- The capsule does not display copied text.
- No action for five seconds dismisses it.
- Another Cmd+C restarts a full five-second opportunity.
- Clicking saves the complete text directly to TinyBu Inbox and briefly shows `Saved ✓` for about one second.
- The app never saves clipboard text without this click.
- This version has no save hotkey, preview, minimum-length filter, duplicate suppression, or Undo.
- Image and file clipboard contents are outside this scope.

Clipboard observation must avoid high-frequency polling, clipboard write-back loops, and duplicate prompts from both pet and notch. Sensitive text is not automatically persisted.

## Interaction and layout rules

- Use native AppKit controls and scrolling; do not overlay a WebView.
- Keep all content inside uniform safe insets that clear the notch's lower corner curves.
- Back, close, tabs, Tray thumbnails, delete ×, Save?, Ask, microphone, and send controls require independent and reliable native hit regions.
- Background mouse handling must not collapse the notch after a child control consumes a click.
- The collapsed pet anchor, loading GIF anchor, and expanded pet anchor must not drift or overflow.
- Keyboard focus enters Ask only in the screenshot question state.
- Controls receive accessibility labels and appropriate roles.

## State and data model

The Swift UI uses explicit states rather than visibility combinations:

- `initial`
- `capturing(jobID)`
- `reading(jobID, preview)`
- `ocrText(captureID)`
- `question(captureID)`
- `asking(jobID, captureID)`
- `failure(phase, captureID?)`

Every asynchronous response is correlated by job ID. Cancellation invalidates the job before UI reset. Late and duplicate callbacks are ignored.

Persisted screenshots retain bounded image data, local OCR text and lines, OCR language, truncation state, page description, and question history. Legacy records without OCR are migrated lazily when opened, without rewriting unrelated records.

Clipboard save uses a dedicated correlated native-to-main-app request and success/failure reply. `Saved ✓` appears only after Inbox persistence succeeds.

## Failure and cleanup

- Screenshot failure returns to a retryable TinyBu state.
- OCR failure still saves and exposes the screenshot.
- Tray persistence failure does not claim success.
- AI failure retains screenshot, OCR, and question input.
- Clipboard Inbox failure shows a short failure state and does not claim `Saved`.
- Capture temporary files are removed on success, failure, cancellation, timeout, and sidecar exit.
- Sidecar termination clears native jobs and triggers the existing safe companion fallback.
- Dev builds always synchronize the latest Swift sidecar into the exact Tauri executable path; packaged builds use the final release sidecar.

## Security

- OCR remains fully local.
- API keys remain macOS Keychain-only.
- No key enters project files, `.env`, browser storage, logs, IPC messages, screenshots, or tests.
- Clipboard text is sent to the app only after explicit Save and is not printed to logs.

## Verification contract

Completion requires all of the following:

1. Swift debug and release builds pass.
2. Rust check and tests, TypeScript typecheck, production frontend build, and regression tests pass.
3. Real Chinese and English screenshots complete capture → Reading → OCR text → Back → question → close.
4. Long, empty, failed, canceled, repeated, and timed-out OCR paths terminate correctly and retain the screenshot where possible.
5. Existing-OCR and lazy-OCR Tray records open correctly.
6. Hover delete permanently removes only the selected screenshot and never opens it.
7. All notch controls work across their whole visible hit area without accidental collapse.
8. Different and identical repeated Cmd+C actions each show a fresh five-second Save opportunity; clicked text reaches Inbox and ignored text is not saved.
9. Pet and notch modes never produce duplicate clipboard prompts.
10. Temporary-file and key-leak audits pass; dev and source sidecar hashes match; the final release sidecar is generated.

The work is not complete merely because it compiles or one happy path works.
