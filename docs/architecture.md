# TinyBu Architecture Notes

Last updated: 2026-05-07.

This document is the quick recovery map for future Codex sessions. It describes where code lives, what is risky, and how to keep changes scoped.

## Current Shape

TinyBu is a Tauri desktop app with a React + TypeScript + Vite frontend.

Major runtime pieces:

- `src/`: main React frontend.
- `src-tauri/`: Tauri shell, desktop windows, screenshot capture, keychain, local bridge.
- `apps/api/`: local cloud proxy for OpenAI, OpenRouter, and Anthropic-compatible providers such as MiniMax.
- `apps/extension/`: Chrome MV3 capture extension.
- `docs/`: product and architecture notes.

## Frontend Module Map

```text
src/App.tsx
  Main shell, screen routing, global state, app-level business flows.

src/components/
  Small shared UI components, including TinyBu orb.

src/features/captures/
  Inbox, Organize, capture labels, text splitting, status normalization,
  suggested topic grouping.

src/features/topics/
  Topics list, Topic Detail, Study Room, topic lookup utilities.

src/features/screenshots/
  Screenshot preview records, screenshot import flow, confirm-text cleanup,
  screenshot preview UI, screenshot question UI.

src/features/home/
  Home dashboard.

src/features/practice/
  Practice pages and pure practice data builders.

src/features/setup/
  Welcome, Onboarding, and Companion Setup pages.

src/features/notebook/
  Notebook page.

src/features/memory/
  Bu's Memory page.

src/features/settings/
  Settings page.

src/lib/
  Defaults, Dexie database setup, secure key storage, Tauri bridge helpers,
  shared options, UI copy, date formatting.

src/ai/
  Prompts, JSON schemas, rules fallback, provider calls, response normalization.
```

## Current Health

The project is in workable shape and has improved maintainability after recent feature-folder extraction.

Remaining hotspots:

- `src/App.tsx` is still large and owns too many business flows.
- `src/ai/provider.ts` is large and mixes provider routing, request construction, parsing, and task helpers.
- `src/styles.css` is large and global.
- There is a small Node-based regression suite for provider routing, screenshot confirmation, and practice data builders.

Recommended current safety checks:

```bash
npm run test:regression
npm run typecheck
npm run build
node --check apps/api/server.mjs
```

Use Tauri checks when touching Rust or desktop commands:

```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

## Maintenance Rules

Prefer small, scoped changes.

- Do not mix product changes with broad refactors.
- Move code first, then verify, then make behavior changes in a separate step.
- Keep new feature work inside the nearest `src/features/<domain>/` folder.
- Keep shared UI in `src/components/` only when it is genuinely reused.
- Keep pure utilities separate from React components.
- Avoid editing `src/styles.css` broadly; add narrowly named selectors.
- Preserve existing user data shapes unless a migration is explicitly planned.

When asked to refactor:

1. Identify the exact files and functions to move.
2. Move without changing behavior.
3. Run `npm run test:regression`.
4. Run `npm run typecheck`.
5. Run `npm run build`.
6. Report changed files and any residual risk.

## Screenshot Behavior

Screenshots are captured as PNG data URLs from Tauri and stored in IndexedDB as part of a capture record.

Current intended behavior:

- OCR disabled: keep screenshot image as preview material.
- OCR success: keep image until the user clicks `Confirm text`.
- After confirmation: remove `screenshot.imageDataUrl` from the capture and retain extracted text and metadata.
- OCR failure: keep screenshot image in a diagnostic capture and select that capture in Inbox.

Reason: screenshots are temporary evidence; the durable learning object is the extracted text and metadata.

## AI Provider Routing

User API key mode has one saved key. It is appropriate when one provider key is enough.

Cloud proxy mode is the recommended mode for mixed provider routing:

- MiniMax chat/learning via `ANTHROPIC_BASE_URL` + `ANTHROPIC_AUTH_TOKEN`.
- Qwen vision via `OPENROUTER_API_KEY`.
- OpenAI models via `OPENAI_API_KEY`.

In `apps/api/server.mjs`, MiniMax model names should route to the Anthropic-compatible endpoint when a token is configured. Provider/model IDs such as `qwen/...` should route to OpenRouter.

## Suggested Next Refactors

Lowest-risk UI extractions are mostly complete. The next steps touch business
logic and should be paired with more explicit regression checks.

Higher-risk refactors to postpone until the UI extractions are stable:

1. Practice business flow (`startPracticeForTopic`, `requestTip`, `submitPracticeAnswer`, `finishPractice`).
2. AI provider decomposition.
3. CSS modularization.

## Known Gaps

- Regression coverage is still small; currently it covers provider routing, screenshot confirmation, and practice data builders.
- No Playwright coverage for major UI paths.
- `App.tsx` still owns important side effects and flow orchestration.
- `src/ai/provider.ts` needs provider-specific modules before adding many more providers.
- Long-term IndexedDB storage size needs monitoring if users keep many image-backed failed/preview screenshot captures.
