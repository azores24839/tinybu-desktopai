chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "TINYBU_PING") {
    sendResponse({ ok: true });
    return true;
  }

  if (message?.type === "TINYBU_DELIVER_TO_PAGE") {
    deliverToPage(message.payload);
    sendResponse({ ok: true });
    return true;
  }

  if (message?.type !== "TINYBU_EXTRACT") return false;

  try {
    const payload = extractPayload(message.kind);
    sendResponse({ ok: Boolean(payload.text), payload });
  } catch (error) {
    sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : "Unknown extraction error"
    });
  }

  return true;
});

(() => {
  const HOST_ID = "tinybu-floating-capture-host";
  const BRIDGE_INSTALLED_KEY = "__tinybuInvisibleCaptureBridgeInstalled";
  const STORAGE_KEY = "tinybuFloatingPosition";
  const CAPTURE_COUNT_KEY = "tinybuCaptureCount";
  const EDGE_GAP = 24;
  const VIEWPORT_GAP = 8;
  const BUTTON_SIZE = 112;
  const ROOT_WIDTH = 128;
  const DRAG_THRESHOLD = 4;
  const COPY_SELECTION_DELAY = 60;
  const BUBBLE_GAP = 12;
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

  if (!shouldInstallBrowserBridge()) return;
  installInvisibleBrowserBridge();
  return;

  function installInvisibleBrowserBridge() {
    if (window[BRIDGE_INSTALLED_KEY]) return;
    window[BRIDGE_INSTALLED_KEY] = true;
    removeFloatingHosts();
    setDesktopPetHidden(false);
    document.addEventListener("copy", handleInvisibleCopy, true);
  }

  function handleInvisibleCopy() {
    const text = getPromptableBrowserSelectionText();
    if (!text) return;
    promptDesktopClipboard(text);
  }

  function getPromptableBrowserSelectionText() {
    const selection = window.getSelection();
    const text = cleanText(selection?.toString() || "");
    if (!selection || selection.isCollapsed || text.length < 2 || isBrowserSelectionInEditable(selection)) return "";
    return text;
  }

  function isBrowserSelectionInEditable(selection) {
    if (!selection.rangeCount) return false;

    const node = selection.getRangeAt(0).commonAncestorContainer;
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    return Boolean(
      element?.closest(
        "input, textarea, select, [role='textbox'], [contenteditable]:not([contenteditable='false'])"
      )
    );
  }

  function initFloatingTinyBu() {
    if (!document.documentElement || dedupeFloatingHosts()) return;

    const host = document.createElement("div");
    host.id = HOST_ID;
    host.style.cssText = [
      "all: initial",
      "position: fixed",
      "inset: 0",
      "width: auto",
      "height: auto",
      "z-index: 2147483647",
      "pointer-events: none"
    ].join(";");

    const shadow = host.attachShadow({ mode: "open" });
    shadow.append(createFloatingStyles());

    const root = document.createElement("div");
    root.className = "tinybu-root";
    root.dataset.state = "idle";

    const button = document.createElement("button");
    button.className = "tinybu-button";
    button.type = "button";
    button.setAttribute("aria-label", "TinyBu capture assistant");
    button.title = "TinyBu Capture";

    const avatar = document.createElement("img");
    avatar.className = "tinybu-avatar";
    avatar.alt = "";
    avatar.draggable = false;
    avatar.src = avatarStateImages.idle;
    button.append(avatar);

    const status = document.createElement("span");
    status.className = "tinybu-status";
    status.textContent = "";
    status.hidden = true;

    const quickForm = document.createElement("form");
    quickForm.className = "tinybu-quick-form";

    const quickInput = document.createElement("input");
    quickInput.type = "text";
    quickInput.placeholder = "来聊聊天吧～";
    quickInput.maxLength = 120;
    quickForm.append(quickInput);

    root.append(button, status, quickForm);

    const bubble = document.createElement("div");
    bubble.className = "tinybu-bubble";
    bubble.setAttribute("role", "dialog");
    bubble.hidden = true;

    const feedbackBubble = document.createElement("div");
    feedbackBubble.className = "tinybu-bubble feedback";
    feedbackBubble.setAttribute("role", "status");
    feedbackBubble.hidden = true;

    shadow.append(root, bubble, feedbackBubble);
    document.documentElement.append(host);

    let mode = "idle";
    let position = getDefaultPosition();
    let selectedText = "";
    let selectedRect = null;
    let selectionTimer = 0;
    let feedbackTimer = 0;
    let ignoreSelectionCollapseUntil = 0;
    let drag = null;
    let quickBusy = false;
    let recordedCount = 0;

    applyPosition();
    readStoredCaptureCount().then(applyCaptureCount);
    readStoredPosition().then((storedPosition) => {
      if (isValidPosition(storedPosition)) {
        position = clampPosition(storedPosition);
        applyPosition();
      }
    });

    button.addEventListener("pointerdown", handlePointerDown);
    button.addEventListener("pointermove", handlePointerMove);
    button.addEventListener("pointerup", handlePointerUp);
    button.addEventListener("pointercancel", cancelDrag);
    quickForm.addEventListener("submit", submitQuickChat);

    document.addEventListener("selectionchange", handleSelectionChange);
    document.addEventListener("copy", handleCopySelection, true);
    document.addEventListener("visibilitychange", syncDesktopPetVisibility);
    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("focus", syncDesktopPetVisibility);
    window.addEventListener("blur", syncDesktopPetVisibility);
    window.addEventListener("pagehide", () => setDesktopPetHidden(false), { once: true });
    document.addEventListener("pointerdown", handleDocumentPointerDown, true);
    document.addEventListener("keydown", handleKeyDown, true);
    syncDesktopPetVisibility();

    function handlePointerDown(event) {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      clearSelectionTimer();
      clearFeedbackTimer();

      drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: position.x,
        originY: position.y,
        moved: false
      };

      button.setPointerCapture(event.pointerId);
    }

    function handlePointerMove(event) {
      if (!drag || drag.pointerId !== event.pointerId) return;

      const deltaX = event.clientX - drag.startX;
      const deltaY = event.clientY - drag.startY;

      if (!drag.moved && Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD) return;

      if (!drag.moved) {
        drag.moved = true;
        closeBubble();
        setMode("dragging");
        updateQuickFormVisibility();
      }

      position = clampPosition({
        x: drag.originX + deltaX,
        y: drag.originY + deltaY
      });
      applyPosition();
    }

    function handlePointerUp(event) {
      if (!drag || drag.pointerId !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();

      const wasDrag = drag.moved;
      releasePointer(event.pointerId);
      drag = null;

      if (wasDrag) {
        position = clampPosition(position);
        applyPosition();
        saveStoredPosition(position);
        setMode("idle");
        return;
      }

      showActionPrompt();
    }

    function cancelDrag(event) {
      if (!drag || drag.pointerId !== event.pointerId) return;
      releasePointer(event.pointerId);
      drag = null;
      setMode("idle");
    }

    function releasePointer(pointerId) {
      if (button.hasPointerCapture(pointerId)) {
        button.releasePointerCapture(pointerId);
      }
    }

    function handleCopySelection(event) {
      if (drag || isEventFromTinyBu(event)) return;

      const copiedSelection = getPromptableSelectionSnapshot();
      if (!copiedSelection) return;

      suppressDesktopClipboardPrompt(copiedSelection.text);
      selectedText = copiedSelection.text;
      selectedRect = copiedSelection.rect;
      ignoreSelectionCollapseUntil = Date.now() + 700;
      setMode("capturingSelection");
      clearSelectionTimer();
      selectionTimer = window.setTimeout(() => {
        selectionTimer = 0;
        if (mode !== "capturingSelection" || selectedText !== copiedSelection.text) return;
        renderSelectionBubble(copiedSelection.text, copiedSelection.rect);
      }, COPY_SELECTION_DELAY);
    }

    function handleSelectionChange() {
      const selection = window.getSelection();
      const text = cleanText(selection?.toString() || "");

      if (!isPromptableSelection(selection, text)) {
        if (Date.now() < ignoreSelectionCollapseUntil && (mode === "capturingSelection" || mode === "selectionPrompt")) {
          return;
        }
        clearSelectionTimer();
        if (mode === "selectionPrompt" || mode === "capturingSelection") closeBubble();
        return;
      }

      if ((mode === "selectionPrompt" || mode === "capturingSelection") && selectedText && text !== selectedText) {
        clearSelectionTimer();
        closeBubble();
      }
    }

    function renderSelectionBubble(text, rect) {
      clearFeedbackTimer();
      feedbackBubble.hidden = true;
      feedbackBubble.replaceChildren();
      setMode("selectionPrompt");
      bubble.className = "tinybu-bubble selection";
      bubble.replaceChildren();

      const yesButton = document.createElement("button");
      yesButton.type = "button";
      yesButton.className = "selection-save";
      yesButton.setAttribute("aria-label", "Yes, save this sentence to TinyBu");
      yesButton.innerHTML = `
        <span>要记下这句话吗？</span>
        <span class="selection-check" aria-hidden="true"></span>
      `;
      yesButton.addEventListener("click", () => captureSelection(text));

      bubble.append(yesButton);
      showBubbleAtRect(rect, "above", { arrowCenter: true });
      updateQuickFormVisibility();
    }

    function showActionPrompt() {
      selectedRect = null;
      clearFeedbackTimer();
      feedbackBubble.hidden = true;
      feedbackBubble.replaceChildren();
      updateQuickFormVisibility();
      setMode("actionPrompt");
      bubble.className = "tinybu-bubble actions";
      bubble.replaceChildren();

      const actions = document.createElement("div");
      actions.className = "menu-actions";

      const articleButton = createMenuButton("保存整篇文章", () => captureKind("article"));
      const subtitlesButton = createMenuButton("捕捉字幕", () => captureKind("youtube"));
      const hideButton = createMenuButton("隐藏", () => {
        setDesktopPetHidden(false);
        host.remove();
      });

      actions.append(articleButton, subtitlesButton, hideButton);
      bubble.append(actions);
      showActionMenuNearPet();
      updateQuickFormVisibility();
    }

    function createMenuButton(label, onClick) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.setAttribute("role", "menuitem");
      button.addEventListener("click", onClick);
      return button;
    }

    async function captureSelection(text) {
      const payload = basePayload("selection", text || selectedText);
      await sendCapturePayload(payload);
    }

    async function captureKind(kind) {
      try {
        const payload = extractPayload(kind);
        if (!payload?.text) {
          throw new Error(kind === "youtube" ? "没有找到可捕捉的字幕。" : "没有找到可保存的正文。");
        }
        await sendCapturePayload(payload);
      } catch (error) {
        showError(error);
      }
    }

    async function sendCapturePayload(payload) {
      try {
        if (!payload?.text) throw new Error("没有找到可捕捉的内容。");
        hideSelectionBubble();
        setMode("saving");
        showFeedback("正在记录...");
        const response = await sendOpenCapture(payload);
        if (Number.isFinite(response?.count)) {
          applyCaptureCount(response.count);
        } else {
          applyCaptureCount(recordedCount + 1);
        }
        setMode("saved");
        showFeedback("TinyBu记下啦♪");
        selectedText = "";
        selectedRect = null;
        feedbackTimer = window.setTimeout(closeBubble, 1500);
      } catch (error) {
        showError(error);
      }
    }

    function sendOpenCapture(payload) {
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

    function showFeedback(message) {
      clearFeedbackTimer();
      hideSelectionBubble();
      feedbackBubble.className = "tinybu-bubble feedback";
      feedbackBubble.replaceChildren();

      const text = document.createElement("strong");
      text.textContent = message;
      feedbackBubble.append(text);
      showFeedbackAbovePet();
      updateQuickFormVisibility();
    }

    function showFeedbackAbovePet() {
      feedbackBubble.hidden = false;
      feedbackBubble.style.visibility = "hidden";
      feedbackBubble.style.left = "0px";
      feedbackBubble.style.top = "0px";
      feedbackBubble.style.setProperty("--bubble-arrow-left", "28px");

      requestAnimationFrame(() => {
        const bubbleRect = feedbackBubble.getBoundingClientRect();
        const buttonRect = getButtonRect();
        const centerX = buttonRect.left + buttonRect.width / 2;
        const left = clampNumber(centerX - bubbleRect.width / 2, VIEWPORT_GAP, window.innerWidth - bubbleRect.width - VIEWPORT_GAP);
        const top = clampNumber(buttonRect.top - bubbleRect.height - BUBBLE_GAP, VIEWPORT_GAP, window.innerHeight - bubbleRect.height - VIEWPORT_GAP);
        const arrowLeft = clampNumber(centerX - left, 16, bubbleRect.width - 16);

        feedbackBubble.style.left = `${Math.round(left)}px`;
        feedbackBubble.style.top = `${Math.round(top)}px`;
        feedbackBubble.style.setProperty("--bubble-arrow-left", `${Math.round(arrowLeft)}px`);
        feedbackBubble.style.visibility = "visible";
      });
    }

    function showError(error) {
      const message = error instanceof Error ? normalizeRuntimeErrorMessage(error.message) : "捕捉失败。";
      setMode("error");
      showFeedback(message);
      feedbackTimer = window.setTimeout(closeBubble, 2600);
    }

    function normalizeRuntimeErrorMessage(message) {
      if (/Extension context invalidated/i.test(message || "")) {
        return "扩展刚刚更新啦，请刷新页面再试。";
      }

      return message || "捕捉失败。";
    }

    function closeBubble() {
      clearSelectionTimer();
      clearFeedbackTimer();
      hideSelectionBubble();
      feedbackBubble.hidden = true;
      feedbackBubble.replaceChildren();
      selectedText = "";
      selectedRect = null;
      ignoreSelectionCollapseUntil = 0;
      if (mode !== "dragging" && mode !== "capturingSelection") setMode("idle");
      if (mode === "capturingSelection") setMode("idle");
      updateQuickFormVisibility();
    }

    function hideSelectionBubble() {
      bubble.hidden = true;
      bubble.replaceChildren();
    }

    function clearFeedbackTimer() {
      if (feedbackTimer) {
        window.clearTimeout(feedbackTimer);
        feedbackTimer = 0;
      }
    }

    function clearSelectionTimer() {
      if (selectionTimer) {
        window.clearTimeout(selectionTimer);
        selectionTimer = 0;
      }
    }

    function showBubbleAtRect(anchorRect, preferredSide, options = {}) {
      bubble.hidden = false;
      bubble.style.visibility = "hidden";
      bubble.style.left = "0px";
      bubble.style.top = "0px";
      bubble.style.setProperty("--bubble-arrow-left", "28px");

      requestAnimationFrame(() => {
        const bubbleRect = bubble.getBoundingClientRect();
        const centerX = anchorRect.left + anchorRect.width / 2;
        let left = centerX - bubbleRect.width / 2;
        let top =
          preferredSide === "above"
            ? anchorRect.top - bubbleRect.height - BUBBLE_GAP
            : anchorRect.bottom + BUBBLE_GAP;

        if (top < VIEWPORT_GAP) {
          top = anchorRect.bottom + BUBBLE_GAP;
        }

        if (top + bubbleRect.height > window.innerHeight - VIEWPORT_GAP) {
          top = Math.max(VIEWPORT_GAP, window.innerHeight - bubbleRect.height - VIEWPORT_GAP);
        }

        left = clampNumber(left, VIEWPORT_GAP, window.innerWidth - bubbleRect.width - VIEWPORT_GAP);
        if (options.arrowCenter) {
          const arrowLeft = clampNumber(centerX - left, 16, bubbleRect.width - 16);
          bubble.style.setProperty("--bubble-arrow-left", `${Math.round(arrowLeft)}px`);
        }

        bubble.style.left = `${Math.round(left)}px`;
        bubble.style.top = `${Math.round(top)}px`;
        bubble.style.visibility = "visible";
      });
    }

    function showActionMenuNearPet() {
      bubble.hidden = false;
      bubble.style.visibility = "hidden";
      bubble.style.left = "0px";
      bubble.style.top = "0px";

      requestAnimationFrame(() => {
        const bubbleRect = bubble.getBoundingClientRect();
        const buttonRect = getButtonRect();
        const placeRight = buttonRect.left + buttonRect.width + BUBBLE_GAP + bubbleRect.width <= window.innerWidth - VIEWPORT_GAP;
        const left = placeRight
          ? buttonRect.right + BUBBLE_GAP
          : buttonRect.left - bubbleRect.width - BUBBLE_GAP;
        const top = clampNumber(
          buttonRect.top + 8,
          VIEWPORT_GAP,
          window.innerHeight - bubbleRect.height - VIEWPORT_GAP
        );

        bubble.style.left = `${Math.round(clampNumber(left, VIEWPORT_GAP, window.innerWidth - bubbleRect.width - VIEWPORT_GAP))}px`;
        bubble.style.top = `${Math.round(top)}px`;
        bubble.style.visibility = "visible";
      });
    }

    function getButtonRect() {
      const buttonLeft = position.x + (ROOT_WIDTH - BUTTON_SIZE) / 2;
      return {
        left: buttonLeft,
        top: position.y,
        right: buttonLeft + BUTTON_SIZE,
        bottom: position.y + BUTTON_SIZE,
        width: BUTTON_SIZE,
        height: BUTTON_SIZE
      };
    }

    function getSelectionViewportRect(selection) {
      if (!selection.rangeCount) return null;

      const range = selection.getRangeAt(0);
      const boundingRect = range.getBoundingClientRect();
      const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0);
      const rect = boundingRect.width > 0 && boundingRect.height > 0 ? boundingRect : rects[0];

      if (!rect || rect.width <= 0 || rect.height <= 0) return null;

      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height
      };
    }

    function getPromptableSelectionSnapshot() {
      const selection = window.getSelection();
      const text = cleanText(selection?.toString() || "");
      if (!isPromptableSelection(selection, text)) return null;

      const rect = getSelectionViewportRect(selection);
      if (!rect) return null;

      return { text, rect };
    }

    function isSelectionInEditable(selection) {
      if (!selection.rangeCount) return false;

      const node = selection.getRangeAt(0).commonAncestorContainer;
      const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
      return Boolean(
        element?.closest(
          "input, textarea, select, [role='textbox'], [contenteditable]:not([contenteditable='false'])"
        )
      );
    }

    function isPromptableSelection(selection, text) {
      return Boolean(selection && !selection.isCollapsed && text.length >= 2 && !isSelectionInEditable(selection));
    }

    function handleResize() {
      position = clampPosition(position);
      applyPosition();
      saveStoredPosition(position);
      if (mode === "actionPrompt") {
        showActionMenuNearPet();
      } else if ((mode === "saving" || mode === "saved" || mode === "error") && !feedbackBubble.hidden) {
        showFeedbackAbovePet();
      } else if ((mode === "selectionPrompt" || mode === "capturingSelection") && selectedRect) {
        closeBubble();
      }
    }

    function handleScroll() {
      if (mode === "selectionPrompt" || mode === "capturingSelection") closeBubble();
    }

    function handleDocumentPointerDown(event) {
      if (isEventFromTinyBu(event)) return;
      if (
        mode === "selectionPrompt" ||
        mode === "capturingSelection" ||
        mode === "actionPrompt" ||
        mode === "saved" ||
        mode === "error"
      ) {
        closeBubble();
      }
    }

    function handleKeyDown(event) {
      if (event.key === "Escape" && (!bubble.hidden || !feedbackBubble.hidden)) {
        closeBubble();
      }
    }

    function isEventFromTinyBu(event) {
      return event?.target === host || event?.composedPath?.().includes(host);
    }

    function getDefaultPosition() {
      return clampPosition({
        x: window.innerWidth - ROOT_WIDTH - EDGE_GAP,
        y: window.innerHeight - BUTTON_SIZE - EDGE_GAP
      });
    }

    function clampPosition(nextPosition) {
      return {
        x: clampNumber(nextPosition.x, VIEWPORT_GAP, window.innerWidth - ROOT_WIDTH - VIEWPORT_GAP),
        y: clampNumber(nextPosition.y, VIEWPORT_GAP, window.innerHeight - BUTTON_SIZE - VIEWPORT_GAP)
      };
    }

    function applyPosition() {
      root.style.transform = `translate3d(${Math.round(position.x)}px, ${Math.round(position.y)}px, 0)`;
    }

    function setMode(nextMode) {
      mode = nextMode;
      root.dataset.state = nextMode;
      avatar.src = avatarStateImages[getAvatarState(nextMode)];
      updateQuickFormVisibility();
    }

    function applyCaptureCount(count) {
      recordedCount = Math.max(0, Number(count) || 0);
      status.textContent = recordedCount > 0 ? `已记录${recordedCount}条` : "";
      status.hidden = recordedCount <= 0;
    }

    function getAvatarState(nextMode) {
      if (nextMode === "dragging") return "dragging";
      if (nextMode === "selectionPrompt" || nextMode === "capturingSelection" || nextMode === "saving" || nextMode === "saved") return "capturing";
      if (nextMode === "thinking") return "thinking";
      return "idle";
    }

    async function submitQuickChat(event) {
      event.preventDefault();
      const message = quickInput.value.trim();
      if (!message || quickBusy) return;

      quickInput.value = "";
      quickInput.disabled = true;
      quickBusy = true;
      setMode("thinking");
      showFeedback("我想一下...");

      try {
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
        const reply = parseQuickReply(await response.json());
        showFeedback(reply || "我在，但刚刚没想好。");
        feedbackTimer = window.setTimeout(closeBubble, 5000);
      } catch (error) {
        console.warn("TinyBu quick chat failed", error);
        showFeedback("我现在连不上，先试试主窗口。");
        feedbackTimer = window.setTimeout(closeBubble, 5000);
      } finally {
        quickBusy = false;
        quickInput.disabled = false;
        setMode("idle");
      }
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

    function updateQuickFormVisibility() {
      quickForm.hidden =
        mode === "dragging" ||
        mode === "selectionPrompt" ||
        mode === "capturingSelection" ||
        mode === "saving" ||
        mode === "saved" ||
        mode === "error" ||
        mode === "thinking" ||
        !bubble.hidden ||
        !feedbackBubble.hidden;
    }
  }

  function shouldInstallBrowserBridge() {
    if (typeof chrome === "undefined" || !document.documentElement || !chrome.runtime?.id) return false;
    if (!/^(https?:|file:)/.test(location.protocol)) return false;
    if (/^(127\.0\.0\.1|localhost):1420$/.test(location.host)) return false;
    return true;
  }

  function suppressDesktopClipboardPrompt(text) {
    const cleanSelection = cleanText(text);
    if (!cleanSelection) return;

    fetch(DESKTOP_CLIPBOARD_SUPPRESS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ text: cleanSelection })
    }).catch(() => {
      // The desktop app is optional for the browser selection bubble.
    });
  }

  function promptDesktopClipboard(text) {
    const cleanSelection = cleanText(text);
    if (!cleanSelection) return;

    fetch(DESKTOP_CLIPBOARD_PROMPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ text: cleanSelection })
    }).catch(() => {
      // If the desktop bridge is unavailable, the desktop clipboard watcher may still catch the copy.
    });
  }

  function syncDesktopPetVisibility() {
    setDesktopPetHidden(document.visibilityState === "visible" && document.hasFocus());
  }

  function setDesktopPetHidden(hidden) {
    fetch(DESKTOP_PET_VISIBILITY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ hidden })
    }).catch(() => {
      // The desktop pet is optional when the browser companion is active.
    });
  }

  function dedupeFloatingHosts() {
    if (!document.documentElement) return true;

    const hosts = Array.from(document.querySelectorAll(`#${HOST_ID}`));
    hosts.slice(1).forEach((node) => node.remove());
    return hosts.length > 0;
  }

  function removeFloatingHosts() {
    if (!document.documentElement) return;
    document.querySelectorAll(`#${HOST_ID}`).forEach((node) => node.remove());
  }

  function readStoredPosition() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(STORAGE_KEY, (result) => {
          if (chrome.runtime.lastError) {
            resolve(null);
            return;
          }

          resolve(result?.[STORAGE_KEY] || null);
        });
      } catch {
        resolve(null);
      }
    });
  }

  function readStoredCaptureCount() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(CAPTURE_COUNT_KEY, (result) => {
          void chrome.runtime.lastError;
          resolve(result?.[CAPTURE_COUNT_KEY] || 0);
        });
      } catch {
        resolve(0);
      }
    });
  }

  function saveStoredPosition(position) {
    try {
      chrome.storage.local.set(
        {
          [STORAGE_KEY]: {
            x: Math.round(position.x),
            y: Math.round(position.y)
          }
        },
        () => {
          void chrome.runtime.lastError;
        }
      );
    } catch {
      // Position persistence is a convenience; capture still works without it.
    }
  }

  function isValidPosition(position) {
    return Number.isFinite(position?.x) && Number.isFinite(position?.y);
  }

  function clampNumber(value, min, max) {
    if (max < min) return Math.max(0, min);
    return Math.min(Math.max(value, min), max);
  }

  function createFloatingStyles() {
    const style = document.createElement("style");
    style.textContent = `
      :host {
        all: initial;
      }

      *,
      *::before,
      *::after {
        box-sizing: border-box;
      }

      .tinybu-root {
        position: absolute;
        left: 0;
        top: 0;
        z-index: 2147483647;
        display: grid;
        align-content: start;
        place-items: center;
        width: ${ROOT_WIDTH}px;
        height: auto;
        pointer-events: none;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        transition: transform 80ms linear;
      }

      .tinybu-button {
        position: relative;
        display: grid;
        place-items: center;
        width: ${BUTTON_SIZE}px;
        height: ${BUTTON_SIZE}px;
        border: 0;
        border-radius: 0;
        background: transparent;
        box-shadow: none;
        color: #172021;
        cursor: grab;
        outline: none;
        padding: 0;
        pointer-events: auto;
        user-select: none;
        touch-action: none;
        transition:
          background 160ms ease,
          border-color 160ms ease,
          box-shadow 160ms ease,
          transform 160ms ease;
      }

      .tinybu-button:hover,
      .tinybu-button:focus-visible {
        transform: translateY(-1px);
      }

      .tinybu-root[data-state="dragging"] .tinybu-button {
        cursor: grabbing;
        transform: scale(0.96);
      }

      .tinybu-root[data-state="selectionPrompt"] .tinybu-button,
      .tinybu-root[data-state="capturingSelection"] .tinybu-button,
      .tinybu-root[data-state="actionPrompt"] .tinybu-button {
        filter: none;
      }

      .tinybu-root[data-state="saving"] .tinybu-button {
        animation: tinybu-pulse 900ms ease-in-out infinite;
      }

      .tinybu-root[data-state="saved"] .tinybu-button {
        filter: none;
      }

      .tinybu-root[data-state="error"] .tinybu-button {
        filter: drop-shadow(0 12px 22px rgba(196, 64, 54, 0.18));
      }

      .tinybu-avatar {
        display: block;
        width: 104px;
        height: 104px;
        object-fit: contain;
        pointer-events: none;
        user-select: none;
        filter: none;
      }

      .tinybu-root[data-state="selectionPrompt"] .tinybu-avatar,
      .tinybu-root[data-state="capturingSelection"] .tinybu-avatar,
      .tinybu-root[data-state="saving"] .tinybu-avatar,
      .tinybu-root[data-state="saved"] .tinybu-avatar {
        width: ${BUTTON_SIZE}px;
        height: ${BUTTON_SIZE}px;
        filter: none;
        transform: none;
      }

      .tinybu-status {
        width: max-content;
        max-width: 120px;
        border: 1px solid rgba(223, 228, 220, 0.95);
        border-radius: 999px;
        background: #fffdf8;
        color: #967d63;
        padding: 3px 9px;
        font-size: 12px;
        font-weight: 800;
        line-height: 1.2;
        white-space: nowrap;
        pointer-events: none;
      }

      .tinybu-status[hidden] {
        display: none;
      }

      .tinybu-quick-form {
        z-index: 3;
        width: 119px;
        margin-top: 8px;
        pointer-events: auto;
      }

      .tinybu-quick-form[hidden] {
        display: none;
      }

      .tinybu-quick-form input {
        width: 100%;
        min-height: 30px;
        border: 1.6px solid #7a5642;
        border-radius: 999px;
        background: #fffdf8;
        color: #6a4936;
        padding: 0 14px;
        font: inherit;
        font-size: 12px;
        font-weight: 800;
        outline: none;
        box-shadow: 0 8px 20px rgba(106, 73, 54, 0.12);
      }

      .tinybu-quick-form input::placeholder {
        color: rgba(106, 73, 54, 0.62);
      }

      .tinybu-quick-form input:focus {
        border-color: #5d3f2f;
        box-shadow: 0 0 0 3px rgba(254, 224, 141, 0.5);
      }

      .tinybu-bubble {
        position: absolute;
        z-index: 2147483647;
        display: grid;
        gap: 10px;
        width: min(280px, calc(100vw - 16px));
        border: 1px solid rgba(223, 228, 220, 0.98);
        border-radius: 12px;
        background: #fffdf8;
        color: #172021;
        box-shadow: 0 18px 48px rgba(23, 32, 33, 0.18);
        padding: 12px;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        pointer-events: auto;
      }

      .tinybu-bubble[hidden] {
        display: none;
      }

      .tinybu-bubble.actions {
        width: max-content;
        min-width: 112px;
        gap: 3px;
        border: 1px solid rgba(223, 228, 220, 0.98);
        border-radius: 12px;
        background: #fffdf8;
        box-shadow: none;
        padding: 5px;
      }

      .tinybu-bubble.selection {
        width: min(150px, calc(100vw - 16px));
        border: 0;
        border-radius: 999px;
        background: transparent;
        box-shadow: none;
        padding: 0;
      }

      .tinybu-bubble strong {
        color: #172021;
        font-size: 14px;
        font-weight: 800;
        line-height: 1.28;
      }

      .tinybu-bubble p {
        display: -webkit-box;
        overflow: hidden;
        margin: 0;
        color: #65716d;
        font-size: 12px;
        line-height: 1.45;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
      }

      .bubble-actions,
      .menu-actions {
        display: grid;
        gap: 3px;
      }

      .menu-actions {
        flex-direction: column;
      }

      .tinybu-bubble button {
        min-height: 34px;
        border: 1px solid #dfe4dc;
        border-radius: 8px;
        background: #ffffff;
        color: #172021;
        cursor: pointer;
        font: inherit;
        font-size: 13px;
        font-weight: 760;
        line-height: 1.2;
        padding: 8px 10px;
        text-align: center;
      }

      .tinybu-bubble button:hover,
      .tinybu-bubble button:focus-visible {
        border-color: rgba(36, 108, 91, 0.34);
        background: #e7f5ef;
        outline: none;
      }

      .tinybu-bubble button.primary {
        border-color: #246c5b;
        background: #246c5b;
        color: #ffffff;
      }

      .tinybu-bubble button.primary:hover,
      .tinybu-bubble button.primary:focus-visible {
        background: #1f5c4e;
      }

      .tinybu-bubble.actions button {
        min-height: 24px;
        border: 0;
        border-radius: 8px;
        background: transparent;
        color: #967d63;
        padding: 0 10px;
        font-size: 11px;
        font-weight: 800;
        line-height: 1.2;
        white-space: nowrap;
      }

      .tinybu-bubble.actions button:hover,
      .tinybu-bubble.actions button:focus-visible {
        background: #fee08d;
        outline: none;
      }

      .tinybu-bubble button.selection-save {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        width: 100%;
        min-height: 25px;
        border: 0;
        border-radius: 999px;
        background: #fee08d;
        color: #967d63;
        box-shadow: none;
        font-size: 10px;
        font-weight: 900;
        line-height: 1;
        padding: 4px 7px 4px 12px;
        text-align: left;
      }

      .tinybu-bubble button.selection-save:hover,
      .tinybu-bubble button.selection-save:focus-visible {
        border-color: transparent;
        background: #fee08d;
        color: #967d63;
        outline: none;
        transform: translateY(-1px);
      }

      .tinybu-bubble button.selection-save:active {
        transform: translateY(0) scale(0.99);
      }

      .selection-check {
        position: relative;
        display: grid;
        flex: 0 0 auto;
        place-items: center;
        width: 19px;
        height: 19px;
        border-radius: 50%;
        background: #ffffff;
      }

      .selection-check::after {
        content: "";
        display: block;
        width: 8px;
        height: 5px;
        border-left: 2px solid rgba(150, 125, 99, 0.18);
        border-bottom: 2px solid rgba(150, 125, 99, 0.18);
        transform: translateY(-1px) rotate(-45deg);
      }

      .tinybu-bubble button.selection-save:hover .selection-check::after,
      .tinybu-bubble button.selection-save:focus-visible .selection-check::after,
      .tinybu-bubble button.selection-save:active .selection-check::after {
        border-color: #f6bf34;
      }

      .tinybu-bubble.feedback {
        position: absolute;
        width: max-content;
        max-width: min(210px, calc(100vw - 16px));
        border: 1.5px solid #7a5642;
        border-radius: 18px;
        background: #fffdf8;
        color: #6a4936;
        padding: 8px 12px;
        box-shadow: none;
        overflow: hidden;
        pointer-events: none;
        text-align: center;
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
      }

      .tinybu-bubble.feedback strong {
        color: #6a4936;
        font-size: 12px;
        font-weight: 850;
        line-height: 1.35;
      }

      .tinybu-bubble.feedback::after {
        content: "";
        position: absolute;
        left: calc(var(--bubble-arrow-left, 50%) - 6px);
        bottom: -7px;
        width: 12px;
        height: 12px;
        transform: rotate(45deg);
        border-right: 1.5px solid #7a5642;
        border-bottom: 1.5px solid #7a5642;
        background: #fffdf8;
      }

      .tinybu-bubble.feedback[hidden] {
        display: none;
      }

      @keyframes tinybu-pulse {
        0%,
        100% {
          transform: scale(1);
        }
        50% {
          transform: scale(1.06);
        }
      }
    `;
    return style;
  }
})();

