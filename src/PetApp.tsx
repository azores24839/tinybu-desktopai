import { useEffect, useRef, useState } from "react";
import { readText } from "@tauri-apps/plugin-clipboard-manager";
import { isRegistered, register, unregister, type ShortcutEvent } from "@tauri-apps/plugin-global-shortcut";
import { LogicalSize, PhysicalPosition } from "@tauri-apps/api/dpi";
import { currentMonitor, getCurrentWindow } from "@tauri-apps/api/window";
import { invokeTauri, isRunningInTauri, listenTauri, type CaptureBridgeState } from "./lib/tauriBridge";

type PetActivity = "idle" | "dragging" | "capturing" | "thinking";
type PetPointerStart = {
  x: number;
  y: number;
  pointerId: number;
  dragging: boolean;
};

type ClipboardSuppressEvent = {
  text: string;
};

type MenuSide = "left" | "right";

const CLIPBOARD_SHORTCUT = "CommandOrControl+Shift+N";
const CLIPBOARD_SHORTCUT_STORAGE_KEY = "noriClipboardShortcutAllowed";
const CLIPBOARD_POLL_MS = 700;
const CLIPBOARD_PROMPT_MS = 8000;
const QUICK_CHAT_PROXY_URL = "http://127.0.0.1:8787/v1/nomi/task";
const QUICK_CHAT_MODEL = "MiniMax-M2.7";
const PET_CLOSED_WIDTH = 280;
const PET_OPEN_WIDTH = 360;
const PET_HEIGHT = 320;

const avatarImages: Record<PetActivity, string> = {
  idle: "/avatar/states/idle.gif",
  dragging: "/avatar/states/dragging.gif",
  capturing: "/avatar/states/capturing.gif",
  thinking: "/avatar/states/thinking.png"
};

