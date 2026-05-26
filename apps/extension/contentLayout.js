(() => {
  function createFloatingLayout({ rootWidth, buttonSize, edgeGap, viewportGap, bubbleGap }) {
    function getDefaultPosition() {
      return clampPosition({
        x: window.innerWidth - rootWidth - edgeGap,
        y: window.innerHeight - buttonSize - edgeGap
      });
    }

    function clampPosition(nextPosition) {
      return {
        x: clampNumber(nextPosition.x, viewportGap, window.innerWidth - rootWidth - viewportGap),
        y: clampNumber(nextPosition.y, viewportGap, window.innerHeight - buttonSize - viewportGap)
      };
    }

    function getButtonRect(position) {
      const buttonLeft = position.x + (rootWidth - buttonSize) / 2;
      return {
        left: buttonLeft,
        top: position.y,
        right: buttonLeft + buttonSize,
        bottom: position.y + buttonSize,
        width: buttonSize,
        height: buttonSize
      };
    }

    function showFeedbackAbovePet(feedbackBubble, position) {
      feedbackBubble.hidden = false;
      feedbackBubble.style.visibility = "hidden";
      feedbackBubble.style.left = "0px";
      feedbackBubble.style.top = "0px";
      feedbackBubble.style.setProperty("--bubble-arrow-left", "28px");

      requestAnimationFrame(() => {
        const bubbleRect = feedbackBubble.getBoundingClientRect();
        const buttonRect = getButtonRect(position);
        const centerX = buttonRect.left + buttonRect.width / 2;
        const left = clampNumber(centerX - bubbleRect.width / 2, viewportGap, window.innerWidth - bubbleRect.width - viewportGap);
        const top = clampNumber(buttonRect.top - bubbleRect.height - bubbleGap, viewportGap, window.innerHeight - bubbleRect.height - viewportGap);
        const arrowLeft = clampNumber(centerX - left, 16, bubbleRect.width - 16);

        feedbackBubble.style.left = `${Math.round(left)}px`;
        feedbackBubble.style.top = `${Math.round(top)}px`;
        feedbackBubble.style.setProperty("--bubble-arrow-left", `${Math.round(arrowLeft)}px`);
        feedbackBubble.style.visibility = "visible";
      });
    }

    function showBubbleAtRect(bubble, anchorRect, preferredSide, options = {}) {
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
            ? anchorRect.top - bubbleRect.height - bubbleGap
            : anchorRect.bottom + bubbleGap;

        if (top < viewportGap) {
          top = anchorRect.bottom + bubbleGap;
        }

        if (top + bubbleRect.height > window.innerHeight - viewportGap) {
          top = Math.max(viewportGap, window.innerHeight - bubbleRect.height - viewportGap);
        }

        left = clampNumber(left, viewportGap, window.innerWidth - bubbleRect.width - viewportGap);
        if (options.arrowCenter) {
          const arrowLeft = clampNumber(centerX - left, 16, bubbleRect.width - 16);
          bubble.style.setProperty("--bubble-arrow-left", `${Math.round(arrowLeft)}px`);
        }

        bubble.style.left = `${Math.round(left)}px`;
        bubble.style.top = `${Math.round(top)}px`;
        bubble.style.visibility = "visible";
      });
    }

    function showActionMenuNearPet(bubble, position) {
      bubble.hidden = false;
      bubble.style.visibility = "hidden";
      bubble.style.left = "0px";
      bubble.style.top = "0px";

      requestAnimationFrame(() => {
        const bubbleRect = bubble.getBoundingClientRect();
        const buttonRect = getButtonRect(position);
        const placeRight = buttonRect.left + buttonRect.width + bubbleGap + bubbleRect.width <= window.innerWidth - viewportGap;
        const left = placeRight ? buttonRect.right + bubbleGap : buttonRect.left - bubbleRect.width - bubbleGap;
        const top = clampNumber(buttonRect.top + 8, viewportGap, window.innerHeight - bubbleRect.height - viewportGap);

        bubble.style.left = `${Math.round(clampNumber(left, viewportGap, window.innerWidth - bubbleRect.width - viewportGap))}px`;
        bubble.style.top = `${Math.round(top)}px`;
        bubble.style.visibility = "visible";
      });
    }

    return {
      clampPosition,
      getDefaultPosition,
      showActionMenuNearPet,
      showBubbleAtRect,
      showFeedbackAbovePet
    };
  }

  function clampNumber(value, min, max) {
    if (max < min) return Math.max(0, min);
    return Math.min(Math.max(value, min), max);
  }

  globalThis.TinyBuFloatingLayout = {
    createFloatingLayout
  };
})();
