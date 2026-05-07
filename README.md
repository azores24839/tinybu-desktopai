# TinyBu Desktop MVP

TinyBu is a desktop-first AI language-learning workspace. It turns browser selections, articles, video transcripts, pasted text, clipboard snippets, and screenshots into organized topics, understanding-first study, low-pressure expression practice, practice review, saved expressions, and editable learning memory.

Current product flow:

```text
Browse / Capture
-> Inbox
-> Organize
-> Topics
-> Study Room
-> Practice
-> Practice Review
-> Notebook / Bu's Memory
```

For the full Chinese product / implementation summary and architecture map, see:

```text
docs/current-core-capabilities.md
docs/architecture.md
```

## Current Core Capabilities

- Tauri v2 desktop shell with a main window and transparent always-on-top desktop pet.
- React + TypeScript + Vite frontend.
- Chrome MV3 capture extension in `apps/extension`.
- Local desktop capture bridge at `http://127.0.0.1:1421/v1/captures`.
- Capture import from selected browser text, article body, YouTube transcript / visible captions, pasted text, clipboard copy, URL payload, demo content, and desktop screenshots.
- Inbox and Organize workflow for turning loose captures into Topics.
- Persistent Topic records through Dexie / IndexedDB.
- Topic Detail and Study Room for source review, summaries, useful expressions, and study preparation.
- Practice flow with one question at a time, lightweight TinyBu replies, and two-level Tips.
- Practice Review with better expressions, saved suggestions, next step, Notebook updates, and Bu's Memory updates.
- Notebook focused on saved expressions rather than full source storage.
- Bu's Memory dashboard for learning interests, difficulties, expression directions, and suggestions.
- Desktop screenshot capture with transparent selection overlay, preview mode, optional AI OCR, screenshot Q&A, and diagnostic capture on OCR failure.
- Desktop pet actions: copy capture, open main app, screenshot recognition, undo last capture, reset count, hide, and quick chat.
- AI provider modes: local rules, user API key, and local cloud proxy.

## Project Structure

The frontend is being gradually split by feature so future changes stay local:

```text
src/App.tsx                    Main shell, routing, global state, remaining practice flows
src/components/                Shared UI pieces, including TinyBu orb
src/features/captures/         Inbox, Organize, capture labels and text utilities
src/features/topics/           Topics, Topic Detail, Study Room
src/features/screenshots/      Screenshot import flow, preview, confirmation, Q&A
src/features/home/             Home dashboard
src/features/practice/         Practice pages and practice data builders
src/features/setup/            Welcome, onboarding, companion setup
src/features/notebook/         Notebook page
src/features/memory/           Bu's Memory page
src/features/settings/         Settings page
src/lib/                       Defaults, persistence helpers, shared options/copy
src/ai/                        Provider clients, prompts, routing/request/parsing helpers, schemas, rules fallback
src-tauri/                     Desktop shell, screenshot capture, keychain, bridge
apps/api/                      Local cloud proxy and provider routing helpers
apps/extension/                Chrome MV3 capture extension
```

Current maintenance rule: keep feature work inside its feature folder when possible. Avoid broad refactors mixed with product changes.

## Run Web Dev Version

```bash
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:1420/
```

Note: the desktop pet, system screenshot capture, keychain storage, and Tauri capture bridge require the Tauri desktop app.

## Run Tauri Desktop App

```bash
npm run tauri:dev
```

Tauri windows:

- `main`: TinyBu main workspace.
- `pet`: transparent desktop pet.
- `screenshot`: temporary transparent screenshot overlay.

## Try Chrome Capture Extension

1. Start TinyBu.
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
- YouTube transcript capture when transcript is present;
- visible YouTube captions as fallback.

It first tries to send captured content to the desktop bridge:

```text
http://127.0.0.1:1421/v1/captures
```

When the Tauri app is running, TinyBu updates the desktop pet capture count and imports pending captures into Inbox. If the bridge is unavailable, the extension falls back to local extension storage and, when available, the browser TinyBu page.

## AI Provider Modes

