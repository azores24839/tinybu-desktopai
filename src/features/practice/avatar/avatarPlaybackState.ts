import type { AvatarVideoMood } from "./avatarVideos";

export type AvatarPlaybackPhase = "playing" | "waiting-for-frame";

export type AvatarPlaybackState = {
  activeMood: AvatarVideoMood;
  pendingMood: AvatarVideoMood | null;
  lockedMood: AvatarVideoMood | null;
  phase: AvatarPlaybackPhase;
  restartVersion: number;
};

export type AvatarPlaybackEvent =
  | { type: "request"; mood: AvatarVideoMood }
  | { type: "ended" }
  | { type: "promoted"; mood: AvatarVideoMood }
  | { type: "load-failed"; mood: AvatarVideoMood };

export function createAvatarPlaybackState(): AvatarPlaybackState {
  return {
    activeMood: "idle",
    pendingMood: null,
    lockedMood: null,
    phase: "playing",
    restartVersion: 0
  };
}

export function reduceAvatarPlayback(
  state: AvatarPlaybackState,
  event: AvatarPlaybackEvent
): AvatarPlaybackState {
  switch (event.type) {
    case "request": {
      if (state.phase === "playing") {
        if (event.mood === state.activeMood) {
          return state.pendingMood === null ? state : { ...state, pendingMood: null };
        }
        return event.mood === state.pendingMood ? state : { ...state, pendingMood: event.mood };
      }

      if (event.mood === state.activeMood || event.mood === state.lockedMood) return state;
      return { ...state, lockedMood: event.mood };
    }

    case "ended": {
      if (state.phase !== "playing") return state;
      const nextMood = state.pendingMood ?? "idle";
      if (nextMood === state.activeMood) {
        return {
          ...state,
          pendingMood: null,
          restartVersion: state.restartVersion + 1
        };
      }
      return {
        ...state,
        pendingMood: null,
        lockedMood: nextMood,
        phase: "waiting-for-frame"
      };
    }

    case "promoted":
      if (state.phase !== "waiting-for-frame" || state.lockedMood !== event.mood) return state;
      return {
        ...state,
        activeMood: event.mood,
        lockedMood: null,
        phase: "playing"
      };

    case "load-failed":
      if (state.phase === "playing" && state.pendingMood === event.mood) {
        return { ...state, pendingMood: null };
      }
      if (state.phase === "waiting-for-frame" && state.lockedMood === event.mood && event.mood !== "idle") {
        return { ...state, lockedMood: "idle" };
      }
      return state;
  }
}
