# Desktop Companion Mode Design

## Goal

Add one persisted, mutually exclusive desktop appearance setting to TinyBu:

- `pet`: show the existing Tauri pet window and stop the Swift notch process.
- `swift-notch`: hide the pet window and run the existing native Swift notch.

Changing the setting takes effect when Settings is saved. Existing users default to `pet`. The visual design and feature behavior inside both companions remain unchanged.

## Chosen approach

Tauri owns the Swift notch as a bundled sidecar process. SwiftPM continues to own the native source. Build scripts compile the sidecar automatically for development and release packaging, so Swift code can keep changing without manual copying.

Rejected alternatives:

- Calling `swift run` at runtime would require Xcode Command Line Tools on every user's Mac and would expose source/build latency in production.
- Treating the Swift app as an independently installed application would make switching, upgrades, and duplicate-process prevention unreliable.
- Reimplementing the notch in Rust or Tauri would discard the native Swift implementation that this feature is meant to preserve.

## State and migration

Add `desktopCompanionMode: "pet" | "swift-notch"` to `AppSettings`, with `"pet"` in `defaultSettings`.

The existing `loadAppState` settings merge provides migration: records without the field receive the default. No database schema change is needed because the settings object is stored as part of the existing app-state record.

The Settings page adds a two-option pill control under `Desktop / extension`. The choice is edited in the existing draft and applied by the existing Save action, so navigating away without saving does not change the running companion.

## Runtime lifecycle

Expose one Tauri command:

```text
set_desktop_companion_mode(mode)
```

Rust validates the string rather than accepting arbitrary executable names.

For `swift-notch`:

1. Suspend the pet clipboard watcher and release its global shortcut.
2. Hide the pet window.
3. If the managed notch child is already alive, do nothing.
4. Start the bundled `tinybu-notch` sidecar and retain its child handle.
5. If launch fails, show and reactivate the pet, then return an error.

For `pet`:

1. Stop the managed notch child if present.
2. Show the pet window.
3. Restore the pet clipboard watcher and its shortcut if the user had enabled it.

The main frontend invokes the command after loading persisted app state and after a Settings save changes the mode. A failed Settings switch does not persist the requested mode: the UI restores the previous value and shows an error toast. If restoring a previously saved `swift-notch` mode fails during startup, TinyBu persists the safe `pet` fallback and shows the pet. This keeps stored state aligned with what is actually visible.

On TinyBu shutdown, Rust terminates its managed sidecar. The Swift executable also receives the TinyBu parent PID and exits if the parent disappears, covering crashes and forced termination. The retained child handle prevents duplicate notch instances within one TinyBu process.

Screenshot capture temporarily stops the Swift sidecar so the notch is not captured in the image, then restores it afterward. Rust tracks the selected mode separately from the temporary child-process state, so browser-extension visibility requests cannot reveal the pet during this interval.

## Development and packaging

Add one small shell build script under `scripts/` that:

1. Detects macOS and the current Rust host target (`aarch64-apple-darwin` or `x86_64-apple-darwin`).
2. Builds `native/notch-prototype` with SwiftPM in debug or release mode.
3. Copies the executable to Tauri's sidecar input path using the required target-triple suffix.
4. Fails clearly if Swift is unavailable or the architecture is unsupported.

Development and packaging scripts call it automatically:

- `tauri:dev`: build the debug sidecar before Tauri starts.
- Tauri production build: build the release sidecar before the frontend/Tauri bundle step.

The generated sidecar binary directory is ignored by Git. Swift source remains the only maintained implementation. A production package must be rebuilt to distribute later Swift changes, just like any other native app update.

The sidecar is declared only in the macOS Tauri configuration so non-macOS checks do not look for a Swift executable. The existing pet, screenshot, clipboard, and global-shortcut dependencies remain intact.

## Error handling

- Unsupported platform: keep/show pet and return a clear error.
- Missing or unlaunchable sidecar: keep/show pet, do not save `swift-notch`, and show an error toast.
- Child exits unexpectedly: clear the retained child state and restore the pet window.
- Repeated selection of the active mode: no-op.
- TinyBu shutdown or mode switch: terminate only the child launched and owned by this TinyBu process; never use broad process-kill commands.

## Verification

Automated checks will cover:

- Existing app-state records migrate to `pet`.
- Settings render and persist only the two valid values.
- Active source/configuration contains the macOS sidecar declaration and no old Tauri notch window route.
- The Swift build helper validates target naming and produces an executable at the expected path.
- TypeScript, regression tests, Rust `cargo check`, and production frontend build pass.
- Existing pet source and styling are not modified except for lifecycle visibility control at the Rust window boundary.

Manual smoke checks on macOS will verify:

1. Existing user launch shows the pet.
2. Saving `swift-notch` hides the pet and shows exactly one native notch.
3. Saving `pet` closes the notch and restores the pet.
4. Restart restores the saved mode.
5. Repeated switching does not leave orphan or duplicate processes.
6. Screenshot capture and pet clipboard shortcuts still work in pet mode.

## Scope boundaries

This change does not redesign either companion, add a third disabled mode, alter capture behavior, or introduce automatic app updates. It only adds selection, persistence, build integration, and safe lifecycle ownership.
