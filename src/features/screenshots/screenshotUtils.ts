import type { CaptureItem } from "../../types";

export function canConfirmScreenshotText(capture: CaptureItem) {
  return Boolean(capture.screenshot?.imageDataUrl && capture.screenshot.visibleText.length);
}