function extractPayload(kind) {
  if (kind === "youtube") return extractYouTube();
  if (kind === "article") return extractArticle();
  return extractSelection();
}

function basePayload(kind, text) {
  return {
    kind,
    title: document.title.replace(/\s+-\s+YouTube$/, "").trim() || "Captured Web Content",
    url: location.href,
    text: cleanText(text),
    capturedAt: new Date().toISOString()
  };
}

function extractSelection() {
  const selection = window.getSelection()?.toString() || "";

  if (selection.trim()) {
    return basePayload("selection", selection);
  }

  const visibleCaption = getVisibleCaptions();
  if (visibleCaption) {
    return basePayload(location.hostname.includes("youtube") ? "youtube" : "video", visibleCaption);
  }

  const activeParagraph = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
  const nearestText = activeParagraph?.closest("p, li, blockquote, h1, h2, h3")?.textContent || "";
  return basePayload("selection", nearestText);
}

function extractArticle() {
  const article = document.querySelector("article");
  const main = document.querySelector("main");
  const root = article || scoreReadableContainers()[0] || main || document.body;
  const chunks = Array.from(root.querySelectorAll("h1, h2, h3, p, li, blockquote"))
    .filter((node) => isLikelyMainContentNode(node, root))
    .map((node) => cleanText(node.textContent || ""))
    .filter(isUsefulArticleLine);

  if (chunks.length) {
    return basePayload("article", chunks.join("\n\n"));
  }

  return basePayload("article", cleanText(root.innerText || ""));
}

