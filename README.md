# TinyBu Desktop MVP

TinyBu is a desktop-first AI language-learning buddy. It helps learners turn selected text, articles, video transcripts, pasted content, and screenshots into understanding-first topic practice, saved expressions, gentle review, and editable learning memory.

## What is implemented

- Tauri v2 desktop shell configuration.
- React + TypeScript + Vite frontend.
- Chrome MV3 capture extension prototype in `apps/extension`.
- TinyBu desktop pet prototype with Tauri transparent always-on-top window, screenshot selection, and localhost capture bridge.
- Welcome, Onboarding, Companion Setup, Home, Watch Room, Talk Mode, Mirror Card, Notebook, Memory Log, and Settings.
- Demo transcripts and pasted transcript flow.
- Web capture import flow for selected text, article text, YouTube transcript/captions, and desktop screenshot OCR through the cloud proxy.
- Expression Card generation with local fallback rules.
- Talk Mode with six Rescue Buttons.
- Mirror Card and Memory Log generation.
- IndexedDB persistence through Dexie.
- Mixed AI modes:
  - Local rules.
  - User API Key through Tauri keyring commands when running as desktop.
  - Cloud proxy endpoint at `apps/api/server.mjs`.

## Run the web dev version

```bash
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:1420/
```

## Try the Chrome capture extension

1. Start TinyBu:

```bash
npm run dev
```

2. Open Chrome or another Chromium browser.
3. Go to `chrome://extensions`.
4. Enable Developer mode.
5. Click `Load unpacked`.
6. Select:

```text
apps/extension
```

The extension supports:

- selected text capture;
- article body capture;
- YouTube transcript capture when the transcript is present in the page;
- visible YouTube captions as a fallback.

The extension now first tries to send captured content to the desktop bridge:

```text
http://127.0.0.1:1421/v1/captures
```

When the Tauri app is running, TinyBu updates its `已记录N条` counter and stores pending captures for later practice. If the desktop bridge is not available, the extension falls back to local extension storage and, when available, the browser TinyBu page at:

```text
http://127.0.0.1:1420/
```

## Run the optional cloud proxy

```bash
ANTHROPIC_BASE_URL=https://api.minimaxi.com/anthropic \
ANTHROPIC_AUTH_TOKEN=your-token \
ANTHROPIC_MODEL=MiniMax-M2.7 \
npm run api:dev
```

The proxy also supports `OPENAI_API_KEY` as a fallback, but TinyBu's default Settings point at the local Anthropic-compatible proxy.

The default proxy URL in Settings is:

```text
http://127.0.0.1:8787/v1/nomi/task
```

## Run as a Tauri desktop app

This machine currently needs Rust/Cargo installed before Tauri can run.

Install Rust from:

```text
https://www.rust-lang.org/tools/install
```

Then run:

```bash
npm run tauri:dev
```

## Verification

The current implementation has been checked with:

```bash
npm run typecheck
npm run build
```

The core demo flow was also smoke-tested in a browser:

Welcome -> Try Demo -> Watch Room -> Capture -> Expression Card -> Save to Notebook -> Finish & Talk -> Send answer -> Rescue Button -> End Talk -> Mirror Card -> Notebook -> Memory Log.
