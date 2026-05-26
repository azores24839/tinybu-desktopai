(() => {
  const contentExtractors = globalThis.TinyBuContentExtractors;

  if (!contentExtractors) return;

  function createSelectionPayload(text) {
    return {
      kind: "selection",
      title: document.title || "Captured Web Content",
      url: location.href,
      text: contentExtractors.cleanText(text || "")
    };
  }

  function extractPayload(kind) {
    const payload = contentExtractors.extractPayload(kind);
    if (!payload?.text) {
      throw new Error(kind === "youtube" ? "没有找到可捕捉的字幕。" : "没有找到可保存的正文。");
    }
    return payload;
  }

  function sendOpenCapture(payload, normalizeRuntimeErrorMessage) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: "TINYBU_OPEN_CAPTURE",
          payload
        },
        (response) => {
          const runtimeError = chrome.runtime.lastError;
          if (runtimeError) {
            reject(new Error(normalizeRuntimeErrorMessage(runtimeError.message)));
            return;
          }

          if (!response?.ok) {
            reject(new Error(response?.error || "捕捉失败。"));
            return;
          }

          resolve(response);
        }
      );
    });
  }

  globalThis.TinyBuCaptureActions = {
    createSelectionPayload,
    extractPayload,
    sendOpenCapture
  };
})();