function extractYouTube() {
  const transcriptLines = getYouTubeTranscriptLines();

  const dedupedTranscript = dedupeLines(transcriptLines);
  if (dedupedTranscript.length >= 3) {
    return basePayload("youtube", dedupedTranscript.join("\n"));
  }

  const visibleCaption = getVisibleCaptions();
  if (visibleCaption) {
    return basePayload("youtube", visibleCaption);
  }

  const selection = window.getSelection()?.toString() || "";
  if (selection.trim()) {
    return basePayload("youtube", selection);
  }

  return {
    ...basePayload("youtube", ""),
    text: ""
  };
}

function scoreReadableContainers() {
  const containers = Array.from(document.querySelectorAll("article, main, section, div"))
    .filter((node) => !isRejectedContainer(node))
    .map((node) => {
      const paragraphs = Array.from(node.querySelectorAll("p, li, blockquote")).filter((child) =>
        isLikelyMainContentNode(child, node)
      );
      const textLength = paragraphs.reduce((sum, paragraph) => sum + cleanText(paragraph.textContent || "").length, 0);
      const linkTextLength = Array.from(node.querySelectorAll("a")).reduce(
        (sum, link) => sum + cleanText(link.textContent || "").length,
        0
      );
      const linkPenalty = linkTextLength / Math.max(textLength, 1);
      return { node, score: paragraphs.length * 160 + textLength - linkPenalty * 420 };
    })
    .filter((item) => item.score > 500)
    .sort((a, b) => b.score - a.score);

  return containers.map((item) => item.node);
}

