import type { MenuSide } from "./petTypes";

type PetMenuProps = {
  side: MenuSide;
  shortcutEnabled: boolean;
  toggleClipboardShortcut: () => void;
  openPractice: () => void;
  startScreenshotCapture: () => void;
  undoLastCapture: () => void;
  hidePet: () => void;
  resetCount: () => void;
};

export function PetMenu({
  side,
  shortcutEnabled,
  toggleClipboardShortcut,
  openPractice,
  startScreenshotCapture,
  undoLastCapture,
  hidePet,
  resetCount
}: PetMenuProps) {
  return (
    <div className={`pet-menu ${side}`} role="menu" aria-label="TinyBu menu">
      <button type="button" role="menuitem" onClick={toggleClipboardShortcut}>
        {shortcutEnabled ? "关闭复制捕捉" : "允许复制捕捉"}
      </button>
      <button type="button" role="menuitem" onClick={openPractice}>
        开始练习
      </button>
      <button type="button" role="menuitem" onClick={startScreenshotCapture}>
        截图识别
      </button>
      <button type="button" role="menuitem" onClick={undoLastCapture}>
        撤销上一条
      </button>
      <button type="button" role="menuitem" onClick={hidePet}>
        隐藏
      </button>
      <button type="button" role="menuitem" onClick={resetCount}>
        清零
      </button>
    </div>
  );
}
