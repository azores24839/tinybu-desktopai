# Practice Plan Contract Reliability Design

## Problem

TinyBu currently treats AI-generated practice plans as trusted `PracticePlan` values. DeepSeek can guarantee that a response is JSON, but it does not guarantee the exact JSON Schema used by TinyBu. A recent successful response used `focusItems` and an array-shaped `languageBank`, while the UI requires `whatToCover` and `languageBank.usefulWords` / `languageBank.usefulChunks`. The unchecked response reached React and crashed before Call started.

The contract is also duplicated between the browser AI prompts and the local API proxy. That makes prompt/schema drift likely and makes provider-specific fixes difficult to maintain.

## Goals

- No provider response can reach Call UI without runtime validation.
- Normal provider output remains unchanged.
- Small, unambiguous structural variations are repaired without changing meaning.
- Incomplete or ambiguous content is retried once with precise validation feedback.
- A second invalid response falls back to TinyBu's existing content-derived local plan instead of crashing.
- DeepSeek, OpenRouter/Qwen, cloud-proxy, and user-key paths obey the same canonical contract.
- Regression tests cover the observed malformed response and terminal fallback behavior.

## Non-goals

- Adding a new AI provider.
- Redesigning the Call or preparation UI.
- Changing practice-plan content strategy or visual presentation.
- Silently inventing missing AI content merely to satisfy the schema.

## Canonical Contract

Create one shared, runtime-compatible contract module consumed by both the Vite/TypeScript frontend and the Node `.mjs` proxy. It will export:

- the canonical JSON Schema for `PracticePlan`;
- the exact field-level contract instruction used in provider prompts;
- a parser returning either a validated canonical plan or structured validation issues;
- a narrowly scoped compatibility normalizer.

The compatibility normalizer may perform only meaning-preserving repairs:

- `focusItems: string[]` may map to `whatToCover` when `whatToCover` is absent;
- surrounding whitespace may be removed;
- otherwise valid string arrays may be cleaned of empty entries.

An array-shaped `languageBank` is ambiguous and must not be guessed into words versus chunks. Missing semantic content, wrong nested types, or too few required items remains a validation failure.

The existing TypeScript `PracticePlan` type remains the UI-facing compile-time type. A declaration for the shared runtime module will keep TypeScript and runtime usage aligned.

## Data Flow

1. A provider receives the canonical contract instruction and, where supported, the canonical JSON Schema.
2. The raw decoded JSON is passed to the shared parser before application state is updated.
3. If validation succeeds after permitted normalization, the canonical plan continues to the UI.
4. If validation fails, TinyBu retries the same provider once. The retry includes concise validation issues and explicitly requests the canonical fields.
5. If the retry also fails, TinyBu logs a sanitized warning and calls the existing `practiceQuestionsRules` fallback using the original fragments/task.
6. Only a validated provider plan or the typed local fallback is stored in `practicePlan`.

Cloud-proxy responses are validated inside the proxy before being returned, and are validated again at the frontend trust boundary. User-key responses are validated at the frontend boundary. The second validation is intentional defense in depth and uses the same shared parser, so it does not create a second contract.

## Prompt and Provider Behavior

The practice-plan prompt must name the exact required fields instead of describing them as generic "focus items" or a "small language bank". DeepSeek continues using JSON-object mode, because that path cannot be assumed to enforce the full schema. OpenRouter keeps JSON-Schema response formatting, but its result is still validated because provider/model support can vary.

Retry is limited to one attempt to control latency and cost. Validation feedback contains field paths and expected shapes, never user secrets or full image payloads.

## Error Handling and Product Quality

- Structural repair never rewrites practice meaning.
- Missing content triggers retry rather than speculative filling.
- The fallback is generated from the original source material, not from the malformed AI response.
- Provider failures and validation failures are distinguishable in logs.
- Logs include task, provider route, and issue paths, but exclude API keys and full sensitive payloads.
- The UI does not need scattered optional chaining as a substitute for a valid domain object.

## Tests

Add regression coverage for:

- a fully valid canonical plan;
- the observed `focusItems` alias with an otherwise valid nested language bank;
- the observed array-shaped `languageBank`, which must fail validation;
- empty or wrong-typed required fields;
- successful normalization followed by Call-facing access to words/chunks;
- one invalid response followed by a valid retry;
- two invalid responses followed by the local plan;
- cloud-proxy and user-key paths using the same parser;
- existing typecheck and regression suites remaining green.

## Scope of Code Changes

Expected edits are limited to the shared practice-plan contract, the two existing prompt/schema definitions that will consume it, the practice-plan provider boundary, the local proxy practice-plan response path, and regression tests. No unrelated UI or provider refactor is included.

## Success Criteria

- The reported malformed DeepSeek response cannot crash `PracticePreparingPage` or `PracticeChatPage`.
- A canonical response still reaches Call without retry or content changes.
- An ambiguous response is retried exactly once.
- Persistent invalid output produces a usable local practice plan.
- There is one runtime schema/normalizer source shared by frontend and proxy.
- Typecheck and regression tests pass.