function getVisibleCaptions() {
  return dedupeLines(
    Array.from(document.querySelectorAll(".ytp-caption-window-container .ytp-caption-segment, .ytp-caption-segment"))
      .map((node) => cleanText(node.textContent || ""))
      .map(normalizeSubtitleText)
      .filter(isUsefulSubtitleLine)
  ).join("\n");
}

function getYouTubeTranscriptLines() {
  const fromTranscriptPanel = getTranscriptLinesFromVisiblePanel();
  if (fromTranscriptPanel.length >= 3) return fromTranscriptPanel;

  const segmentNodes = Array.from(document.querySelectorAll("ytd-transcript-segment-renderer"));
  const fromSegments = segmentNodes
    .map((node) => {
      const textNode =
        node.querySelector("#content yt-formatted-string") ||
        node.querySelector("yt-formatted-string.segment-text") ||
        node.querySelector(".segment-text") ||
        node.querySelector("yt-formatted-string:not([class*='time'])");
      return normalizeSubtitleText(cleanText(textNode?.textContent || ""));
    })
    .filter(isUsefulSubtitleLine);

  if (fromSegments.length >= 3) return fromSegments;

  const transcriptPanel = document.querySelector("ytd-transcript-renderer, ytd-engagement-panel-section-list-renderer[target-id='engagement-panel-searchable-transcript']");
  if (!transcriptPanel) return [];

  return Array.from(transcriptPanel.querySelectorAll("yt-formatted-string, .segment-text"))
    .map((node) => cleanText(node.textContent || ""))
    .map(stripLeadingTimestamp)
    .map(normalizeSubtitleText)
    .filter(isUsefulSubtitleLine);
}

