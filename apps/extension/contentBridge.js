(() => {
  const DESKTOP_CLIPBOARD_SUPPRESS_URL = "http://127.0.0.1:1421/v1/clipboard-suppress";
  const DESKTOP_CLIPBOARD_PROMPT_URL = "http://127.0.0.1:1421/v1/clipboard-prompt";
  const DESKTOP_PET_VISIBILITY_URL = "http://127.0.0.1:1421/v1/pet-visibility";
  const QUICK_CHAT_PROXY_URL = "http://127.0.0.1:8787/v1/tinybu/task";
  const QUICK_CHAT_MODEL = "MiniMax-M2.7";
  const AVATAR_BASE_URL = "http://127.0.0.1:1420/avatar/states";

  const avatarStateImages = {
    idle: `${AVATAR_BASE_URL}/idle.gif`,
    dragging: `${AVATAR_BASE_URL}/dragging.gif`,
    capturing: `${AVATAR_BASE_URL}/capturing.gif`,
    thinking: `${AVATAR_BASE_URL}/thinking.png`
  };

  function cleanText(text) {
    return String(text || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s+/g, "\n")
      .replace(/\s+\n/g, "\n")
      .trim();
  }

  function postJsonOptional(url, body) {
    return fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    }).catch(() => {
      // Desktop bridge endpoints are optional when the extension runs alone.
    });
  }

  function suppressDesktopClipboardPrompt(text) {
    const cleanSelection = cleanText(text);
    if (!cleanSelection) return;
    postJsonOptional(DESKTOP_CLIPBOARD_SUPPRESS_URL, { text: cleanSelection });
  }

  function promptDesktopClipboard(text) {
    const cleanSelection = cleanText(text);
    if (!cleanSelection) return;
    postJsonOptional(DESKTOP_CLIPBOARD_PROMPT_URL, { text: cleanSelection });
  }

  function setDesktopPetHidden(hidden) {
    postJsonOptional(DESKTOP_PET_VISIBILITY_URL, { hidden });
  }

  function parseQuickReply(data) {
    const outputText =
      data?.output_text ??
      data?.output
        ?.flatMap((item) => item.content ?? [])
        ?.find((content) => content.type === "output_text")?.text;

    if (!outputText) return "";

    try {
      return JSON.parse(outputText).reply?.trim() || "";
    } catch {
      return outputText.trim();
    }
  }

  async function sendQuickPetChat(message) {
    const response = await fetch(QUICK_CHAT_PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task: "quickPetChat",
        model: QUICK_CHAT_MODEL,
        payload: {
          message,
          instruction: "Reply briefly as a desktop language-learning buddy."
        }
      })
    });

    if (!response.ok) throw new Error(`Quick chat failed: ${response.status}`);
    return parseQuickReply(await response.json());
  }

  globalThis.TinyBuContentBridge = {
    avatarStateImages,
    promptDesktopClipboard,
    sendQuickPetChat,
    setDesktopPetHidden,
    suppressDesktopClipboardPrompt
  };
})();
