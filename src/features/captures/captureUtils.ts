import type { CaptureItem, CaptureStatus, ExternalCaptureKind } from "../../types";

export const captureStatusLabels: Record<CaptureStatus, string> = {
  unsorted: "Unsorted",
  suggested: "Suggested",
  "in-topic": "In Topic",
  studied: "Studied",
  practiced: "Practiced",
  archived: "Archived"
};

export function splitCaptureText(text: string): string[] {
  const lines = text
    .split(/\n+/)
    .map(cleanCapturedLine)
    .filter(Boolean);
  if (lines.length > 1) return lines;
  const sentences = text
    .split(/(?<=[.!?。！？])\s+/)
    .map(cleanCapturedLine)
    .filter(Boolean);
  return sentences.length ? sentences : [cleanCapturedLine(text)].filter(Boolean);
}

export function cleanCapturedLine(line: string) {
  return line
    .replace(/^\s*\d{1,2}:\d{2}(?::\d{2})?\s*\d*\s*(?:分钟)?\d*\s*秒钟\s*/g, "")
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b\s*\d*\s*(?:分钟)?\d*\s*秒钟\s*/g, " ")
    .replace(/^\s*\d+\s*(?:分钟)?\d*\s*秒钟\s*/g, "")
    .replace(/\s+\d+\s*(?:分钟)?\d*\s*秒钟\s*/g, " ")
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, " ")
    .replace(/^\s*\d+\s*(seconds?|secs?)\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function sourceLabel(kind: ExternalCaptureKind) {
  if (kind === "youtube") return "YouTube transcript";
  if (kind === "video") return "Video transcript";
  if (kind === "article") return "Article";
  if (kind === "selection") return "Web selection";
  if (kind === "screenshot") return "Screenshot";
  return "Pasted text";
}

export function normalizeStatus(status: CaptureItem["status"]): CaptureStatus {
  if (status === "new") return "unsorted";
  if (status === "in-practice") return "studied";
  if (status === "completed") return "practiced";
  return status;
}

export function captureText(capture: CaptureItem) {
  return capture.sourceText || capture.fragments.map((fragment) => fragment.text).join("\n");
}

export function suggestedGroups(captures: CaptureItem[]) {
  const groups = captures
    .filter((capture) => !capture.topicId && normalizeStatus(capture.status) !== "archived")
    .reduce<Record<string, CaptureItem[]>>((acc, capture) => {
      const name = capture.topic || "Fresh Captures";
      acc[name] = [...(acc[name] ?? []), capture];
      return acc;
    }, {});

  return Object.entries(groups).map(([name, items]) => ({
    id: name,
    name,
    captures: items,
    summary: items[0]?.summary || "A suggested topic based on recent captures.",
    practiceGoal: inferPracticeGoal(items)
  }));
}

export function inferPracticeGoal(captures: CaptureItem[]) {
  const text = captures.flatMap((capture) => capture.questions ?? []).join(" ");
  if (/compare|different|优缺点|比较/i.test(text)) return "Compare two ideas";
  if (/agree|opinion|观点|think/i.test(text)) return "Express an opinion";
  if (/summarize|main idea|复述|summary/i.test(text)) return "Retell the key idea";
  return "Give a clear personal response";
}
