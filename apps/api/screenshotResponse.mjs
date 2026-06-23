import { extractJsonText } from "./requestBuilders.mjs";

function isValidScreenshotOutput(task, data) {
  const output = data?.output_text;
  if (typeof output !== "string" || !output.trim()) return false;

  try {
    const value = JSON.parse(extractJsonText(output));
    const required = task === "screenshotCapture"
      ? ["title", "text", "language", "contextNote", "screenType", "visibleText", "errorMessages", "interactiveElements"]
      : ["answer", "quotedText", "nextAction"];
    return value && typeof value === "object" && required.every((key) => key in value);
  } catch {
    return false;
  }
}

export async function requestValidatedScreenshotResponse({ task, payload, request, route, log }) {
  const first = await request(payload);
  if (task !== "screenshotCapture" && task !== "screenshotQuestion") return first;
  if (first.response.ok && isValidScreenshotOutput(task, first.data)) return first;
  if (!first.response.ok && first.response.status !== 502) return first;

  log("WARN", `task=${task} route=${route} invalid or empty response; retrying once`);
  const second = await request({
    ...payload,
    responseCorrection: "The previous response was empty, truncated, or invalid. Return compact valid JSON only. Keep every string concise."
  });
  if (second.response.ok && isValidScreenshotOutput(task, second.data)) return second;

  return {
    response: { ok: false, status: 502 },
    data: { error: "AI returned an invalid screenshot response after one retry." }
  };
}
