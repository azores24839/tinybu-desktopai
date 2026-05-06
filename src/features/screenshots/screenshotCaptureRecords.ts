import type { CaptureItem, ScreenshotCapturePayload } from "../../types";
import { uid } from "../../lib/defaults";

export function createScreenshotPreviewCapture(payload: ScreenshotCapturePayload): CaptureItem {
  const area = payload.captureArea;
  const areaNote = area ? `Captured area: x=${area.x}, y=${area.y}, ${area.width}x${area.height}.` : "";
  const previewText = `Screenshot preview mode. AI recognition is disabled. ${areaNote}`;
  return {
    id: uid("capture"),
    title: "Screenshot Preview",
    sourceUrl: "",
    sourceKind: "screenshot",
    sourceText: previewText,
    screenshot: {
      imageDataUrl: payload.imageDataUrl,
      width: payload.width,
      height: payload.height,
      language: "Unknown",
      screenType: "Screenshot",
      contextNote: previewText,
      visibleText: [],
      errorMessages: [],
      interactiveElements: [],
      questionAnswers: []
    },
    topic: "Screenshot Notes",
    summary: previewText,
    keywords: ["screenshot"],
    questions: ["What do you want to understand from this screenshot?"],
    suggestedExpressions: [],
    capturedAt: payload.capturedAt,
    fragments: [
      {
        id: uid("fragment"),
        text: previewText,
        selected: true,
        recommended: true,
        sourceIndex: 0
      }
    ],
    status: "unsorted"
  };
}

export function createScreenshotDiagnosticCapture(payload: ScreenshotCapturePayload, message: string): CaptureItem {
  const diagnosticText = `Screenshot was captured, but OCR did not return text. ${message}`;
  return {
    ...createScreenshotPreviewCapture(payload),
    id: uid("capture"),
    title: "Screenshot OCR Diagnostic",
    sourceText: diagnosticText,
    summary: diagnosticText,
    fragments: [{ id: uid("fragment"), text: diagnosticText, selected: true, recommended: true, sourceIndex: 0 }]
  };
}