function deliverToPage(payload) {
  let count = 0;
  const message = {
    type: "TINYBU_EXTENSION_CAPTURE",
    payload
  };

  const interval = setInterval(() => {
    window.postMessage(message, window.location.origin);
    count += 1;
    if (count >= 20) clearInterval(interval);
  }, 150);

  window.postMessage(message, window.location.origin);
}

function getTranscriptLinesFromVisiblePanel() {
  const panels = Array.from(
    document.querySelectorAll(
      "ytd-engagement-panel-section-list-renderer[target-id='engagement-panel-searchable-transcript'], ytd-engagement-panel-section-list-renderer, ytd-transcript-renderer, tp-yt-paper-dialog"
    )
  ).filter((node) => {
    const text = cleanText(node.textContent || "");
    return /(转写文稿|文字记录|transcript)/i.test(text);
  });

  for (const panel of panels) {
    const rows = Array.from(
      panel.querySelectorAll(
        "ytd-transcript-segment-renderer, [class*='segment'], [class*='Segment'], div, button"
      )
    )
      .map((node) => cleanText(node.textContent || ""))
      .map(normalizeTranscriptRow)
      .filter(isUsefulSubtitleLine);

    const deduped = dedupeLines(rows);
    if (deduped.length >= 3) return deduped;

    const fromText = extractTimestampedLinesFromText(cleanText(panel.textContent || ""));
    if (fromText.length >= 3) return fromText;
  }

  return [];
}

