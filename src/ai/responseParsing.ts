import type { ScreenshotRecognitionOutput } from "../types";

export function extractJsonText(text = "") {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const objectStart = trimmed.indexOf("{");
  const arrayStart = trimmed.indexOf("[");
  const starts = [objectStart, arrayStart].filter((index) => index >= 0);
  if (!starts.length) return trimmed;

  const start = Math.min(...starts);
  const end = Math.max(trimmed.lastIndexOf("}"), trimmed.lastIndexOf("]"));
  return end > start ? trimmed.slice(start, end + 1) : trimmed;
}

export function parseJsonValue(value: unknown): unknown {
  if (typeof value !== "string") return value;

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    parsed = JSON.parse(extractJsonText(value));
  }
  return typeof parsed === "string" ? parseJsonValue(parsed) : parsed;
}

export async function parseOpenAiJson(response: Response) {
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.message || data?.error || `AI request failed: ${response.status}`);
  }

  const messageContent = data.choices?.[0]?.message?.content;
  const messageContentText = Array.isArray(messageContent)
    ? messageContent.find((content: { type?: string }) => content.type === "text")?.text
    : messageContent;
  const outputText =
    data.output_text ??
    data.output
      ?.flatMap((item: { content?: Array<{ type?: string; text?: string }> }) => item.content ?? [])
      ?.find((content: { type?: string }) => content.type === "output_text")?.text ??
    messageContentText;

  if (!outputText) {
    throw new Error("AI response did not contain output text");
  }

  return parseJsonValue(outputText);
}

export async function parseOpenAiText(response: Response) {
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.message || data?.error || `AI request failed: ${response.status}`);
  }

  const messageContent = data.choices?.[0]?.message?.content;
  const messageContentText = Array.isArray(messageContent)
    ? messageContent.find((content: { type?: string }) => content.type === "text")?.text
    : messageContent;
  const outputText =
    data.output_text ??
    data.output
      ?.flatMap((item: { content?: Array<{ type?: string; text?: string }> }) => item.content ?? [])
      ?.find((content: { type?: string }) => content.type === "output_text")?.text ??
    messageContentText;

  if (!outputText) {
    throw new Error("AI response did not contain output text");
  }

  return String(outputText).trim();
}

export function quickReplyText(text: string) {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= 90) return compact;
  return `${compact.slice(0, 88)}...`;
}

export function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? "").trim()).filter(Boolean);
}

export function normalizeScreenshotRecognition(value: unknown): ScreenshotRecognitionOutput {
  const rawRecord = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const record =
    rawRecord.screenshot_capture && typeof rawRecord.screenshot_capture === "object"
      ? (rawRecord.screenshot_capture as Record<string, unknown>)
      : rawRecord;
  const visibleText = asStringArray(record.visibleText ?? record.visible_text ?? record.ocrText ?? record.ocr_text);
  const text =
    String(record.text ?? record.ocrText ?? record.ocr_text ?? visibleText.join("\n") ?? "")
      .trim();

  if (!text) {
    throw new Error("没有识别到文字。请确认截图区域包含清晰文字，或稍后重试。");
  }

  return {
    title: String(record.title ?? "Screenshot Capture"),
    text,
    language: String(record.language ?? "Unknown"),
    contextNote: String(record.contextNote ?? record.context_note ?? ""),
    screenType: String(record.screenType ?? record.screen_type ?? "Screenshot"),
    visibleText: visibleText.length ? visibleText : [text],
    errorMessages: asStringArray(record.errorMessages ?? record.error_messages),
    interactiveElements: asStringArray(record.interactiveElements ?? record.interactive_elements)
  };
}
