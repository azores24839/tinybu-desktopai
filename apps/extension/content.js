const contentExtractors = globalThis.TinyBuContentExtractors;
const contentSelection = globalThis.TinyBuContentSelection;
const floatingLayout = globalThis.TinyBuFloatingLayout;
const captureActions = globalThis.TinyBuCaptureActions;
const contentRuntime = globalThis.TinyBuContentRuntime;
const viewHelpers = globalThis.TinyBuViewHelpers;
const cleanText = (text) => contentExtractors.cleanText(text);

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
  const bridge = globalThis.TinyBuContentBridge;
  const floatingStyles = globalThis.TinyBuFloatingStyles;
  const runtime = contentRuntime?.createContentRuntime({
    hostId: HOST_ID,
    storageKey: STORAGE_KEY,
    captureCountKey: CAPTURE_COUNT_KEY,
    bridge
  });

  if (
    !bridge ||
    !contentExtractors ||
    !contentSelection ||
    !floatingLayout ||
    !captureActions ||
    !runtime ||
    !viewHelpers ||
    !floatingStyles ||
    !runtime.shouldInstallBrowserBridge()
  ) {
    return;
  }
  installInvisibleBrowserBridge();
  return;

  function installInvisibleBrowserBridge() {
    if (window[BRIDGE_INSTALLED_KEY]) return;
    window[BRIDGE_INSTALLED_KEY] = true;
    runtime.removeFloatingHosts();
    bridge.setDesktopPetHidden(false);
    document.addEventListener("copy", handleInvisibleCopy, true);
  }

  function handleInvisibleCopy() {
    const text = contentSelection.getPromptableBrowserSelectionText(cleanText);
    if (!text) return;
    bridge.promptDesktopClipboard(text);
  }

  function initFloatingTinyBu() {
    if (!document.documentElement || runtime.dedupeFloatingHosts()) return;

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
    shadow.append(floatingStyles.createFloatingStyles({ rootWidth: ROOT_WIDTH, buttonSize: BUTTON_SIZE }));

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
    avatar.src = bridge.avatarStateImages.idle;
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

    const layout = floatingLayout.createFloatingLayout({
      rootWidth: ROOT_WIDTH,
      buttonSize: BUTTON_SIZE,
      edgeGap: EDGE_GAP,
      viewportGap: VIEWPORT_GAP,
      bubbleGap: BUBBLE_GAP
    });

    let mode = "idle";
    let position = layout.getDefaultPosition();
    let selectedText = "";
    let selectedRect = null;
    let selectionTimer = 0;
    let feedbackTimer = 0;
    let ignoreSelectionCollapseUntil = 0;
    let drag = null;
    let quickBusy = false;
    let recordedCount = 0;

    applyPosition();
    runtime.readStoredCaptureCount().then(applyCaptureCount);
    runtime.readStoredPosition().then((storedPosition) => {
      if (contentRuntime.isValidPosition(storedPosition)) {
        position = layout.clampPosition(storedPosition);
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
    document.addEventListener("visibilitychange", runtime.syncDesktopPetVisibility);
    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("focus", runtime.syncDesktopPetVisibility);
    window.addEventListener("blur", runtime.syncDesktopPetVisibility);
    window.addEventListener("pagehide", () => bridge.setDesktopPetHidden(false), { once: true });
    document.addEventListener("pointerdown", handleDocumentPointerDown, true);
    document.addEventListener("keydown", handleKeyDown, true);
    runtime.syncDesktopPetVisibility();

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

      position = layout.clampPosition({
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
        position = layout.clampPosition(position);
        applyPosition();
        runtime.saveStoredPosition(position);
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

      const copiedSelection = contentSelection.getPromptableSelectionSnapshot(cleanText);
      if (!copiedSelection) return;

      bridge.suppressDesktopClipboardPrompt(copiedSelection.text);
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

      if (!contentSelection.isPromptableSelection(selection, text)) {
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
      bubble.append(viewHelpers.createSelectionSaveButton(() => captureSelection(text)));
      layout.showBubbleAtRect(bubble, rect, "above", { arrowCenter: true });
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
      bubble.append(
        viewHelpers.createActionMenu([
          { label: "保存整篇文章", onClick: () => captureKind("article") },
          { label: "捕捉字幕", onClick: () => captureKind("youtube") },
          {
            label: "隐藏",
            onClick: () => {
              bridge.setDesktopPetHidden(false);
              host.remove();
            }
          }
        ])
      );
      layout.showActionMenuNearPet(bubble, position);
      updateQuickFormVisibility();
    }

    async function captureSelection(text) {
      const payload = captureActions.createSelectionPayload(text || selectedText);
      await sendCapturePayload(payload);
    }

    async function captureKind(kind) {
      try {
        const payload = captureActions.extractPayload(kind);
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
        const response = await captureActions.sendOpenCapture(payload, viewHelpers.normalizeRuntimeErrorMessage);
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

    function showFeedback(message) {
      clearFeedbackTimer();
      hideSelectionBubble();
      viewHelpers.renderFeedbackMessage(feedbackBubble, message);
      layout.showFeedbackAbovePet(feedbackBubble, position);
      updateQuickFormVisibility();
    }

    function showError(error) {
      const message = error instanceof Error ? viewHelpers.normalizeRuntimeErrorMessage(error.message) : "捕捉失败。";
      setMode("error");
      showFeedback(message);
      feedbackTimer = window.setTimeout(closeBubble, 2600);
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

    function handleResize() {
      position = layout.clampPosition(position);
      applyPosition();
      runtime.saveStoredPosition(position);
      if (mode === "actionPrompt") {
        layout.showActionMenuNearPet(bubble, position);
      } else if ((mode === "saving" || mode === "saved" || mode === "error") && !feedbackBubble.hidden) {
        layout.showFeedbackAbovePet(feedbackBubble, position);
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

    function applyPosition() {
      root.style.transform = `translate3d(${Math.round(position.x)}px, ${Math.round(position.y)}px, 0)`;
    }

    function setMode(nextMode) {
      mode = nextMode;
      root.dataset.state = nextMode;
      avatar.src = bridge.avatarStateImages[viewHelpers.getAvatarState(nextMode)];
      updateQuickFormVisibility();
    }

    function applyCaptureCount(count) {
      recordedCount = Math.max(0, Number(count) || 0);
      status.textContent = recordedCount > 0 ? `已记录${recordedCount}条` : "";
      status.hidden = recordedCount <= 0;
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
        const reply = await bridge.sendQuickPetChat(message);
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

    function updateQuickFormVisibility() {
      quickForm.hidden = viewHelpers.shouldHideQuickForm(mode, bubble, feedbackBubble);
    }
  }

})();
