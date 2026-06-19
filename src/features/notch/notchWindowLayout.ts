import { LogicalSize, PhysicalPosition } from "@tauri-apps/api/dpi";
import { currentMonitor, getCurrentWindow } from "@tauri-apps/api/window";
import { isRunningInTauri } from "../../lib/tauriBridge";

const NOTCH_COLLAPSED_WIDTH = 360;
const NOTCH_EXPANDED_WIDTH = 640;
const NOTCH_HEIGHT = 76;
const NOTCH_TOP_OFFSET = 0;

export async function setNotchWindowLayout(expanded: boolean) {
  if (!isRunningInTauri()) return;

  try {
    const window = getCurrentWindow();
    const [scaleFactor, monitor] = await Promise.all([window.scaleFactor(), currentMonitor()]);
    const workArea = monitor?.workArea;
    if (!workArea) return;

    const width = expanded ? NOTCH_EXPANDED_WIDTH : NOTCH_COLLAPSED_WIDTH;
    const targetWidth = Math.round(width * scaleFactor);
    const targetHeight = Math.round(NOTCH_HEIGHT * scaleFactor);
    const targetX = workArea.position.x + Math.round((workArea.size.width - targetWidth) / 2);
    const targetY = workArea.position.y + Math.round(NOTCH_TOP_OFFSET * scaleFactor);

    await window.setSize(new LogicalSize(width, NOTCH_HEIGHT));
    await window.setPosition(new PhysicalPosition(targetX, targetY));
  } catch (error) {
    console.warn("Unable to position notch window", error);
  }
}
