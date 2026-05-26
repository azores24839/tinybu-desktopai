(() => {
  const contentExtractors = globalThis.TinyBuContentExtractors;

  if (!contentExtractors || typeof chrome === "undefined" || !chrome.runtime?.onMessage) return;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "TINYBU_PING") {
      sendResponse({ ok: true });
      return true;
    }

    if (message?.type === "TINYBU_DELIVER_TO_PAGE") {
      contentExtractors.deliverToPage(message.payload);
      sendResponse({ ok: true });
      return true;
    }

    if (message?.type !== "TINYBU_EXTRACT") return false;

    try {
      const payload = contentExtractors.extractPayload(message.kind);
      sendResponse({ ok: Boolean(payload.text), payload });
    } catch (error) {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown extraction error"
      });
    }

    return true;
  });
})();