function extractTimestampedLinesFromText(text) {
  const matches = Array.from(
    text.matchAll(/(?:^|\s)(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+?)(?=\s+\d{1,2}:\d{2}(?::\d{2})?\s+|$)/g)
  );

  return dedupeLines(
    matches
      .map((match) => normalizeSubtitleText(cleanText(match[2] || "")))
      .filter(isUsefulSubtitleLine)
  );
}

function normalizeTranscriptRow(text) {
  const cleaned = cleanText(text);
  const timestampMatches = cleaned.match(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g) || [];

  if (!timestampMatches.length) return cleaned;

  const lastTimestamp = timestampMatches[timestampMatches.length - 1];
  const afterTimestamp = cleaned.slice(cleaned.lastIndexOf(lastTimestamp) + lastTimestamp.length);
  return normalizeSubtitleText(afterTimestamp.replace(/^[-–—•\s]+/, ""));
}

function stripLeadingTimestamp(text) {
  return normalizeSubtitleText(text.replace(/^\d{1,2}:\d{2}(?::\d{2})?\s*/, ""));
}

function normalizeSubtitleText(text) {
  return cleanText(
    text
      .replace(/^\s*\d{1,2}:\d{2}(?::\d{2})?\s*\d*\s*(?:分钟)?\d*\s*秒钟\s*/g, "")
      .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b\s*\d*\s*(?:分钟)?\d*\s*秒钟\s*/g, " ")
      .replace(/^\s*\d+\s*(?:分钟)?\d*\s*秒钟\s*/g, "")
      .replace(/\s+\d+\s*(?:分钟)?\d*\s*秒钟\s*/g, " ")
      .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, " ")
      .replace(/^\s*\d+\s*(seconds?|secs?)\s*/gi, "")
  );
}

