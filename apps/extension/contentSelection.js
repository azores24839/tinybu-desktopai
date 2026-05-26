(() => {
  const EDITABLE_SELECTOR =
    "input, textarea, select, [role='textbox'], [contenteditable]:not([contenteditable='false'])";

  function getPromptableBrowserSelectionText(cleanText) {
    const selection = window.getSelection();
    const text = cleanText(selection?.toString() || "");
    if (!selection || selection.isCollapsed || text.length < 2 || isSelectionInEditable(selection)) return "";
    return text;
  }

  function getPromptableSelectionSnapshot(cleanText) {
    const selection = window.getSelection();
    const text = cleanText(selection?.toString() || "");
    if (!isPromptableSelection(selection, text)) return null;

    const rect = getSelectionViewportRect(selection);
    if (!rect) return null;

    return { text, rect };
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

  function isPromptableSelection(selection, text) {
    return Boolean(selection && !selection.isCollapsed && text.length >= 2 && !isSelectionInEditable(selection));
  }

  function isSelectionInEditable(selection) {
    if (!selection.rangeCount) return false;

    const node = selection.getRangeAt(0).commonAncestorContainer;
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    return Boolean(element?.closest(EDITABLE_SELECTOR));
  }

  globalThis.TinyBuContentSelection = {
    getPromptableBrowserSelectionText,
    getPromptableSelectionSnapshot,
    getSelectionViewportRect,
    isPromptableSelection,
    isSelectionInEditable
  };
})();
