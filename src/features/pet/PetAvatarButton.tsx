import type { PointerEvent } from "react";
import { avatarImages, type PetActivity } from "./petTypes";

type PetAvatarButtonProps = {
  activity: PetActivity;
  onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => void;
};

export function PetAvatarButton({
  activity,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel
}: PetAvatarButtonProps) {
  return (
    <button
      className="pet-avatar-button"
      type="button"
      aria-label="TinyBu desktop companion"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <img src={avatarImages[activity]} alt="" draggable={false} />
    </button>
  );
}
