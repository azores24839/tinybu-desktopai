import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { generateQuickPetChat } from "../../ai/provider";
import { loadAppState } from "../../lib/db";
import type { PetActivity } from "./petTypes";

type UsePetQuickChatArgs = {
  setActivity: (activity: PetActivity) => void;
};

export function usePetQuickChat({ setActivity }: UsePetQuickChatArgs) {
  const [quickInput, setQuickInput] = useState("");
  const [quickReply, setQuickReply] = useState("");
  const [quickBusy, setQuickBusy] = useState(false);
  const quickReplyTimer = useRef<number>(0);

  useEffect(() => {
    return () => window.clearTimeout(quickReplyTimer.current);
  }, []);

  function showQuickReply(message: string) {
    setQuickReply(message);
    window.clearTimeout(quickReplyTimer.current);
    quickReplyTimer.current = window.setTimeout(() => setQuickReply(""), 5000);
  }

  async function submitQuickChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = quickInput.trim();
    if (!message || quickBusy) return;

    setQuickInput("");
    setQuickBusy(true);
    setActivity("thinking");
    showQuickReply("我想一下...");

    try {
      const appState = await loadAppState();
      const output = await generateQuickPetChat({ message, appState });
      const reply = output.reply?.trim();
      showQuickReply(reply || "我在，但刚刚没想好。");
    } catch (error) {
      console.warn("TinyBu quick chat failed", error);
      const message = error instanceof DOMException && error.name === "AbortError"
        ? "AI timeout after 12s"
        : error instanceof Error
          ? error.message
          : String(error);
      showQuickReply(`AI error: ${message.slice(0, 120)}`);
    } finally {
      setQuickBusy(false);
      setActivity("idle");
    }
  }

  return {
    quickInput,
    setQuickInput,
    quickReply,
    setQuickReply,
    quickBusy,
    submitQuickChat
  };
}
