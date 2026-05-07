type ImageTaskPayload = { imageDataUrl?: string; [key: string]: unknown };

function isScreenshotTask(task: string) {
  return task === "screenshotCapture" || task === "screenshotQuestion";
}

function screenshotInstruction(task: string) {
  return task === "screenshotCapture"
    ? "OCR every readable text string. Do not filter by usefulness or language."
    : "Answer the user's question about this screenshot.";
}

export function buildOpenAiInput(task: string, payload: unknown) {
  if (!isScreenshotTask(task)) return JSON.stringify(payload);

  const screenshotPayload = payload as ImageTaskPayload;
  const { imageDataUrl, ...textPayload } = screenshotPayload;
  const content: Array<
    { type: "input_text"; text: string } | { type: "input_image"; image_url?: string; detail?: "high" }
  > = [
    {
      type: "input_text",
      text: JSON.stringify({
        ...textPayload,
        instruction: screenshotInstruction(task)
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

export function buildOpenRouterMessages(task: string, payload: unknown) {
  if (!isScreenshotTask(task)) {
    return [
      {
        role: "user",
        content: JSON.stringify(payload)
      }
    ];
  }

  const screenshotPayload = payload as ImageTaskPayload;
  const { imageDataUrl, ...textPayload } = screenshotPayload;
  const content: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string; detail: "high" } }> = [
    {
      type: "text",
      text: JSON.stringify({
        ...textPayload,
        instruction: screenshotInstruction(task)
      })
    }
  ];

  if (imageDataUrl) {
    content.push({
      type: "image_url",
      image_url: { url: imageDataUrl, detail: "high" }
    });
  }

  return [
    {
      role: "user",
      content
    }
  ];
}
