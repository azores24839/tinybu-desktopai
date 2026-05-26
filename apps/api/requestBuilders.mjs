export function stripDataUrl(dataUrl = "") {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return { mediaType: "image/png", data: dataUrl };
  return { mediaType: match[1], data: match[2] };
}

export function buildAnthropicContent(task, payload) {
  if (task !== "screenshotCapture" && task !== "screenshotQuestion") return JSON.stringify(payload);

  const { imageDataUrl, ...rest } = payload ?? {};
  const image = stripDataUrl(imageDataUrl);
  const content = [
    {
      type: "text",
      text: JSON.stringify({
        ...rest,
        instruction:
          task === "screenshotCapture"
            ? "OCR every readable text string. Do not filter by usefulness or language."
            : "Answer the user's question about this screenshot."
      })
    }
  ];

  if (imageDataUrl) {
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: image.mediaType,
        data: image.data
      }
    });
  }

  return content;
}

export function buildOpenAiInput(task, payload) {
  if (task !== "screenshotCapture" && task !== "screenshotQuestion") return JSON.stringify(payload);

  const { imageDataUrl, ...rest } = payload ?? {};
  const content = [
    {
      type: "input_text",
      text: JSON.stringify({
        ...rest,
        instruction:
          task === "screenshotCapture"
            ? "OCR every readable text string. Do not filter by usefulness or language."
            : "Answer the user's question about this screenshot."
      })
    }
  ];

  if (imageDataUrl) {
    content.push({
      type: "input_image",
      image_url: imageDataUrl,
      detail: "high"
    });
  }

  return [
    {
      role: "user",
      content
    }
  ];
}

export function buildOpenRouterMessages(task, payload) {
  if (task !== "screenshotCapture" && task !== "screenshotQuestion") {
    return [{ role: "user", content: JSON.stringify(payload) }];
  }

  const { imageDataUrl, ...rest } = payload ?? {};
  const content = [
    {
      type: "text",
      text: JSON.stringify({
        ...rest,
        instruction:
          task === "screenshotCapture"
            ? "OCR every readable text string. Do not filter by usefulness or language."
            : "Answer the user's question about this screenshot."
      })
    }
  ];

  if (imageDataUrl) {
    content.push({ type: "image_url", image_url: { url: imageDataUrl, detail: "high" } });
  }

  return [{ role: "user", content }];
}

export function extractJsonText(text = "") {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const objectStart = trimmed.indexOf("{");
  const arrayStart = trimmed.indexOf("[");
  const startCandidates = [objectStart, arrayStart].filter((index) => index >= 0);
  if (!startCandidates.length) return trimmed;

  const start = Math.min(...startCandidates);
  const objectEnd = trimmed.lastIndexOf("}");
  const arrayEnd = trimmed.lastIndexOf("]");
  const end = Math.max(objectEnd, arrayEnd);
  return end > start ? trimmed.slice(start, end + 1) : trimmed;
}
