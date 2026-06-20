import { useEffect, useRef, useState } from "react";
import { readText } from "@tauri-apps/plugin-clipboard-manager";
import { isRegistered, register, unregister, type ShortcutEvent } from "@tauri-apps/plugin-global-shortcut";
import { invokeTauri, isRunningInTauri, type CaptureBridgeState } from "../../lib/tauriBridge";
import {
  CLIPBOARD_POLL_MS,
  CLIPBOARD_PROMPT_MS,
  CLIPBOARD_SHORTCUT,
  CLIPBOARD_SHORTCUT_STORAGE_KEY,
  type PetActivity
} from "./petTypes";

type UsePetClipboardCaptureArgs = {
  active: boolean;
  closePetMenu: () => void;
  setActivity: (activity: PetActivity | ((currentActivity: PetActivity) => PetActivity)) => void;
  setCount: (count: number | ((currentCount: number) => number)) => void;
  showShortcutMessage: (message: string) => void;
};

export function usePetClipboardCapture({
  active,
  closePetMenu,
  setActivity,
  setCount,
  showShortcutMessage
}: UsePetClipboardCaptureArgs) {
  const [shortcutEnabled, setShortcutEnabled] = useState(false);
  const [pendingClipboardText, setPendingClipboardText] = useState("");
  const clipboardPollTimer = useRef<number>(0);
  const clipboardPromptTimer = useRef<number>(0);
  const shortcutRegistered = useRef(false);
  const clipboardCaptureInFlight = useRef(false);
  const lastClipboardText = useRef("");
  const lastPromptedClipboardText = useRef("");
  const pendingClipboardTextRef = useRef("");

  useEffect(() => {
    if (!isRunningInTauri()) return;
    if (!active) {
      void suspendClipboardCapture();
      return;
    }
    if (window.localStorage.getItem(CLIPBOARD_SHORTCUT_STORAGE_KEY) !== "true") return;

    void enableClipboardShortcut(false, true);

    return () => {
      void suspendClipboardCapture();
    };
  }, [active]);

  useEffect(() => {
    return () => {
      window.clearInterval(clipboardPollTimer.current);
      window.clearTimeout(clipboardPromptTimer.current);
    };
  }, []);

  function normalizeClipboardSignal(text: string) {
    return text.trim().replace(/\s+/g, " ");
  }

  function clearPendingClipboardPrompt() {
    window.clearTimeout(clipboardPromptTimer.current);
    pendingClipboardTextRef.current = "";
    setPendingClipboardText("");
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
    clearPendingClipboardPrompt();
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
      return true;
    } catch (error) {
      shortcutRegistered.current = false;
      console.warn("Clipboard shortcut fallback unavailable", error);
      return false;
    }
  }

  async function enableClipboardShortcut(showMessage = true, preservePreferenceOnFailure = false) {
    if (!isRunningInTauri()) return;

    try {
      lastClipboardText.current = normalizeClipboardSignal(await readText());
      lastPromptedClipboardText.current = lastClipboardText.current;
      startClipboardWatcher();
      if (!(await registerShortcutFallback())) throw new Error("Clipboard shortcut registration failed.");

      setShortcutEnabled(true);
      window.localStorage.setItem(CLIPBOARD_SHORTCUT_STORAGE_KEY, "true");
      if (showMessage) showShortcutMessage("复制捕捉已开启");
    } catch (error) {
      console.warn("Unable to enable clipboard capture", error);
      shortcutRegistered.current = false;
      setShortcutEnabled(false);
      stopClipboardWatcher();
      if (!preservePreferenceOnFailure) window.localStorage.removeItem(CLIPBOARD_SHORTCUT_STORAGE_KEY);
      if (showMessage) showShortcutMessage("复制捕捉失败");
    }
  }

  async function suspendClipboardCapture() {
    try {
      if (shortcutRegistered.current || (await isRegistered(CLIPBOARD_SHORTCUT))) {
        await unregister(CLIPBOARD_SHORTCUT);
      }
    } catch (error) {
      console.warn("Unable to suspend clipboard shortcut", error);
    } finally {
      shortcutRegistered.current = false;
      setShortcutEnabled(false);
      stopClipboardWatcher();
    }
  }

  async function disableClipboardShortcut() {
    await suspendClipboardCapture();
    window.localStorage.removeItem(CLIPBOARD_SHORTCUT_STORAGE_KEY);
    showShortcutMessage("复制捕捉已关闭");
  }

  async function toggleClipboardShortcut() {
    closePetMenu();

    if (shortcutEnabled) {
      await disableClipboardShortcut();
      return;
    }

    await enableClipboardShortcut();
  }

  async function acceptClipboardPrompt() {
    await captureClipboardText(pendingClipboardText);
  }

  return {
    shortcutEnabled,
    pendingClipboardText,
    promptClipboardText,
    suppressClipboardText,
    clearPendingClipboardPrompt,
    acceptClipboardPrompt,
    toggleClipboardShortcut
  };
}
