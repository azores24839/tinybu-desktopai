export type PetActivity = "idle" | "dragging" | "capturing" | "thinking";

export type PetPointerStart = {
  x: number;
  y: number;
  pointerId: number;
  dragging: boolean;
};

export type ClipboardSuppressEvent = {
  text: string;
};

export type MenuSide = "left" | "right";

export const CLIPBOARD_SHORTCUT = "CommandOrControl+Shift+N";
export const CLIPBOARD_SHORTCUT_STORAGE_KEY = "tinybuClipboardShortcutAllowed";
export const CLIPBOARD_POLL_MS = 700;
export const CLIPBOARD_PROMPT_MS = 8000;

export const avatarImages: Record<PetActivity, string> = {
  idle: "/avatar/states/idle.gif",
  dragging: "/avatar/states/dragging.gif",
  capturing: "/avatar/states/capturing.gif",
  thinking: "/avatar/states/thinking.png"
};