TinyBu Settings currently support three provider modes.

### Rules fallback

No network and no API key. This is useful for UI/demo testing, but it is not real AI. Screenshot OCR is not available in this mode. Desktop pet quick chat intentionally reports that rules mode is not real AI.

### User API key

Use this when one saved key is enough for the current model routing.

Settings:

```text
Provider mode: User API key
Chat / learning model: MiniMax-M2.7
Screenshot / vision model: qwen/qwen3.6-35b-a3b
OpenRouter base URL: https://openrouter.ai/api/v1
```

Then paste your API key in Settings and click `Save Settings`.

If your key starts with `sk-or-`, TinyBu treats it as an OpenRouter key and routes requests to OpenRouter automatically. `MiniMax-M2.7` is automatically mapped to:

```text
minimax/minimax-m2.7
```

If you want chat / learning to use your MiniMax key while screenshot vision uses Qwen through OpenRouter, use `Cloud proxy` instead. The app's `User API key` mode stores only one key.

Use `Check saved key` in Settings to confirm TinyBu can read the key.

### Cloud proxy

Use this when you want the frontend to call a local proxy instead of directly holding provider logic.

Default proxy URL:

```text
http://127.0.0.1:8787/v1/nomi/task
```

Run with OpenRouter:

```bash
OPENROUTER_API_KEY=your-openrouter-key npm run api:dev
```

Run with Anthropic-compatible endpoint:

```bash
ANTHROPIC_BASE_URL=https://api.minimaxi.com/anthropic \
ANTHROPIC_AUTH_TOKEN=your-token \
ANTHROPIC_MODEL=MiniMax-M2.7 \
npm run api:dev
```

Run with MiniMax for chat / learning and OpenRouter for Qwen vision:

```bash
ANTHROPIC_BASE_URL=https://api.minimaxi.com/anthropic \
ANTHROPIC_AUTH_TOKEN=your-minimax-key \
OPENROUTER_API_KEY=your-openrouter-key \
npm run api:dev
```

With both keys configured, MiniMax model names such as `MiniMax-M2.7` are sent to the Anthropic-compatible MiniMax endpoint. Provider/model IDs such as `qwen/qwen3.6-35b-a3b` are sent to OpenRouter.

Run with OpenAI:

```bash
OPENAI_API_KEY=your-openai-key npm run api:dev
```

The proxy also supports:

```text
OPENROUTER_BASE_URL
API_TIMEOUT_MS
```

Most AI tasks use structured JSON schema through the proxy. `quickPetChat` uses a lightweight plain-text path for faster desktop pet replies.

## Desktop Pet Quick Chat

The desktop pet quick chat uses the same Settings as the main app:

- provider mode;
- saved API key;
- chat model;
- OpenRouter base URL or cloud proxy URL.

For speed in testing:

- no JSON schema;
- short prompt;
- `max_tokens` around 70;
- 12 second timeout;
- errors are shown directly instead of hidden by canned fallback replies.

The reply bubble expands upward so longer text does not cover the pet avatar. Replies are intentionally kept short.

## Screenshot Capture

Screenshot capture is opened from the desktop pet menu.

Behavior:

- main and pet windows are temporarily hidden;
- transparent overlay shows the desktop;
- selected region is captured by Tauri;
- screenshot Capture appears in Inbox;
- AI OCR only runs if screenshot recognition is enabled in Settings.
- after successful OCR, the screenshot image can be cleared with `Confirm text`; TinyBu keeps the extracted text and screenshot metadata.
- if OCR is disabled or fails, the screenshot image is retained for preview, retry, or diagnosis.

Vision model is configured separately from chat model:

```text
Screenshot / vision model: qwen/qwen3.6-35b-a3b
```

## Verification

Useful checks:

```bash
npm run test:regression
npm run typecheck
npm run build
node --check apps/api/server.mjs
cargo check --manifest-path src-tauri/Cargo.toml
```

Recent verified checks:

```bash
npm run test:regression
npm run typecheck
npm run build
node --check apps/api/server.mjs
```
