import { Check } from "lucide-react";
import type { CaptureItem } from "../../types";
import { canConfirmScreenshotText } from "./screenshotUtils";

type ScreenshotPreviewBlockProps = {
  capture: CaptureItem;
  onConfirmText: (capture: CaptureItem) => void;
};

export function ScreenshotPreviewBlock({ capture, onConfirmText }: ScreenshotPreviewBlockProps) {
  if (!capture.screenshot?.imageDataUrl) return null;

  return (
    <div className="screenshot-preview-block">
      <img className="screenshot-preview-image" src={capture.screenshot.imageDataUrl} alt="Captured screenshot preview" />
      {canConfirmScreenshotText(capture) && (
        <button className="secondary" onClick={() => onConfirmText(capture)}>
          <Check size={16} /> Confirm text
        </button>
      )}
    </div>
  );
}
