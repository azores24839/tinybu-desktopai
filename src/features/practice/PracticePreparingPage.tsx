import { useEffect, useRef, useState } from "react";
import { uiCopy } from "../../lib/uiCopy";
import type { UserProfile } from "../../types";

export function PracticePreparingPage({
  interfaceLanguage,
  onReady
}: {
  interfaceLanguage: UserProfile["interfaceLanguage"];
  onReady: () => void;
}) {
  const copy = uiCopy[interfaceLanguage].practiceChat as Record<string, string>;
  const [progress, setProgress] = useState(0);
  const [stageIndex, setStageIndex] = useState(0);
  const stages = [copy.stageReading, copy.stageIdeas, copy.stageQuestion];
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const readyCalledRef = useRef(false);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setProgress((prev) => {
        const next = prev + 18;
        if (next >= 100) {
          clearInterval(intervalRef.current);
          return 100;
        }
        return Math.min(next, 100);
      });
    }, 160);

    return () => clearInterval(intervalRef.current);
  }, []);

  useEffect(() => {
    if (progress < 30) setStageIndex(0);
    else if (progress < 60) setStageIndex(1);
    else setStageIndex(2);
  }, [progress]);

  useEffect(() => {
    if (progress >= 100 && !readyCalledRef.current) {
      readyCalledRef.current = true;
      const finishTimer = setTimeout(onReady, 180);
      return () => clearTimeout(finishTimer);
    }
  }, [progress, onReady]);

  return (
    <section className="page practice-preparing">
      <div className="preparing-card">
        <div className="preparing-bu">
          <img src="/assets/tinybu-practice.png" alt="TinyBu" />
        </div>
        <h2>{copy.preparingTitle}</h2>
        <p>{copy.preparingDescription}</p>
        <div className="preparing-progress">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <span className="progress-label">{stages[stageIndex]}</span>
        </div>
      </div>
    </section>
  );
}
