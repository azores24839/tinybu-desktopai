import { useEffect, useMemo, useState } from "react";
import { Bookmark, Captions, Lightbulb, MessageSquareText, Mic, MicOff, PhoneOff, RefreshCw, X } from "lucide-react";
import { uid, nowIso } from "../../lib/defaults";
import type { ChatMessage, UserProfile, CaptureItem, PracticePlan } from "../../types";
import type { PracticeSource } from "./practiceSessionTypes";
import { useCallBu } from "./useCallBu";
import { AvatarVideoPlayer } from "./avatar/AvatarVideoPlayer";
import { avatarStatusLabel } from "./avatar/avatarVideos";

function combineFragmentText(fragments: Array<{ text: string }>): string {
  return fragments
    .map((f) => f.text.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ");
}

function truncateText(text: string, max = 420) {
  if (text.length <= max) return text;
  return `${text.slice(0, max).trim()}...`;
}

function rotatingSlice(items: string[], page: number, count: number) {
  if (items.length <= count) return items;
  const start = (page * count) % items.length;
  return Array.from({ length: count }, (_, index) => items[(start + index) % items.length]);
}

export function PracticeChatPage({
  practiceSource,
  captures,
  practicePlan,
  opening,
  firstQuestion,
  onEndWithReview,
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
  const isChinese = interfaceLanguage === "中文";
  const [showTips, setShowTips] = useState(false);
  const [showCaptions, setShowCaptions] = useState(true);
  const [showTranscript, setShowTranscript] = useState(false);
  const [wordHintPage, setWordHintPage] = useState(0);
  const [chunkHintPage, setChunkHintPage] = useState(0);
  const { state: callState, error: callError, userText, buText, muted, startCall, endCall, toggleMute } = useCallBu(
    { title: practiceSource.title, summary: practiceSource.summary },
    targetLanguage,
    nativeLanguage
  );
  const whatToCover = practicePlan?.whatToCover ?? [];
  const seedMessages = useMemo<ChatMessage[]>(
    () => [
      { id: uid("msg"), role: "bu", text: opening, createdAt: nowIso() },
      { id: uid("msg"), role: "bu", text: firstQuestion, createdAt: nowIso() },
    ],
    [firstQuestion, isChinese, opening]
  );
  const [messages, setMessages] = useState<ChatMessage[]>(seedMessages);
  const sourceText = captures
    .map((capture) => combineFragmentText(capture.fragments))
    .filter(Boolean)
    .join("\n\n");
  const taskSourceText = practiceSource.kind === "task" ? practiceSource.task.sourceText : "";
  const sourcePreview = truncateText(sourceText || taskSourceText || practiceSource.summary || (isChinese ? "这次练习没有绑定素材，可以围绕当前话题自由表达。" : "No source is attached. You can speak freely around the current topic."));
  const allUsefulWords = practicePlan?.languageBank.usefulWords ?? ["main point", "example", "because"];
  const allUsefulChunks = practicePlan?.languageBank.usefulChunks ?? ["The main point is that...", "For example, ...", "I think... because..."];
  const usefulWords = rotatingSlice(allUsefulWords, wordHintPage, 6);
  const usefulChunks = rotatingSlice(allUsefulChunks, chunkHintPage, 4);
  const currentCaption = messages[messages.length - 1];

  useEffect(() => {
    setMessages(seedMessages);
  }, [seedMessages]);

  useEffect(() => {
    void startCall();
    return () => endCall();
  }, [endCall, startCall]);

  useEffect(() => {
    appendLiveMessage("user", userText);
  }, [userText]);

  useEffect(() => {
    appendLiveMessage("bu", buText);
  }, [buText]);

  function appendLiveMessage(role: ChatMessage["role"], text: string) {
    const cleanText = text.trim();
    if (!cleanText) return;

    setMessages((current) => {
      const last = current[current.length - 1];
      const isSameLiveUtterance =
        last?.role === role &&
        (cleanText.startsWith(last.text) || last.text.startsWith(cleanText));
      if (isSameLiveUtterance) {
        return current.map((message, index) => (
          index === current.length - 1 ? { ...message, text: cleanText } : message
        ));
      }
      return [...current, { id: uid("msg"), role, text: cleanText, createdAt: nowIso() }];
    });
  }

  function handleEndCall() {
    endCall();
    onEndWithReview(messages, whatToCover);
  }

  function toggleSavedMessage(id: string) {
    setMessages((current) => current.map((message) => (
      message.id === id ? { ...message, saved: !message.saved } : message
    )));
  }

  return (
    <section className="practice-call-page">
      <video className="practice-call-video" src="/media/practice-call-bg.mp4" autoPlay loop muted playsInline />
      <div className="practice-call-scrim" />
      <AvatarVideoPlayer callState={callState} buText={buText} userText={userText} />

      <main className="practice-call-stage" aria-label={isChinese ? "语音练习通话" : "Practice call"}>
        <div className="practice-call-topbar">
          <div className="practice-call-status">
            <span><i />{callError || avatarStatusLabel(callState, isChinese)}</span>
          </div>
          <button
            className="practice-transcript-toggle"
            onClick={() => setShowTranscript((open) => !open)}
            aria-label={isChinese ? "查看全部对话" : "View full transcript"}
          >
            <MessageSquareText size={18} />
          </button>
        </div>

        {showTips && (
          <aside className="practice-call-tips" aria-label={isChinese ? "提示和素材" : "Hints and source"}>
            <div className="practice-call-tips-header">
              <strong>{isChinese ? "提示" : "Hints"}</strong>
              <div className="practice-call-tips-actions">
                <button onClick={() => setShowTips(false)} aria-label={isChinese ? "关闭提示" : "Close hints"}>
                  <X size={16} />
                </button>
              </div>
            </div>
            <section>
              <h3>{isChinese ? "这次围绕" : "Topic"}</h3>
              <p>{practicePlan?.practiceGoal ?? practiceSource.practiceGoal}</p>
            </section>
            <section>
              <div className="practice-call-section-title">
                <h3>{isChinese ? "可用表达" : "Useful expressions"}</h3>
                <button onClick={() => setWordHintPage((page) => page + 1)} aria-label={isChinese ? "换一组表达" : "Refresh expressions"}>
                  <RefreshCw size={13} />
                </button>
              </div>
              <div className="practice-call-word-row">
                {usefulWords.map((word, index) => (
                  <span key={`${word}-${index}`}>{word}</span>
                ))}
              </div>
            </section>
            <section>
              <div className="practice-call-section-title">
                <h3>{isChinese ? "可用 Chunk" : "Useful chunks"}</h3>
                <button onClick={() => setChunkHintPage((page) => page + 1)} aria-label={isChinese ? "换一组 Chunk" : "Refresh chunks"}>
                  <RefreshCw size={13} />
                </button>
              </div>
              <div className="practice-call-chunks">
                {usefulChunks.map((chunk, index) => (
                  <p key={`${chunk}-${index}`}>{chunk}</p>
                ))}
              </div>
            </section>
            <section>
              <h3>{isChinese ? "素材回顾" : "Source"}</h3>
              <p>{sourcePreview}</p>
            </section>
          </aside>
        )}

        {showTranscript && (
          <aside className="practice-transcript-panel" aria-label={isChinese ? "全部对话" : "Full transcript"}>
            <div className="practice-call-tips-header">
              <strong>{isChinese ? "对话" : "Transcript"}</strong>
              <div className="practice-call-tips-actions">
                <button onClick={() => setShowTranscript(false)} aria-label={isChinese ? "关闭对话" : "Close transcript"}>
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="practice-transcript-list">
              {messages.map((message) => (
                <article key={message.id} className={`practice-transcript-message ${message.role}`}>
                  <p>
                    <span>{message.role === "user" ? (isChinese ? "你" : "You") : "TinyBu"}</span>
                    {message.text}
                  </p>
                  <button
                    className={message.saved ? "saved" : ""}
                    onClick={() => toggleSavedMessage(message.id)}
                    aria-label={isChinese ? "收藏这句话" : "Save this line"}
                    title={isChinese ? "收藏" : "Save"}
                  >
                    <Bookmark size={15} fill={message.saved ? "currentColor" : "none"} />
                  </button>
                </article>
              ))}
            </div>
          </aside>
        )}

        <div className={`practice-call-captions ${showCaptions ? "visible" : ""}`} aria-hidden={!showCaptions}>
          {currentCaption && (
            <p className="current">
              <span>{currentCaption.role === "user" ? (isChinese ? "你" : "You") : "TinyBu"}</span>
              {currentCaption.text}
            </p>
          )}
        </div>

        <footer className="practice-call-controls" aria-label={isChinese ? "通话控制" : "Call controls"}>
          <button className={showTips ? "active" : ""} onClick={() => setShowTips((open) => !open)}>
            <Lightbulb size={22} />
            <span>{isChinese ? "提示" : "Hints"}</span>
          </button>
          <button className={muted ? "active" : ""} onClick={toggleMute}>
            {muted ? <MicOff size={23} /> : <Mic size={23} />}
            <span>{isChinese ? "静音" : "Mute"}</span>
          </button>
          <button className="hangup" onClick={handleEndCall}>
            <PhoneOff size={25} />
            <span>{isChinese ? "挂断" : "End"}</span>
          </button>
          <button className={showCaptions ? "active" : ""} onClick={() => setShowCaptions((visible) => !visible)}>
            <Captions size={23} />
            <span>{isChinese ? "字幕" : "Captions"}</span>
          </button>
        </footer>
      </main>
    </section>
  );
}
