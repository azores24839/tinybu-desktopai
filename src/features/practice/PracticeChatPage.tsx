import { useMemo, useState } from "react";
import { Captions, Lightbulb, PhoneOff, X } from "lucide-react";
import { uid, nowIso } from "../../lib/defaults";
import type { ChatMessage, UserProfile, CaptureItem, PracticePlan } from "../../types";
import type { PracticeSource } from "./usePracticeChat";

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

export function PracticeChatPage({
  practiceSource,
  captures,
  practicePlan,
  opening,
  firstQuestion,
  onEndWithReview,
  interfaceLanguage
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
  const whatToCover = practicePlan?.whatToCover ?? [];
  const messages = useMemo<ChatMessage[]>(
    () => [
      { id: uid("msg"), role: "bu", text: opening, createdAt: nowIso() },
      { id: uid("msg"), role: "bu", text: firstQuestion, createdAt: nowIso() },
      {
        id: uid("msg"),
        role: "user",
        text: isChinese ? "我觉得这段内容主要是在讲一个很具体的问题，但我还没想好怎么用英语说。" : "I think this is about one specific problem, but I am not sure how to say it naturally yet.",
        createdAt: nowIso()
      },
      {
        id: uid("msg"),
        role: "bu",
        text: isChinese ? "没关系，先抓一个重点就好。你可以从 The main point is that... 开始。" : "That's okay. Start with one point: The main point is that...",
        createdAt: nowIso()
      }
    ],
    [firstQuestion, isChinese, opening]
  );
  const sourceText = captures
    .map((capture) => combineFragmentText(capture.fragments))
    .filter(Boolean)
    .join("\n\n");
  const sourcePreview = truncateText(sourceText || practiceSource.summary || (isChinese ? "这次练习没有绑定素材，可以围绕当前话题自由表达。" : "No source is attached. You can speak freely around the current topic."));
  const usefulWords = practicePlan?.languageBank.usefulWords.slice(0, 6) ?? ["main point", "example", "because"];
  const usefulChunks = practicePlan?.languageBank.usefulChunks.slice(0, 4) ?? ["The main point is that...", "For example, ...", "I think... because..."];
  const captionLines = [
    {
      speaker: "You",
      text: isChinese ? "我觉得这段内容主要是在讲一个很具体的问题，但我还没想好怎么用英语说。" : "I think this is about one specific problem, but I am not sure how to say it naturally yet."
    },
    {
      speaker: "TinyBu",
      text: isChinese ? "没关系，先抓一个重点就好。你可以从 The main point is that... 开始。" : "That's okay. Start with one point: The main point is that..."
    }
  ];

  return (
    <section className="practice-call-page">
      <video className="practice-call-video" src="/media/practice-call-bg.mp4" autoPlay loop muted playsInline />
      <div className="practice-call-scrim" />

      <main className="practice-call-stage" aria-label={isChinese ? "语音练习通话" : "Practice call"}>
        <div className="practice-call-status">
          <span><i />{isChinese ? "正在听" : "Listening"}</span>
        </div>

        {showTips && (
          <aside className="practice-call-tips" aria-label={isChinese ? "提示和素材" : "Hints and source"}>
            <div className="practice-call-tips-header">
              <strong>{isChinese ? "提示" : "Hints"}</strong>
              <button onClick={() => setShowTips(false)} aria-label={isChinese ? "关闭提示" : "Close hints"}>
                <X size={16} />
              </button>
            </div>
            <section>
              <h3>{isChinese ? "这次围绕" : "Topic"}</h3>
              <p>{practicePlan?.practiceGoal ?? practiceSource.practiceGoal}</p>
            </section>
            <section>
              <h3>{isChinese ? "可用词" : "Useful words"}</h3>
              <div className="practice-call-word-row">
                {usefulWords.map((word) => (
                  <span key={word}>{word}</span>
                ))}
              </div>
            </section>
            <section>
              <h3>{isChinese ? "可用表达" : "Useful chunks"}</h3>
              <div className="practice-call-chunks">
                {usefulChunks.map((chunk) => (
                  <p key={chunk}>{chunk}</p>
                ))}
              </div>
            </section>
            <section>
              <h3>{isChinese ? "素材回顾" : "Source"}</h3>
              <p>{sourcePreview}</p>
            </section>
          </aside>
        )}

        <div className={`practice-call-captions ${showCaptions ? "visible" : ""}`} aria-hidden={!showCaptions}>
          {captionLines.map((line, index) => (
            <p key={`${line.speaker}-${line.text}`} className={index === captionLines.length - 1 ? "current" : "previous"}>
              <span>{line.speaker}</span>
              {line.text}
            </p>
          ))}
        </div>

        <footer className="practice-call-controls" aria-label={isChinese ? "通话控制" : "Call controls"}>
          <button className={showTips ? "active" : ""} onClick={() => setShowTips((open) => !open)}>
            <Lightbulb size={22} />
            <span>{isChinese ? "提示" : "Hints"}</span>
          </button>
          <button className="hangup" onClick={() => onEndWithReview(messages, whatToCover)}>
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
