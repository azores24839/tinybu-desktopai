import { useEffect, useRef, useState } from "react";
import { Check, ImagePlus, Inbox, Loader2, Mic, RotateCcw, Scissors, X } from "lucide-react";
import { isRegistered, register, unregister, type ShortcutEvent } from "@tauri-apps/plugin-global-shortcut";
import { invokeTauri, isRunningInTauri, listenTauri, type CaptureBridgeState } from "./lib/tauriBridge";
import { setNotchWindowLayout } from "./features/notch/notchWindowLayout";

const VOICE_SHORTCUT = "CommandOrControl+Shift+Space";
const COLLAPSE_DELAY_MS = 2200;

type NotchMode = "idle" | "voice" | "drop" | "saved" | "error";

type SpeechRecognitionEventLike = {
  results: {
    length: number;
    [index: number]: {
      isFinal?: boolean;
      [index: number]: { transcript: string };
    };
  };
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

export default function NotchApp() {
  const [mode, setMode] = useState<NotchMode>("idle");
  const [count, setCount] = useState(0);
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const collapseTimer = useRef<number>(0);
  const shortcutRegistered = useRef(false);

  useEffect(() => {
    document.documentElement.classList.add("tinybu-notch-html");
    document.body.classList.add("tinybu-notch-body");
    void setNotchWindowLayout(false);
    void bootBridgeState();
    void registerVoiceShortcut();

    let active = true;
    let unlistenBridge = () => {};
    listenTauri<CaptureBridgeState>("tinybu-capture-bridge-updated", (event) => {
      setCount(event.payload.count);
      showSaved("Saved to TinyBu");
    }).then((cleanup) => {
      if (active) unlistenBridge = cleanup;
      else cleanup();
    });

    return () => {
      active = false;
      unlistenBridge();
      window.clearTimeout(collapseTimer.current);
      stopRecognition();
      if (shortcutRegistered.current) {
        shortcutRegistered.current = false;
        void unregister(VOICE_SHORTCUT).catch((error) => {
          console.warn("Unable to unregister notch voice shortcut", error);
        });
      }
      document.documentElement.classList.remove("tinybu-notch-html");
      document.body.classList.remove("tinybu-notch-body");
    };
  }, []);

  useEffect(() => {
    void setNotchWindowLayout(mode !== "idle");
  }, [mode]);

  async function bootBridgeState() {
    const state = await invokeTauri<CaptureBridgeState>("get_capture_bridge_state");
    if (state) setCount(state.count);
  }

  async function registerVoiceShortcut() {
    if (!isRunningInTauri()) return;

    try {
      if (await isRegistered(VOICE_SHORTCUT)) {
        await unregister(VOICE_SHORTCUT);
      }

      await register(VOICE_SHORTCUT, (event: ShortcutEvent) => {
        if (event.state === "Pressed") startVoiceCapture();
      });
      shortcutRegistered.current = true;
    } catch (error) {
      console.warn("Unable to register notch voice shortcut", error);
    }
  }

  function setTimedMessage(nextMessage: string, nextMode: NotchMode) {
    setMessage(nextMessage);
    setMode(nextMode);
    window.clearTimeout(collapseTimer.current);
    collapseTimer.current = window.setTimeout(() => {
      setMessage("");
      setMode("idle");
    }, COLLAPSE_DELAY_MS);
  }

  function showSaved(nextMessage: string) {
    setBusy(false);
    setDraft("");
    stopRecognition();
    setTimedMessage(nextMessage, "saved");
  }

  function showError(nextMessage: string) {
    setBusy(false);
    stopRecognition();
    setTimedMessage(nextMessage, "error");
  }

  function startVoiceCapture() {
    window.clearTimeout(collapseTimer.current);
    setMessage("");
    setMode("voice");
    setDraft("");
    startRecognition();
  }

  function startRecognition() {
    stopRecognition();
    const SpeechRecognition =
      (window as typeof window & { SpeechRecognition?: SpeechRecognitionConstructor }).SpeechRecognition ??
      (window as typeof window & { webkitSpeechRecognition?: SpeechRecognitionConstructor }).webkitSpeechRecognition;

    if (!SpeechRecognition) return;

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = navigator.language || "en-US";
      recognition.onresult = (event) => {
        const transcript = Array.from({ length: event.results.length }, (_, index) => event.results[index][0].transcript)
          .join(" ")
          .trim();
        if (transcript) setDraft(transcript);
      };
      recognition.onerror = () => {
        recognitionRef.current = null;
      };
      recognition.onend = () => {
        recognitionRef.current = null;
      };
      recognition.start();
      recognitionRef.current = recognition;
    } catch (error) {
      console.warn("Unable to start speech recognition", error);
      recognitionRef.current = null;
    }
  }

  function stopRecognition() {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (!recognition) return;

    try {
      recognition.stop();
    } catch (error) {
      console.warn("Unable to stop speech recognition", error);
    }
  }

  async function saveVoiceCapture() {
    const text = draft.trim();
    if (!text) {
      showError("Say or type a quick note");
      return;
    }

    setBusy(true);
    const state = await invokeTauri<CaptureBridgeState>("capture_clipboard_text", {
      payload: {
        kind: "manual",
        title: "Voice Capture",
        url: "",
        text,
        capturedAt: new Date().toISOString()
      }
    });

    if (!state) {
      showError("Could not save");
      return;
    }

    setCount(state.count);
    showSaved("Voice note saved");
  }

  async function startScreenshotCapture() {
    setBusy(true);
    const opened = await invokeTauri<boolean>("open_screenshot_capture");
    if (opened === false) {
      showError("Screenshot unavailable");
      return;
    }
    setBusy(false);
    setTimedMessage("Select an area", "saved");
  }

  async function openCaptures() {
    await invokeTauri("open_capture_practice");
  }

  async function undoLastCapture() {
    const beforeCount = count;
    const state = await invokeTauri<CaptureBridgeState>("undo_last_capture");
    setCount(state?.count ?? count);
    if (!state || state.count === beforeCount) {
      showError("Nothing to undo");
      return;
    }
    showSaved("Last capture undone");
  }

  function handleDragOver(event: React.DragEvent<HTMLElement>) {
    event.preventDefault();
    if (mode !== "drop") {
      window.clearTimeout(collapseTimer.current);
      setMode("drop");
      setMessage("Drop to collect");
    }
  }

  function handleDragLeave(event: React.DragEvent<HTMLElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setMode("idle");
    setMessage("");
  }

  async function handleDrop(event: React.DragEvent<HTMLElement>) {
    event.preventDefault();
    setBusy(true);
    const file = Array.from(event.dataTransfer.files).find((item) => item.type.startsWith("image/"));
    const text = event.dataTransfer.getData("text/plain").trim();

    if (file) {
      await saveDroppedImage(file);
      return;
    }

    if (text) {
      await saveDroppedText(text);
      return;
    }

    showError("Drop text or an image");
  }

  async function saveDroppedText(text: string) {
    const state = await invokeTauri<CaptureBridgeState>("capture_clipboard_text", {
      payload: {
        kind: "manual",
        title: "Dropped Capture",
        url: "",
        text,
        capturedAt: new Date().toISOString()
      }
    });

    if (!state) {
      showError("Could not save");
      return;
    }

    setCount(state.count);
    showSaved("Dropped text saved");
  }

  async function saveDroppedImage(file: File) {
    try {
      const imageDataUrl = await readFileAsDataUrl(file);
      const size = await measureImage(imageDataUrl);
      await invokeTauri("submit_screenshot_capture", {
        payload: {
          imageDataUrl,
          width: size.width,
          height: size.height,
          capturedAt: new Date().toISOString()
        }
      });
      showSaved("Image sent to Inbox");
    } catch (error) {
      console.warn("Unable to save dropped image", error);
      showError("Could not read image");
    }
  }

  return (
    <main
      className={`notch-shell ${mode} ${busy ? "busy" : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <section className="notch-island" aria-label="TinyBu notch capture companion">
        <button className="notch-brand" type="button" onClick={openCaptures} title="Open TinyBu captures">
          <Inbox size={16} />
          <span>TinyBu</span>
          {count > 0 && <strong>{count}</strong>}
        </button>

        {mode === "voice" ? (
          <form
            className="notch-voice-form"
            onSubmit={(event) => {
              event.preventDefault();
              void saveVoiceCapture();
            }}
          >
            <Mic size={16} />
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Speak or type a quick note"
              autoFocus
            />
            <button type="submit" title="Save voice note">
              {busy ? <Loader2 className="notch-spin" size={15} /> : <Check size={15} />}
            </button>
            <button type="button" onClick={() => showSaved("Dismissed")} title="Dismiss">
              <X size={15} />
            </button>
          </form>
        ) : (
          <div className="notch-status" role="status">
            {mode === "drop" && <ImagePlus size={16} />}
            {mode === "saved" && <Check size={16} />}
            {mode === "error" && <X size={16} />}
            <span>{message || "Ready to collect"}</span>
          </div>
        )}

        <div className="notch-actions">
          <button type="button" onClick={startVoiceCapture} title="Voice capture">
            <Mic size={16} />
          </button>
          <button type="button" onClick={startScreenshotCapture} title="Screenshot capture">
            <Scissors size={16} />
          </button>
          <button type="button" onClick={undoLastCapture} title="Undo last capture">
            <RotateCcw size={16} />
          </button>
        </div>
      </section>
    </main>
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function measureImage(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("Image failed to load."));
    image.src = src;
  });
}
