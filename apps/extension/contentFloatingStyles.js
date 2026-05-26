(() => {
  function createFloatingStyles({ rootWidth, buttonSize }) {
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
        width: ${rootWidth}px;
        height: auto;
        pointer-events: none;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        transition: transform 80ms linear;
      }

      .tinybu-button {
        position: relative;
        display: grid;
        place-items: center;
        width: ${buttonSize}px;
        height: ${buttonSize}px;
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
        width: ${buttonSize}px;
        height: ${buttonSize}px;
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

  globalThis.TinyBuFloatingStyles = {
    createFloatingStyles
  };
})();
