import type { CaptureItem, ScreenshotCapturePayload } from "../../types";
import { nowIso, uid } from "../../lib/defaults";

export function createLocalOcrScreenshotCapture(payload: ScreenshotCapturePayload): CaptureItem {
  const ocr = payload.localOcr;
  const lines = (ocr?.lines ?? []).map((line) => line.trim()).filter(Boolean);
  const recognizedText = ocr?.text.trim() || lines.join("\n");
  const fallbackText = ocr?.error || "Screenshot captured. No readable text was found.";
  const sourceText = recognizedText || fallbackText;
  const titleSource = lines[0] || "Screenshot Capture";
  const title = titleSource.length > 64 ? `${titleSource.slice(0, 61)}…` : titleSource;
  const contextNotes = [
    "Recognized locally with Apple Vision.",
    ocr?.truncated ? "OCR text was truncated to keep the capture responsive." : "",
    ocr?.error ?? ""
  ].filter(Boolean);
  const localSummary = recognizedText
    ? recognizedText.replace(/\s+/g, " ").slice(0, 160)
    : fallbackText;
  const fragments = (lines.length ? lines : [sourceText]).slice(0, 100).map((text, index) => ({
    id: uid("fragment"),
    text,
    selected: true,
    recommended: true,
    sourceIndex: index
  }));

  return {
    id: uid("capture"),
    title,
    sourceUrl: "",
    sourceKind: "screenshot",
    sourceText,
    screenshot: {
      imageDataUrl: payload.imageDataUrl,
      width: payload.width,
      height: payload.height,
      language: ocr?.language || "unknown",
      screenType: "Full Screen",
      contextNote: contextNotes.join(" "),
      visibleText: lines,
      errorMessages: ocr?.error ? [ocr.error] : [],
      interactiveElements: [],
      questionAnswers: [],
      ocrTruncated: ocr?.truncated ?? false
    },
    topic: "Screenshot Notes",
    summary: localSummary,
    keywords: ["screenshot", "ocr"],
    questions: ["What do you want to understand from this screenshot?"],
    suggestedExpressions: [],
    capturedAt: payload.capturedAt || nowIso(),
    fragments,
    status: "unsorted"
  };
}

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
