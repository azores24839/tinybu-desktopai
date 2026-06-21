import { nowIso, uid } from "../../lib/defaults";
import type { CaptureItem } from "../../types";
import { splitCaptureText } from "./captureUtils";

export function createClipboardCaptureRecord(text: string): CaptureItem {
  const normalizedText = text.trim();
  const pieces = splitCaptureText(normalizedText);
  const titleSource = pieces[0] || "Clipboard Capture";
  const title = titleSource.length > 64 ? `${titleSource.slice(0, 61)}…` : titleSource;

  return {
    id: uid("capture"),
    title,
    sourceUrl: "",
    sourceKind: "selection",
    sourceText: text,
    topic: "Fresh Captures",
    summary: normalizedText.replace(/\s+/g, " ").slice(0, 160),
    keywords: [],
    questions: [],
    suggestedExpressions: [],
    capturedAt: nowIso(),
    fragments: pieces.map((piece, index) => ({
      id: uid("fragment"),
      text: piece,
      selected: true,
      recommended: true,
      sourceIndex: index
    })),
    status: "unsorted"
  };
}
