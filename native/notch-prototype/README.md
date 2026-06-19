# TinyBu Native Notch Prototype

This is a standalone macOS AppKit prototype for validating a system-feeling TinyBu notch companion.

It intentionally does not modify TinyBu's existing Tauri app, browser extension, capture bridge, or screenshot flow yet. The first goal is to validate native `NSPanel` window behavior and visual feel.

## Run

From the repository root:

```bash
cd native/notch-prototype
swift run TinyBuNotchPrototype
```

The app runs as an accessory app with no Dock icon. Stop it with `Control+C` in the terminal.

## Test

- Look for the black island attached to the top center of the screen.
- Click the island to expand/collapse it.
- Press `Command+Shift+Space` to toggle it with the global hotkey.
- Drag text, a URL, or a file over the island to see the drop affordance.
- Use the placeholder action buttons to test micro-feedback.

## Current Scope

- Native `NSPanel`
- Top-center positioning
- Collapsed and expanded island states
- Click and global shortcut activation
- Drag-over/drop affordance
- Placeholder TinyBu actions

## Not Yet Integrated

- TinyBu capture bridge
- Existing screenshot command
- Browser extension capture count
- Voice transcription
- Packaged app lifecycle