function isRejectedContainer(node) {
  const text = [
    node.id,
    node.className,
    node.getAttribute("role"),
    node.getAttribute("aria-label")
  ]
    .join(" ")
    .toLowerCase();

  return /nav|menu|sidebar|aside|footer|header|comment|related|recommend|popular|trending|promo|advert|share|social|breadcrumb|pagination|newsletter|subscribe/.test(
    text
  );
}

function isLikelyMainContentNode(node, root) {
  if (!root.contains(node)) return false;
  if (node.closest("nav, aside, footer, header, form, button, [role='navigation'], [role='complementary']")) return false;
  if (node.closest("[class*='related'], [class*='recommend'], [class*='popular'], [class*='sidebar'], [class*='footer'], [class*='comment'], [class*='share'], [class*='advert'], [id*='related'], [id*='recommend'], [id*='sidebar']")) return false;

  const text = cleanText(node.textContent || "");
  if (!isUsefulArticleLine(text)) return false;

  const linkText = Array.from(node.querySelectorAll("a")).reduce(
    (sum, link) => sum + cleanText(link.textContent || "").length,
    0
  );

  return linkText / Math.max(text.length, 1) < 0.65;
}

function isUsefulArticleLine(text) {
  if (text.length < 40) return false;
  if (text.length > 1800) return false;
  if (/^(related|recommended|more from|read more|advertisement|subscribe|share|sign up|follow us)$/i.test(text)) {
    return false;
  }
  return /[.!?。！？]/.test(text) || text.split(/\s+/).length >= 8;
}

function isUsefulSubtitleLine(text) {
  if (!text) return false;
  if (text.length < 2 || text.length > 260) return false;
  if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(text)) return false;
  if (/(转写文稿|文字记录|搜索转写内容|transcript|search transcript)/i.test(text)) return false;
  if (/^\d+(\.\d+)?[万千百亿]?(次观看| views?)\b/i.test(text)) return false;
  if (/^\d+\s*(years?|months?|weeks?|days?|hours?) ago$/i.test(text)) return false;
  if (/^[\d,.\s]+$/.test(text)) return false;
  if (/[|•]/.test(text) && !/[.!?。！？]/.test(text)) return false;
  if (/(subscribe|liked|share|download|save|clip|thanks|join|replay|autoplay|views|watch later)/i.test(text)) {
    return false;
  }
  if (/[\u4e00-\u9fff].*(次观看|年前|个月前|直播|已订阅)/.test(text)) return false;
  return /[a-zA-Z\u4e00-\u9fff]/.test(text);
}

function dedupeLines(lines) {
  const seen = new Set();
  return lines.filter((line) => {
    const key = line.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function cleanText(text) {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\s+\n/g, "\n")
    .trim();
}
