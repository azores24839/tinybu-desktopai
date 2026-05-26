import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { PetAvatarButton } from "./features/pet/PetAvatarButton";
import { PetMenu } from "./features/pet/PetMenu";
import { PetQuickChatForm } from "./features/pet/PetQuickChatForm";
import {
  type ClipboardSuppressEvent,
  type MenuSide,
  type PetActivity,
  type PetPointerStart
} from "./features/pet/petTypes";
import { choosePetMenuSide, setPetWindowLayout } from "./features/pet/petWindowLayout";
import { usePetClipboardCapture } from "./features/pet/usePetClipboardCapture";
import { usePetQuickChat } from "./features/pet/usePetQuickChat";
import { invokeTauri, isRunningInTauri, listenTauri, type CaptureBridgeState } from "./lib/tauriBridge";

export default function PetApp() {
  const [activity, setActivity] = useState<PetActivity>("idle");
  const [count, setCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuSide, setMenuSide] = useState<MenuSide>("right");
  const [shortcutMessage, setShortcutMessage] = useState("");
  const shortcutMessageTimer = useRef<number>(0);
  const dragIdleTimer = useRef<number>(0);
  const pointerStart = useRef<PetPointerStart | null>(null);
  const { quickInput, setQuickInput, quickReply, setQuickReply, quickBusy, submitQuickChat } = usePetQuickChat({
    setActivity
  });
  const {
    shortcutEnabled,
    pendingClipboardText,
    promptClipboardText,
    suppressClipboardText,
    clearPendingClipboardPrompt,
    acceptClipboardPrompt,
    toggleClipboardShortcut
  } = usePetClipboardCapture({
    closePetMenu,
    setActivity,
    setCount,
    showShortcutMessage
  });
  const petReply = quickReply || shortcutMessage;
  const showQuickForm = activity !== "dragging" && !petReply && !pendingClipboardText;

  useEffect(() => {
    document.documentElement.classList.add("tinybu-pet-html");
    document.body.classList.add("tinybu-pet-body");
    return () => {
      document.documentElement.classList.remove("tinybu-pet-html");
      document.body.classList.remove("tinybu-pet-body");
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    let unlistenBridge = () => {};
    let unlistenPrompt = () => {};
    let unlistenSuppress = () => {};
    let unlistenMoved = () => {};

    async function boot() {
      const state = await invokeTauri<CaptureBridgeState>("get_capture_bridge_state");
      if (mounted && state) setCount(state.count);

      unlistenBridge = await listenTauri<CaptureBridgeState>("tinybu-capture-bridge-updated", (event) => {
        setCount(event.payload.count);
        setActivity("idle");
      });

      unlistenPrompt = await listenTauri<ClipboardSuppressEvent>("tinybu-clipboard-prompt", (event) => {
        promptClipboardText(event.payload.text);
      });

      unlistenSuppress = await listenTauri<ClipboardSuppressEvent>("tinybu-clipboard-suppress", (event) => {
        suppressClipboardText(event.payload.text);
      });

      if (isRunningInTauri()) {
        unlistenMoved = await getCurrentWindow().onMoved(() => {
          const start = pointerStart.current;
          if (!start?.dragging) return;
          setActivity("dragging");
          scheduleDragIdle();
        });
      }
    }

    void boot();

    return () => {
      mounted = false;
      unlistenBridge();
      unlistenPrompt();
      unlistenSuppress();
      unlistenMoved();
      window.clearTimeout(shortcutMessageTimer.current);
      window.clearTimeout(dragIdleTimer.current);
    };
  }, []);

  useEffect(() => {
    void setPetWindowLayout(menuOpen, menuSide, Boolean(petReply) && !menuOpen);
  }, [menuOpen, menuSide, petReply]);

  function showShortcutMessage(message: string) {
    setShortcutMessage(message);
    window.clearTimeout(shortcutMessageTimer.current);
    shortcutMessageTimer.current = window.setTimeout(() => setShortcutMessage(""), 1800);
  }

  function scheduleDragIdle(delay = 180) {
    window.clearTimeout(dragIdleTimer.current);
    dragIdleTimer.current = window.setTimeout(() => {
      pointerStart.current = null;
      setActivity("idle");
    }, delay);
  }

  function closePetMenu() {
    setMenuOpen(false);
  }

  async function openPetMenu() {
    const side = await choosePetMenuSide();
    setMenuSide(side);
    await setPetWindowLayout(true, side);
    setMenuOpen(true);
  }

  async function handlePointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    const start = pointerStart.current;
    if (!start || start.pointerId !== event.pointerId) return;

    const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (moved < 5) return;

    if (!start.dragging) {
      start.dragging = true;
      closePetMenu();
      clearPendingClipboardPrompt();
      setQuickReply("");
      setActivity("dragging");
      scheduleDragIdle(900);

      try {
        await getCurrentWindow().startDragging();
      } catch (error) {
        console.warn("Unable to start pet drag", error);
        scheduleDragIdle(0);
      }
    }
  }

  function handlePointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    const pointerId = event.pointerId;

    pointerStart.current = {
      x: event.clientX,
      y: event.clientY,
      pointerId,
      dragging: false
    };

    event.currentTarget.setPointerCapture(pointerId);
  }

  function handlePointerUp(event: React.PointerEvent<HTMLButtonElement>) {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (!start) return;
    if (start.dragging) {
      scheduleDragIdle(0);
      return;
    }

    if (menuOpen) {
      closePetMenu();
      return;
    }

    void openPetMenu();
  }

  function cancelPointer(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    pointerStart.current = null;
    setActivity("idle");
  }

  async function openPractice() {
    closePetMenu();
    await invokeTauri("open_capture_practice");
  }

  async function startScreenshotCapture() {
    closePetMenu();
    const opened = await invokeTauri<boolean>("open_screenshot_capture");
    showShortcutMessage(opened === false ? "截图窗口打不开" : "选择一块文字区域");
  }

  async function hidePet() {
    closePetMenu();
    await invokeTauri("hide_pet_window");
  }

  async function resetCount() {
    const state = await invokeTauri<CaptureBridgeState>("reset_capture_count");
    setCount(state?.count ?? 0);
    closePetMenu();
  }

  async function undoLastCapture() {
    const beforeCount = count;
    const state = await invokeTauri<CaptureBridgeState>("undo_last_capture");
    setCount(state?.count ?? count);
    closePetMenu();

    if (!state || state.count === beforeCount) {
      showShortcutMessage("没有可撤销记录");
      return;
    }

    showShortcutMessage("已撤销上一条");
    setActivity("idle");
  }

  return (
    <main className={`pet-shell ${activity}${petReply ? " has-reply" : ""}`}>
      {activity !== "dragging" && petReply && (
        <div className="pet-reply-bubble" role="status">
          {petReply}
        </div>
      )}
      <PetAvatarButton
        activity={activity}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={cancelPointer}
      />

      {count > 0 && <div className="pet-count">已记录{count}条</div>}
      {pendingClipboardText && (
        <button className="pet-copy-prompt" type="button" onClick={acceptClipboardPrompt}>
          <span>要记下吗?</span>
          <span className="pet-copy-prompt-yes">Yes</span>
        </button>
      )}

      {showQuickForm && (
        <PetQuickChatForm
          value={quickInput}
          busy={quickBusy}
          onChange={setQuickInput}
          onSubmit={submitQuickChat}
        />
      )}

      {menuOpen && (
        <PetMenu
          side={menuSide}
          shortcutEnabled={shortcutEnabled}
          toggleClipboardShortcut={toggleClipboardShortcut}
          openPractice={openPractice}
          startScreenshotCapture={startScreenshotCapture}
          undoLastCapture={undoLastCapture}
          hidePet={hidePet}
          resetCount={resetCount}
        />
      )}
    </main>
  );
}
