import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Lightbulb, Send } from "lucide-react";
import { uiCopy } from "../../lib/uiCopy";
import { uid, nowIso } from "../../lib/defaults";
import type { ChatMessage, UserProfile, CaptureItem, PracticePlan } from "../../types";
import type { PracticeSource } from "./usePracticeChat";
import { useCallBu } from "./useCallBu";
import { CallBu } from "./CallBu";

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function combineFragmentText(fragments: Array<{ text: string }>): string {
  return fragments
    .map((f) => f.text.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ");
}

const MIN_WIDTHS = [280, 420, 240] as const;
const INITIAL_SIZES = [36, 44, 20] as const;

export function PracticeChatPage({
  practiceSource,
  captures,
  practicePlan,
  opening,
  firstQuestion,
  onChatReply,
  onEndWithReview,
  onExit,
  interfaceLanguage,
  targetLanguage,
  nativeLanguage
}: {
  practiceSource: PracticeSource;
  captures: CaptureItem[];
  practicePlan: PracticePlan | null;
  opening: string;
  firstQuestion: string;
  onChatReply: (userAnswer: string, chatHistory: Array<{ role: string; text: string }>) => Promise<string>;
  onEndWithReview: (messages: ChatMessage[], whatToCover: string[]) => void;
  onExit: () => void;
  interfaceLanguage: UserProfile["interfaceLanguage"];
  targetLanguage: string;
  nativeLanguage: string;
}) {
  const copy = uiCopy[interfaceLanguage].practiceChat as Record<string, string>;
  const { state: callState, error: callError, userText: callUserText, buText: callBuText, startCall, endCall } = useCallBu({ title: practiceSource.title, summary: practiceSource.summary }, targetLanguage, nativeLanguage);
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    { id: uid("msg"), role: "bu", text: opening, createdAt: nowIso() },
    { id: uid("msg"), role: "bu", text: firstQuestion, createdAt: nowIso() }
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [completedSet, setCompletedSet] = useState<Set<number>>(new Set());
  const [colSizes, setColSizes] = useState<[number, number, number]>([...INITIAL_SIZES]);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const layoutRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ index: number; startX: number; startSizes: [number, number, number] } | null>(null);

  const whatToCover = practicePlan?.whatToCover ?? [];

  function checkCompletion(userTexts: string[]) {
    const all = userTexts.join(" ").toLowerCase();
    const done = new Set<number>();
    whatToCover.forEach((item, i) => {
      const kws = extractKeywords(item);
      if (kws.length > 0 && kws.some((kw) => all.includes(kw))) {
        done.add(i);
      }
    });
    setCompletedSet(done);
  }

  useEffect(() => {
    const userTexts = messages.filter((m) => m.role === "user").map((m) => m.text);
    checkCompletion(userTexts);
  }, [messages, whatToCover]);

  useEffect(() => {
    if (callUserText) {
      const userTexts = messages.filter((m) => m.role === "user").map((m) => m.text);
      userTexts.push(callUserText);
      const all = userTexts.join(" ").toLowerCase();
      setCompletedSet((prev) => {
        const next = new Set(prev);
        whatToCover.forEach((item, i) => {
          if (prev.has(i)) return;
          const kws = extractKeywords(item);
          if (kws.length > 0 && kws.some((kw) => all.includes(kw))) {
            next.add(i);
          }
        });
        return next;
      });
    }
  }, [callUserText, whatToCover, messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  function startDrag(index: number, e: React.MouseEvent) {
    e.preventDefault();
    const layout = layoutRef.current;
    if (!layout) return;
    const rect = layout.getBoundingClientRect();
    dragRef.current = { index, startX: e.clientX, startSizes: [...colSizes] };

    const onMove = (e: MouseEvent) => {
      if (!dragRef.current || !layout) return;
      const dx = e.clientX - dragRef.current.startX;
      const dxPct = (dx / rect.width) * 100;
      const { index, startSizes } = dragRef.current;

      const newSizes = [...startSizes] as [number, number, number];
      newSizes[index] = startSizes[index] + dxPct;
      newSizes[index + 1] = startSizes[index + 1] - dxPct;

      const minPcts = MIN_WIDTHS.map((px) => (px / rect.width) * 100);
      if (newSizes[index] < minPcts[index] || newSizes[index + 1] < minPcts[index + 1]) return;

      setColSizes(newSizes);
    };

    const onUp = () => {
      dragRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };

    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

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

  async function handleTip() {
    if (busy) return;
    const tipRequest = "💡 Gimme a hint";
    const userMsg: ChatMessage = { id: uid("msg"), role: "user", text: tipRequest, createdAt: nowIso() };
    const prevHistory = messages.map((msg) => ({ role: msg.role, text: msg.text }));
    setMessages((prev) => [...prev, userMsg]);

    setBusy(true);
    const reply = await onChatReply(tipRequest, prevHistory);
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

  function handleExitConfirm() {
    setShowExitConfirm(false);
    onExit();
  }

  return (
    <section className="practice-focus-page">
      <header className="practice-focus-header">
        <button className="secondary" onClick={() => setShowExitConfirm(true)}>
          <ArrowLeft size={16} />
          Back
        </button>
        <h2>{practiceSource.title}</h2>
        <button className="primary" onClick={() => onEndWithReview(messages, whatToCover)}>
          {copy.endPractice}
        </button>
      </header>

      {showExitConfirm && (
        <div className="modal-overlay" onClick={() => setShowExitConfirm(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>{interfaceLanguage === "中文" ? "退出练习？" : "Exit practice?"}</h3>
            <p>{interfaceLanguage === "中文" ? "本次练习内容不会保存。" : "Your progress in this practice will not be saved."}</p>
            <div className="modal-actions">
              <button className="secondary" onClick={() => setShowExitConfirm(false)}>
                {interfaceLanguage === "中文" ? "取消" : "Cancel"}
              </button>
              <button className="danger" onClick={handleExitConfirm}>
                {interfaceLanguage === "中文" ? "退出" : "Exit"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="practice-cards" ref={layoutRef}>
        <aside className="practice-col" style={{ flexBasis: `${colSizes[0]}%` }}>
          <div className="card-outer">
            <div className="card-scroll">
              <section className="card-inner-section">
                <h3 className="card-section-label">Language Bank</h3>
                {practicePlan && (
                  <>
                    <div className="card-sub-block">
                      <h4 className="card-sub-label">Useful Words</h4>
                      <div className="word-pills">
                        {practicePlan.languageBank.usefulWords.map((word, i) => (
                          <span key={i} className="word-pill">{word}</span>
                        ))}
                      </div>
                    </div>
                    <div className="card-sub-block">
                      <h4 className="card-sub-label">Useful Chunks</h4>
                      <div className="chunk-list">
                        {practicePlan.languageBank.usefulChunks.map((chunk, i) => (
                          <p key={i} className="chunk-item">{chunk}</p>
                        ))}
                      </div>
                    </div>
                  </>
                )}
                {!practicePlan && (
                  <p className="card-empty">Loading practice notes...</p>
                )}
              </section>

              <div className="card-section-divider" />

              <section className="card-inner-section">
                <h3 className="card-section-label">Original Source</h3>
                {captures.length === 0 && (
                  <p className="card-empty">{practiceSource.summary || "No source content for this practice."}</p>
                )}
                {captures.map((capture) => {
                  const text = combineFragmentText(capture.fragments);
                  if (!text) return null;
                  return (
                    <div key={capture.id} className="source-entry">
                      <h4 className="source-entry-title">{capture.title}</h4>
                      <p className="card-body-text source-entry-text">{text}</p>
                    </div>
                  );
                })}
              </section>
            </div>
          </div>
        </aside>

        <div className="col-divider" onMouseDown={(e) => startDrag(0, e)} />

        <main className="practice-col" style={{ flexBasis: `${colSizes[1]}%` }}>
          <div className="card-outer conversation-card">
            <div className="conversation-messages">
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
            <footer className="conversation-input">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={copy.inputPlaceholder}
                disabled={busy}
                rows={1}
              />
              <button className="secondary" onClick={handleTip} disabled={busy}>
                <Lightbulb size={16} />
              </button>
              <button className="primary" onClick={handleSend} disabled={busy || !input.trim()}>
                <Send size={16} />
              </button>
              <CallBu state={callState} error={callError} userText={callUserText} buText={callBuText} onStart={startCall} onEnd={endCall} interfaceLanguage={interfaceLanguage} compact />
            </footer>
          </div>
        </main>

        <div className="col-divider" onMouseDown={(e) => startDrag(1, e)} />

        <aside className="practice-col" style={{ flexBasis: `${colSizes[2]}%` }}>
          <div className="card-outer">
            <div className="card-scroll">
              <section className="card-inner-section">
                <h3 className="card-section-label">Practice Goal</h3>
                <p className="goal-text-main">{practicePlan?.practiceGoal ?? practiceSource.practiceGoal}</p>
              </section>

              <div className="card-section-divider" />

              <section className="card-inner-section">
                <h3 className="card-section-label">What to cover</h3>
                <div className="goal-items">
                  {whatToCover.map((item, i) => {
                    const done = completedSet.has(i);
                    return (
                      <div key={i} className={`goal-item ${done ? "completed" : ""}`}>
                        <span className={`goal-checkbox ${done ? "checked" : ""}`}>
                          {done && <span className="goal-checkbox-fill" />}
                        </span>
                        <span className="goal-item-text">{item}</span>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>

            <div className="goal-footer">
              <img src="/assets/tinybu-practice.png" alt="TinyBu" className="goal-tinybu" />
              <CallBu state={callState} error={callError} userText={callUserText} buText={callBuText} onStart={startCall} onEnd={endCall} interfaceLanguage={interfaceLanguage} compact />
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