export default function PetApp() {
  const [activity, setActivity] = useState<PetActivity>("idle");
  const [count, setCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuSide, setMenuSide] = useState<MenuSide>("right");
  const [shortcutEnabled, setShortcutEnabled] = useState(false);
  const [shortcutMessage, setShortcutMessage] = useState("");
  const [pendingClipboardText, setPendingClipboardText] = useState("");
  const [quickInput, setQuickInput] = useState("");
  const [quickReply, setQuickReply] = useState("");
  const [quickBusy, setQuickBusy] = useState(false);
  const shortcutMessageTimer = useRef<number>(0);
  const clipboardPollTimer = useRef<number>(0);
  const clipboardPromptTimer = useRef<number>(0);
  const dragIdleTimer = useRef<number>(0);
  const quickReplyTimer = useRef<number>(0);
  const shortcutRegistered = useRef(false);
  const clipboardCaptureInFlight = useRef(false);
  const lastClipboardText = useRef("");
  const lastPromptedClipboardText = useRef("");
  const pendingClipboardTextRef = useRef("");
  const pointerStart = useRef<PetPointerStart | null>(null);

  useEffect(() => {
    document.documentElement.classList.add("nomi-pet-html");
    document.body.classList.add("nomi-pet-body");
    return () => {
      document.documentElement.classList.remove("nomi-pet-html");
      document.body.classList.remove("nomi-pet-body");
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

      unlistenBridge = await listenTauri<CaptureBridgeState>("nomi-capture-bridge-updated", (event) => {
        setCount(event.payload.count);
        setActivity("idle");
      });

      unlistenPrompt = await listenTauri<ClipboardSuppressEvent>("nomi-clipboard-prompt", (event) => {
        promptClipboardText(event.payload.text);
      });

      unlistenSuppress = await listenTauri<ClipboardSuppressEvent>("nomi-clipboard-suppress", (event) => {
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
      window.clearInterval(clipboardPollTimer.current);
      window.clearTimeout(clipboardPromptTimer.current);
      window.clearTimeout(dragIdleTimer.current);
      window.clearTimeout(quickReplyTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!isRunningInTauri()) return;
    if (window.localStorage.getItem(CLIPBOARD_SHORTCUT_STORAGE_KEY) !== "true") return;

    void enableClipboardShortcut(false);

    return () => {
      if (!shortcutRegistered.current) return;
      shortcutRegistered.current = false;
      void unregister(CLIPBOARD_SHORTCUT).catch((error) => {
        console.warn("Unable to unregister clipboard shortcut", error);
      });
    };
  }, []);

  useEffect(() => {
    if (menuOpen) return;
    void setPetWindowLayout(false);
  }, [menuOpen]);

  function showShortcutMessage(message: string) {
    setShortcutMessage(message);
    window.clearTimeout(shortcutMessageTimer.current);
    shortcutMessageTimer.current = window.setTimeout(() => setShortcutMessage(""), 1800);
  }

  function showQuickReply(message: string) {
    setQuickReply(message);
    window.clearTimeout(quickReplyTimer.current);
    quickReplyTimer.current = window.setTimeout(() => setQuickReply(""), 5000);
  }

  function normalizeClipboardSignal(text: string) {
    return text.trim().replace(/\s+/g, " ");
  }

  function suppressClipboardText(text: string) {
    const clipboardText = normalizeClipboardSignal(text);
    if (!clipboardText) return;

    lastClipboardText.current = clipboardText;
    lastPromptedClipboardText.current = clipboardText;

    if (normalizeClipboardSignal(pendingClipboardTextRef.current) === clipboardText) {
      clearClipboardPrompt(pendingClipboardTextRef.current);
    }
  }

  function promptClipboardText(text: string) {
    const clipboardText = text.trim();
    const clipboardSignal = normalizeClipboardSignal(clipboardText);
    if (!clipboardSignal) return;

    lastClipboardText.current = clipboardSignal;
    lastPromptedClipboardText.current = clipboardSignal;
    showClipboardPrompt(clipboardText);
  }

  function clearClipboardPrompt(text = pendingClipboardText) {
    window.clearTimeout(clipboardPromptTimer.current);
    if (pendingClipboardTextRef.current !== text) return;
    pendingClipboardTextRef.current = "";
    setPendingClipboardText("");
    setActivity((currentActivity) => (currentActivity === "capturing" ? "idle" : currentActivity));
  }

  function showClipboardPrompt(text: string) {
    closePetMenu();
    pendingClipboardTextRef.current = text;
    setPendingClipboardText(text);
    setActivity("capturing");
    window.clearTimeout(clipboardPromptTimer.current);
    clipboardPromptTimer.current = window.setTimeout(() => clearClipboardPrompt(text), CLIPBOARD_PROMPT_MS);
  }

  async function captureClipboardText(text?: string) {
    if (clipboardCaptureInFlight.current) return;
    clipboardCaptureInFlight.current = true;

    try {
      const clipboardText = (text ?? (await readText())).trim();

      if (!clipboardText) {
        showShortcutMessage("剪贴板没有文字");
        return;
      }

      const state = await invokeTauri<CaptureBridgeState>("capture_clipboard_text", {
        payload: {
          kind: "selection",
          title: "Clipboard Capture",
          url: "",
          text: clipboardText,
          capturedAt: new Date().toISOString()
        }
      });

      if (!state) {
        showShortcutMessage("没有记成功");
        return;
      }

      setCount(state.count);
      clearClipboardPrompt(clipboardText);
      lastClipboardText.current = normalizeClipboardSignal(clipboardText);
      setActivity("idle");
      showShortcutMessage("TinyBu记下啦♪");
    } catch (error) {
      console.warn("Unable to capture clipboard text", error);
      showShortcutMessage("读取剪贴板失败");
    } finally {
      clipboardCaptureInFlight.current = false;
    }
  }

  async function handleShortcut(event: ShortcutEvent) {
    if (event.state !== "Pressed") return;
    await captureClipboardText();
  }

  async function watchClipboardForCopies() {
    try {
      const clipboardText = (await readText()).trim();
      const clipboardSignal = normalizeClipboardSignal(clipboardText);
      if (!clipboardSignal) return;

      const isSameClipboard = clipboardSignal === lastClipboardText.current;
      const isSamePrompt = clipboardSignal === lastPromptedClipboardText.current;

      if (isSameClipboard || isSamePrompt) return;

      lastClipboardText.current = clipboardSignal;
      lastPromptedClipboardText.current = clipboardSignal;
      showClipboardPrompt(clipboardText);
    } catch (error) {
      console.warn("Unable to check clipboard text", error);
    }
  }

  function startClipboardWatcher() {
    window.clearInterval(clipboardPollTimer.current);
    clipboardPollTimer.current = window.setInterval(() => {
      void watchClipboardForCopies();
    }, CLIPBOARD_POLL_MS);
  }

  function stopClipboardWatcher() {
    window.clearInterval(clipboardPollTimer.current);
    window.clearTimeout(clipboardPromptTimer.current);
    pendingClipboardTextRef.current = "";
    setPendingClipboardText("");
  }

  function scheduleDragIdle(delay = 180) {
    window.clearTimeout(dragIdleTimer.current);
    dragIdleTimer.current = window.setTimeout(() => {
      pointerStart.current = null;
      setActivity("idle");
    }, delay);
  }

  async function registerShortcutFallback() {
    try {
      const alreadyRegistered = await isRegistered(CLIPBOARD_SHORTCUT);

      if (alreadyRegistered) {
        await unregister(CLIPBOARD_SHORTCUT);
      }

      await register(CLIPBOARD_SHORTCUT, (event) => {
        void handleShortcut(event);
      });

      shortcutRegistered.current = true;
    } catch (error) {
      shortcutRegistered.current = false;
      console.warn("Clipboard shortcut fallback unavailable", error);
    }
  }

  async function enableClipboardShortcut(showMessage = true) {
    if (!isRunningInTauri()) return;

    try {
      lastClipboardText.current = normalizeClipboardSignal(await readText());
      lastPromptedClipboardText.current = lastClipboardText.current;
      startClipboardWatcher();
      await registerShortcutFallback();

      setShortcutEnabled(true);
      window.localStorage.setItem(CLIPBOARD_SHORTCUT_STORAGE_KEY, "true");
      if (showMessage) showShortcutMessage("复制捕捉已开启");
    } catch (error) {
      console.warn("Unable to enable clipboard capture", error);
      shortcutRegistered.current = false;
      setShortcutEnabled(false);
      stopClipboardWatcher();
      window.localStorage.removeItem(CLIPBOARD_SHORTCUT_STORAGE_KEY);
      showShortcutMessage("复制捕捉失败");
    }
  }

  async function disableClipboardShortcut() {
    try {
      if (shortcutRegistered.current || (await isRegistered(CLIPBOARD_SHORTCUT))) {
        await unregister(CLIPBOARD_SHORTCUT);
      }
    } catch (error) {
      console.warn("Unable to unregister clipboard shortcut", error);
    } finally {
      shortcutRegistered.current = false;
      setShortcutEnabled(false);
      stopClipboardWatcher();
      window.localStorage.removeItem(CLIPBOARD_SHORTCUT_STORAGE_KEY);
      showShortcutMessage("复制捕捉已关闭");
    }
  }

  async function toggleClipboardShortcut() {
    closePetMenu();

    if (shortcutEnabled) {
      await disableClipboardShortcut();
      return;
    }

    await enableClipboardShortcut();
  }

  async function setPetWindowLayout(open: boolean, side: MenuSide = menuSide) {
    if (!isRunningInTauri()) return;

    try {
      const window = getCurrentWindow();
      const [position, size, scaleFactor, monitor] = await Promise.all([
        window.outerPosition(),
        window.outerSize(),
        window.scaleFactor(),
        currentMonitor()
      ]);
      const width = open ? PET_OPEN_WIDTH : PET_CLOSED_WIDTH;
      const currentCenterX = position.x + size.width / 2;
      const targetWidth = Math.round(width * scaleFactor);
      const workArea = monitor?.workArea;
      let targetX = Math.round(currentCenterX - targetWidth / 2);

      if (workArea) {
        const minX = workArea.position.x;
        const maxX = workArea.position.x + workArea.size.width - targetWidth;
        targetX = Math.min(Math.max(targetX, minX), Math.max(minX, maxX));
      }

      await window.setSize(new LogicalSize(width, PET_HEIGHT));
      await window.setPosition(new PhysicalPosition(targetX, position.y));
      if (open) setMenuSide(side);
    } catch (error) {
      console.warn("Unable to resize pet window", error);
    }
  }

  function closePetMenu() {
    setMenuOpen(false);
  }

  async function openPetMenu() {
    let side: MenuSide = "right";

    if (isRunningInTauri()) {
      try {
        const window = getCurrentWindow();
        const [position, size, monitor] = await Promise.all([
          window.outerPosition(),
          window.outerSize(),
          currentMonitor()
        ]);
        const workArea = monitor?.workArea;
        if (workArea) {
          const noriCenterX = position.x + size.width / 2;
          const availableRight = workArea.position.x + workArea.size.width - noriCenterX;
          const availableLeft = noriCenterX - workArea.position.x;
          side = availableRight >= 180 || availableRight >= availableLeft ? "right" : "left";
        }
      } catch (error) {
        console.warn("Unable to choose pet menu side", error);
      }
    }

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
      pendingClipboardTextRef.current = "";
      setPendingClipboardText("");
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

  async function acceptClipboardPrompt() {
    await captureClipboardText(pendingClipboardText);
  }

  function parseQuickReply(data: unknown) {
    const outputText =
      (data as { output_text?: string })?.output_text ??
      (data as { output?: Array<{ content?: Array<{ type?: string; text?: string }> }> })?.output
        ?.flatMap((item) => item.content ?? [])
        ?.find((content) => content.type === "output_text")?.text;

    if (!outputText) return "";

    try {
      return JSON.parse(outputText).reply?.trim() || "";
    } catch {
      return outputText.trim();
    }
  }

  async function submitQuickChat(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = quickInput.trim();
    if (!message || quickBusy) return;

    setQuickInput("");
    setQuickBusy(true);
    setActivity("thinking");
    showQuickReply("我想一下...");

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
      showQuickReply(reply || "我在，但刚刚没想好。");
    } catch (error) {
      console.warn("TinyBu quick chat failed", error);
      showQuickReply("我现在连不上，先试试主窗口。");
    } finally {
      setQuickBusy(false);
      setActivity("idle");
    }
  }

  const petReply = quickReply || shortcutMessage;
  const showQuickForm = activity !== "dragging" && !petReply && !pendingClipboardText;

  return (
    <main className={`pet-shell ${activity}`}>
      {activity !== "dragging" && petReply && (
        <div className="pet-reply-bubble" role="status">
          {petReply}
        </div>
      )}
      <button
        className="pet-avatar-button"
        type="button"
        aria-label="TinyBu desktop companion"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={cancelPointer}
      >
        <img src={avatarImages[activity]} alt="" draggable={false} />
      </button>

      {count > 0 && <div className="pet-count">已记录{count}条</div>}
      {pendingClipboardText && (
        <button className="pet-copy-prompt" type="button" onClick={acceptClipboardPrompt}>
          <span>要记下吗?</span>
          <span className="pet-copy-prompt-yes">Yes</span>
        </button>
      )}

      {showQuickForm && (
        <form className="pet-quick-form" onSubmit={submitQuickChat}>
          <input
            value={quickInput}
            onChange={(event) => setQuickInput(event.target.value)}
            placeholder="来聊聊天吧～"
            maxLength={120}
            disabled={quickBusy}
          />
        </form>
      )}

      {menuOpen && (
        <div className={`pet-menu ${menuSide}`} role="menu" aria-label="TinyBu menu">
          <button type="button" role="menuitem" onClick={toggleClipboardShortcut}>
            {shortcutEnabled ? "关闭复制捕捉" : "允许复制捕捉"}
          </button>
          <button type="button" role="menuitem" onClick={openPractice}>
            开始练习
          </button>
          <button type="button" role="menuitem" onClick={startScreenshotCapture}>
            截图识别
          </button>
          <button type="button" role="menuitem" onClick={undoLastCapture}>
            撤销上一条
          </button>
          <button type="button" role="menuitem" onClick={hidePet}>
            隐藏
          </button>
          <button type="button" role="menuitem" onClick={resetCount}>
            清零
          </button>
        </div>
      )}
    </main>
  );
}
