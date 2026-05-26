(() => {
  function createSelectionSaveButton(onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "selection-save";
    button.setAttribute("aria-label", "Yes, save this sentence to TinyBu");

    const label = document.createElement("span");
    label.textContent = "要记下这句话吗？";

    const check = document.createElement("span");
    check.className = "selection-check";
    check.setAttribute("aria-hidden", "true");

    button.append(label, check);
    button.addEventListener("click", onClick);
    return button;
  }

  function createActionMenu(items) {
    const actions = document.createElement("div");
    actions.className = "menu-actions";

    items.forEach(({ label, onClick }) => {
      actions.append(createMenuButton(label, onClick));
    });

    return actions;
  }

  function createMenuButton(label, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.setAttribute("role", "menuitem");
    button.addEventListener("click", onClick);
    return button;
  }

  function renderFeedbackMessage(feedbackBubble, message) {
    feedbackBubble.className = "tinybu-bubble feedback";
    feedbackBubble.replaceChildren();

    const text = document.createElement("strong");
    text.textContent = message;
    feedbackBubble.append(text);
  }

  function normalizeRuntimeErrorMessage(message) {
    if (/Extension context invalidated/i.test(message || "")) {
      return "扩展刚刚更新啦，请刷新页面再试。";
    }

    return message || "捕捉失败。";
  }

  function getAvatarState(nextMode) {
    if (nextMode === "dragging") return "dragging";
    if (nextMode === "selectionPrompt" || nextMode === "capturingSelection" || nextMode === "saving" || nextMode === "saved") {
      return "capturing";
    }
    if (nextMode === "thinking") return "thinking";
    return "idle";
  }

  function shouldHideQuickForm(mode, bubble, feedbackBubble) {
    return (
      mode === "dragging" ||
      mode === "selectionPrompt" ||
      mode === "capturingSelection" ||
      mode === "saving" ||
      mode === "saved" ||
      mode === "error" ||
      mode === "thinking" ||
      !bubble.hidden ||
      !feedbackBubble.hidden
    );
  }

  globalThis.TinyBuViewHelpers = {
    createActionMenu,
    createSelectionSaveButton,
    getAvatarState,
    normalizeRuntimeErrorMessage,
    renderFeedbackMessage,
    shouldHideQuickForm
  };
})();
