import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { uiCopy } from "../../lib/uiCopy";
import { uid, nowIso } from "../../lib/defaults";
import type { ChatMessage, TopicItem, UserProfile } from "../../types";
import { useCallBu } from "./useCallBu";
import { CallBu } from "./CallBu";

export function PracticeChatPage({
  topic,
  opening,
  firstQuestion,
  onChatReply,
  onEnd,
  interfaceLanguage,
  targetLanguage,
  nativeLanguage
}: {
  topic: TopicItem;
  opening: string;
  firstQuestion: string;
  onChatReply: (userAnswer: string, chatHistory: Array<{ role: string; text: string }>) => Promise<string>;
  onEnd: () => void;
  interfaceLanguage: UserProfile["interfaceLanguage"];
  targetLanguage: string;
  nativeLanguage: string;
}) {
  const copy = uiCopy[interfaceLanguage].practiceChat as Record<string, string>;
  const { state: callState, error: callError, userText: callUserText, buText: callBuText, startCall, endCall } = useCallBu({ title: topic.name, summary: topic.summary }, targetLanguage, nativeLanguage);
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    { id: uid("msg"), role: "bu", text: opening, createdAt: nowIso() },
    { id: uid("msg"), role: "bu", text: firstQuestion, createdAt: nowIso() }
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  async function handleSend() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");

    const userMsg: ChatMessage = { id: uid("msg"), role: "user", text, createdAt: nowIso() };
    const prevHistory = messages.map((msg) => ({ role: msg.role, text: msg.text }));
    setMessages((prev) => [...prev, userMsg]);

    setBusy(true);
    const reply = await onChatReply(text, prevHistory);
    setBusy(false);

    const buMsg: ChatMessage = { id: uid("msg"), role: "bu", text: reply, createdAt: nowIso() };
    setMessages((prev) => [...prev, buMsg]);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  }

  return (
    <section className="page practice-chat-page">
      <div className="practice-chat-layout">
        <aside className="practice-bu-panel">
          <div className="bu-card">
            <img src="/assets/tinybu-practice.png" alt="TinyBu" className="bu-card-image" />
            <h3>TinyBu</h3>
            <p className="bu-topic-name">{topic.name}</p>
            <CallBu state={callState} error={callError} userText={callUserText} buText={callBuText} onStart={startCall} onEnd={endCall} interfaceLanguage={interfaceLanguage} />
          </div>
        </aside>

        <main className="practice-chat-main">
          <header className="practice-chat-header">
            <h3>{copy.chatHeader}</h3>
            <span>{copy.chatSubtitle}</span>
            <button className="secondary end-btn" onClick={onEnd}>
              {copy.endPractice}
            </button>
          </header>

          <div className="practice-chat-messages">
            {messages.map((msg) => (
              <div key={msg.id} className={`chat-bubble ${msg.role === "bu" ? "bu-bubble" : "user-bubble"}`}>
                <span className="bubble-role">{msg.role === "bu" ? "TinyBu" : "You"}</span>
                <p>{msg.text}</p>
              </div>
            ))}
            {busy && (
              <div className="chat-bubble bu-bubble typing-bubble">
                <span className="bubble-role">TinyBu</span>
                <p className="typing-dots"><span>.</span><span>.</span><span>.</span></p>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <footer className="practice-chat-input">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={copy.inputPlaceholder}
              disabled={busy}
              rows={1}
            />
            <button className="primary" onClick={handleSend} disabled={busy || !input.trim()}>
              <Send size={18} />
              Send
            </button>
          </footer>
        </main>
      </div>
    </section>
  );
}
