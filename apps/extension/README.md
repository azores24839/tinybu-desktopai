# TinyBu Capture Extension

This is the browser-capture layer for TinyBu.

## Current capture modes

- `捕捉选中文本`: sends the current browser selection to TinyBu.
- `保存整篇文章`: extracts readable article text from `article`, `main`, or paragraph-heavy containers.
- `捕捉 YouTube 字幕`: reads transcript segment text when the YouTube transcript panel is open; otherwise falls back to the current visible caption only.

## How it sends content to TinyBu

The extension first tries to send captures to the TinyBu desktop bridge:

```text
http://127.0.0.1:1421/v1/captures
```

When the bridge is available, TinyBu's desktop pet counter updates and the capture waits there until the user chooses to practice. When the bridge is not available, the extension falls back to local extension storage and the existing browser page bridge at:

```text
http://127.0.0.1:1420/
```

This keeps browser capture usable while the Tauri desktop app is not running.

## Known limitations

- Very long article and transcript text is still trimmed before sending.
- YouTube transcript capture works best when the transcript panel is open. Without it, the extension only captures visible captions.
- Arbitrary video platforms are not supported yet.
- Desktop screenshot reading is handled by the Tauri app, not by the browser extension.
