import type { CompanionState } from "../types";

export function TinyBuOrb({ state }: { state: CompanionState }) {
  const label: Record<CompanionState, string> = {
    idle: "Idle",
    listening: "Listening",
    speaking: "Speaking",
    thinking: "Thinking",
    encouraging: "Encouraging",
    celebrating: "Celebrating"
  };

  return (
    <div className={`tinybu-orb ${state}`} aria-label={`TinyBu ${label[state]}`}>
      <div className="tinybu-face">
        <span className="eye left" />
        <span className="eye right" />
        <span className="mouth" />
      </div>
    </div>
  );
}
