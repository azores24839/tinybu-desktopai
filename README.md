# TinyBu Desktop MVP

TinyBu is a desktop-first AI language-learning buddy. It helps learners turn selected text, articles, video transcripts, pasted content, clipboard snippets, and screenshots into understanding-first topic practice, saved expressions, gentle review, and editable learning memory.

## Current core capabilities

The current app implements a Capture -> Select -> Answer -> Review learning loop:

- Tauri v2 desktop shell with a main window and a transparent always-on-top desktop pet window.
- React + TypeScript + Vite frontend.
- Chrome MV3 capture extension in `apps/extension`.
- Localhost desktop capture bridge at `http://127.0.0.1:1421/v1/captures`.
- Capture import from selected browser text, article body, YouTube transcript / visible captions, pasted text, clipboard copy, URL payload, demo content, and desktop screenshots.
- Content understanding for captures: topic, summary, keywords, preview questions, and suggested expressions.
- Fragment selection workflow: short content and subtitles default to selected; long content gets 3-6 recommended fragments.
- Practice question generation from selected fragments.
- Guided answer flow with one question at a time, lightweight TinyBu replies, and two-level Tips.
- Review generation with what was discussed, what worked, more natural expressions, saved notebook expressions, and next practice.
- Notebook for source material and saved / need-practice / learned expressions.
- Editable TinyBu Memory for learning preferences and support notes.
- Desktop screenshot capture with preview mode, optional AI OCR, screenshot Q&A, and diagnostic capture on OCR failure.
- Desktop pet actions: copy capture, open practice, screenshot recognition, undo last capture, reset count, hide, and quick chat.
- IndexedDB persistence through Dexie.
- Mixed AI modes:
  - Local rules.
  - User API Key through Tauri keyring commands when running as desktop.
  - Cloud proxy endpoint at `apps/api/server.mjs`.

For the fuller Chinese product / implementation summary, see:

```text
docs/current-core-capabilities.md
```

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
