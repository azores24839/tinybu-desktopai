import { useEffect, useRef, useState } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { uiCopy } from "../../lib/uiCopy";
import type { PracticePlan, UserProfile } from "../../types";

export function PracticePreparingPage({
  interfaceLanguage,
  sourceTitle,
  sourceSummary,
  practiceGoal,
  practicePlan,
  mode = "before-call",
  onReady
}: {
  interfaceLanguage: UserProfile["interfaceLanguage"];
  sourceTitle?: string;
  sourceSummary?: string;
  practiceGoal?: string;
  practicePlan?: PracticePlan | null;
  mode?: "before-call" | "review-loading";
  onReady: () => void;
}) {
  const copy = uiCopy[interfaceLanguage].practiceChat as Record<string, string>;
  const isChinese = interfaceLanguage === "中文";
  const [progress, setProgress] = useState(0);
  const [stageIndex, setStageIndex] = useState(0);
  const stages = mode === "review-loading"
    ? [
        isChinese ? "正在整理任务结果" : "Checking mission result",
        isChinese ? "正在分析表达表现" : "Reading your speaking pattern",
        isChinese ? "正在生成优化建议" : "Preparing expression fixes"
      ]
    : [copy.stageReading, copy.stageIdeas, copy.stageQuestion];
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setProgress((prev) => {
        const next = prev + (mode === "review-loading" ? 9 : 7);
        if (next >= 100) {
          clearInterval(intervalRef.current);
          return 100;
        }
        return Math.min(next, 100);
      });
    }, 220);

    return () => clearInterval(intervalRef.current);
  }, [mode]);

  useEffect(() => {
    if (progress < 30) setStageIndex(0);
    else if (progress < 60) setStageIndex(1);
    else setStageIndex(2);
  }, [progress]);

  return (
    <section className={`page practice-preparing ${mode === "review-loading" ? "review-loading" : ""}`}>
      <div className="preparing-surface">
        <header className="preparing-topbar">
          <span>TinyBu</span>
          <em>{mode === "review-loading" ? (isChinese ? "课后复盘" : "Review") : (isChinese ? "课前准备" : "Before call")}</em>
        </header>

        <main className="preparing-main">
          <section className="preparing-intro">
            <span className="preparing-kicker">{mode === "review-loading" ? "Review" : "Speaking mission"}</span>
            <h1>{mode === "review-loading" ? (isChinese ? "正在生成复盘" : "Preparing your review") : (sourceTitle || copy.preparingTitle)}</h1>
            <p>{mode === "review-loading" ? (isChinese ? "TinyBu 正在整理本次任务、评分和优化建议。" : "TinyBu is organizing your mission result, scores, and expression fixes.") : (sourceSummary || copy.preparingDescription)}</p>

            {mode === "before-call" && (
              <div className="preparing-brief">
                <span>{isChinese ? "本次任务" : "Mission"}</span>
                <strong>{practicePlan?.practiceGoal || practiceGoal || copy.firstQuestion}</strong>
              </div>
            )}

            <div className="preparing-progress">
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${progress}%` }} />
              </div>
              <span className="progress-label">{stages[stageIndex]}</span>
            </div>

            {mode === "before-call" && progress >= 100 && (
              <button className="primary preparing-start-button" onClick={onReady}>
                {isChinese ? "开始和 TinyBu 聊" : "Start talking with TinyBu"}
                <ArrowRight size={18} />
              </button>
            )}
          </section>

          <section className="preparing-side">
            <div className="preparing-bu">
              <img src="/assets/tinybu-practice.png" alt="TinyBu" />
            </div>
            {mode === "before-call" && !!practicePlan?.whatToCover.length ? (
              <div className="preparing-routes">
                <span>{isChinese ? "可以聊" : "You can cover"}</span>
                <div>
                  {practicePlan.whatToCover.map((item, index) => (
                    <em key={item}>
                      <CheckCircle2 size={16} />
                      <b>{index + 1}</b>
                      {item}
                    </em>
                  ))}
                </div>
              </div>
            ) : (
              <div className="preparing-routes review">
                <span>{isChinese ? "正在处理" : "Preparing"}</span>
                <div>
                  {stages.map((item, index) => (
                    <em key={item} className={index <= stageIndex ? "active" : ""}>
                      <CheckCircle2 size={16} />
                      <b>{index + 1}</b>
                      {item}
                    </em>
                  ))}
                </div>
              </div>
            )}
          </section>
        </main>
      </div>
    </section>
  );
}
