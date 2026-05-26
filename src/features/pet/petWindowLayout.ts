import { LogicalSize, PhysicalPosition } from "@tauri-apps/api/dpi";
import { currentMonitor, getCurrentWindow } from "@tauri-apps/api/window";
import { isRunningInTauri } from "../../lib/tauriBridge";
import type { MenuSide } from "./petTypes";

const PET_CLOSED_WIDTH = 280;
const PET_OPEN_WIDTH = 360;
const PET_CLOSED_HEIGHT = 320;
const PET_REPLY_HEIGHT = 430;

export async function setPetWindowLayout(open: boolean, side: MenuSide, tall = false) {
  if (!isRunningInTauri()) return;

  try {
    const window = getCurrentWindow();
    const [position, size, scaleFactor, monitor] = await Promise.all([
      window.outerPosition(),
      window.outerSize(),
      window.scaleFactor(),
      currentMonitor()
    ]);
    const width = open ? PET_OPEN_WIDTH : PET_CLOSED_WIDTH;
    const height = tall ? PET_REPLY_HEIGHT : PET_CLOSED_HEIGHT;
    const currentCenterX = position.x + size.width / 2;
    const targetWidth = Math.round(width * scaleFactor);
    const targetHeight = Math.round(height * scaleFactor);
    const workArea = monitor?.workArea;
    let targetX = Math.round(currentCenterX - targetWidth / 2);
    let targetY = position.y + size.height - targetHeight;

    if (workArea) {
      const minX = workArea.position.x;
      const maxX = workArea.position.x + workArea.size.width - targetWidth;
      targetX = Math.min(Math.max(targetX, minX), Math.max(minX, maxX));
      targetY = Math.max(workArea.position.y, targetY);
    }

    await window.setSize(new LogicalSize(width, height));
    await window.setPosition(new PhysicalPosition(targetX, targetY));
  } catch (error) {
    console.warn("Unable to resize pet window", error);
  }
}

export async function choosePetMenuSide(): Promise<MenuSide> {
  let side: MenuSide = "right";

  if (!isRunningInTauri()) return side;

  try {
    const window = getCurrentWindow();
    const [position, size, monitor] = await Promise.all([
      window.outerPosition(),
      window.outerSize(),
      currentMonitor()
    ]);
    const workArea = monitor?.workArea;
    if (workArea) {
      const petCenterX = position.x + size.width / 2;
      const availableRight = workArea.position.x + workArea.size.width - petCenterX;
      const availableLeft = petCenterX - workArea.position.x;
      side = availableRight >= 180 || availableRight >= availableLeft ? "right" : "left";
    }
  } catch (error) {
    console.warn("Unable to choose pet menu side", error);
  }

  return side;
}
