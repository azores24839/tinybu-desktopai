# Avatar Video Handoff Design

## Goal

Avatar clips must never be interrupted after becoming visible. Transitions must not expose the page background while the next clip loads, and one Bu response must not dispatch competing talking moods.

## Playback invariants

1. The active clip remains visible until its own `ended` event.
2. Mood requests received during playback only replace the single pending mood. They never change the active clip.
3. At `ended`, the latest pending mood becomes the standby candidate. Until that candidate is visible, a newer request may replace it without interrupting any visible clip.
4. A candidate becomes active only after the standby video has produced its first decoded frame. From that moment it is locked and must play completely.
5. The ended clip's final frame stays visible while the standby video loads or starts.
6. Each media load has a generation token. Events from replaced or obsolete loads are ignored.
7. A request matching the active or already pending mood is deduplicated.
8. With no pending mood, non-idle clips return to idle; idle restarts without replacing its `src`.

## Components

### Mood controller

`useAvatarVideoController` emits mood requests rather than claiming which mood is currently visible. A speaking turn waits for non-empty Bu text and emits exactly one classified mood. It toggles the talking variant once per turn. Yawn remains a separate listening-time request.

### Video player

`AvatarVideoPlayer` owns two stacked videos:

- active slot: visible and playing;
- standby slot: hidden, muted, and used to preload the pending or locked mood.

When the active slot ends, the player freezes its final frame. It starts the prepared standby slot and waits for `requestVideoFrameCallback`; `loadeddata` plus the next animation frame is the fallback. Only then does it swap opacity and update the active slot. There is no opacity animation and no moment when both slots are hidden.

## Failure handling

- `play()` rejection or media error invalidates that load generation.
- A failed non-idle locked clip falls back to idle while retaining the old final frame.
- If idle also fails, the old final frame remains visible instead of exposing the page background.
- Unmount invalidates all outstanding callbacks.

## Verification

- Reducer tests cover complete-play boundaries, latest-candidate behavior, deduplication, and stale promotions.
- Browser verification uses the real MP4 assets and records `ended`, first decoded frame, and visible-slot changes.
- Typecheck, regression tests, and production build must pass.
