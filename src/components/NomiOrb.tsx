import type { NomiState } from "../types";

export function NomiOrb({ state }: { state: NomiState }) {
  const label: Record<NomiState, string> = {
    idle: "Idle",
    listening: "Listening",
    speaking: "Speaking",
    thinking: "Thinking",
    encouraging: "Encouraging",
    celebrating: "Celebrating"
  };

  return (
    <div className={`nomi-orb ${state}`} aria-label={`TinyBu ${label[state]}`}>
      <div className="nomi-face">
        <span className="eye left" />
        <span className="eye right" />
        <span className="mouth" />
      </div>
    </div>
  );
}
