import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, EyeOff, Lightbulb, Mic, PenLine, RotateCcw, Sparkles } from "lucide-react";
import { EmptyState } from "../../components/EmptyState";
import {
  expressionAlternatives,
  expressionNativeMeaning,
  expressionRecallPrompt,
  expressionScenarioOptions,
  expressionUsageHint
} from "../../lib/expressionMeaning";
import type { ExpressionRecord } from "../../types";

type TrainingStep = "notice" | "judge" | "personalize" | "recall";

const steps: Array<{ id: TrainingStep; label: string }> = [
  { id: "notice", label: "看懂" },
  { id: "judge", label: "判断" },
  { id: "personalize", label: "改写" },
  { id: "recall", label: "调用" }
];

function trainingQueue(expressions: ExpressionRecord[]) {
  const due = expressions.filter((expression) => expression.useLater || !expression.learned);
  return due.length ? due : expressions;
}

export function ExpressionTrainingPage({
  expressions,
  updateExpression,
  back
}: {
  expressions: ExpressionRecord[];
  updateExpression: (record: ExpressionRecord) => void;
  back: () => void;
}) {
  const [queueIds] = useState(() => trainingQueue(expressions).map((expression) => expression.id));
  const queue = useMemo(
    () => queueIds
      .map((id) => expressions.find((expression) => expression.id === id))
      .filter((expression): expression is ExpressionRecord => Boolean(expression)),
    [expressions, queueIds]
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [replacementDraft, setReplacementDraft] = useState("");
  const [recallDraft, setRecallDraft] = useState("");
  const [selectedScenarioId, setSelectedScenarioId] = useState("");
  const [completed, setCompleted] = useState(false);
  const current = queue[currentIndex];
  const step = steps[stepIndex];
  const progress = queue.length ? ((currentIndex * steps.length + stepIndex + 1) / (queue.length * steps.length)) * 100 : 0;
  const nativeMeaning = current ? expressionNativeMeaning(current) : "";
  const alternatives = current ? expressionAlternatives(current.pattern) : [];
  const usageHint = current ? expressionUsageHint(current) : "";
  const scenarioOptions = current ? expressionScenarioOptions(current) : [];
  const selectedScenario = scenarioOptions.find((option) => option.id === selectedScenarioId);
  const recallPrompt = current ? expressionRecallPrompt(current) : "";
  const canMoveNext = step.id !== "judge" || Boolean(selectedScenarioId);

  function moveNext() {
    if (!current) return;
    const isRecall = step.id === "recall";
    const userSentence = step.id === "recall"
      ? recallDraft.trim() || replacementDraft.trim() || current.userSentence
      : replacementDraft.trim() || current.userSentence;
    updateExpression({
      ...current,
      userSentence,
      practiceCount: current.practiceCount + (isRecall ? 1 : 0),
      learned: isRecall ? true : current.learned,
      useLater: isRecall ? false : current.useLater
    });

    if (stepIndex < steps.length - 1) {
      setStepIndex((value) => value + 1);
      return;
    }

    if (currentIndex < queue.length - 1) {
      setCurrentIndex((value) => value + 1);
      setStepIndex(0);
      setReplacementDraft("");
      setRecallDraft("");
      setSelectedScenarioId("");
      return;
    }

    setCompleted(true);
  }

  function skipCurrent() {
    if (currentIndex < queue.length - 1) {
      setCurrentIndex((value) => value + 1);
      setStepIndex(0);
      setReplacementDraft("");
      setRecallDraft("");
      setSelectedScenarioId("");
    } else {
      setCompleted(true);
    }
  }

  if (!queue.length) {
    return (
      <main className="expression-training-fullscreen">
        <button className="training-exit-button" onClick={back}>
          <ArrowLeft size={18} />
          返回表达库
        </button>
        <EmptyState title="还没有可训练的表达" body="完成一次 call 后，把优化句或语块存进表达库就可以开始练。" />
      </main>
    );
  }

  if (completed) {
    return (
      <main className="expression-training-fullscreen">
        <section className="training-complete-card">
          <span>Training complete</span>
          <h1>这轮表达训练完成了</h1>
          <p>你刚刚把表达从“看得懂”往“开口能用”推进了一步。</p>
          <button className="primary" onClick={back}>
            回到表达库
            <ArrowRight size={18} />
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="expression-training-fullscreen">
      <header className="training-topbar">
        <button className="training-exit-button" onClick={back}>
          <ArrowLeft size={18} />
          表达库
        </button>
        <div className="training-progress-wrap" aria-label="训练进度">
          <span style={{ width: `${progress}%` }} />
        </div>
        <strong>{currentIndex + 1}/{queue.length}</strong>
      </header>

      <section className="training-question-shell">
        <div className="training-step-tabs">
          {steps.map((item, index) => (
            <span key={item.id} className={index === stepIndex ? "active" : index < stepIndex ? "done" : ""}>
              {index < stepIndex ? <Check size={14} /> : index + 1}
              {item.label}
            </span>
          ))}
        </div>

        <article className="training-question-card">
          <div className="training-prompt-head">
            <div>
              <div className="training-question-kicker">{current.scene}</div>
              <h1>{step.id === "recall" ? "只看中文，把它说出来" : current.pattern}</h1>
            </div>
            <p>{step.id === "recall" ? recallPrompt : nativeMeaning}</p>
          </div>

          <div className="training-workspace-grid">
            <div className="training-task-column">
              {step.id === "notice" && (
                <div className="training-task-card">
                  <div>
                    <Lightbulb size={22} />
                    <strong>先建立“什么时候用”的感觉</strong>
                  </div>
                  <p>{usageHint}</p>
                  <div className="expression-breakdown">
                    <span>英文表达</span>
                    <strong>{current.pattern}</strong>
                    <span>中文意思</span>
                    <strong>{nativeMeaning}</strong>
                  </div>
                </div>
              )}

              {step.id === "judge" && (
                <div className="training-task-card">
                  <div>
                    <Sparkles size={22} />
                    <strong>判断哪个场景最适合用它</strong>
                  </div>
                  <p>这一步不是考试，是帮你把表达和真实使用场景连起来。</p>
                  <div className="scenario-choice-list">
                    {scenarioOptions.map((option) => {
                      const selected = selectedScenarioId === option.id;
                      const revealed = Boolean(selectedScenarioId);
                      return (
                        <button
                          key={option.id}
                          className={selected ? "selected" : ""}
                          onClick={() => setSelectedScenarioId(option.id)}
                          type="button"
                        >
                          <span>{selected && revealed ? (option.correct ? <Check size={16} /> : "×") : ""}</span>
                          <strong>{option.text}</strong>
                        </button>
                      );
                    })}
                  </div>
                  {selectedScenario && (
                    <p className={selectedScenario.correct ? "scenario-feedback correct" : "scenario-feedback"}>
                      {selectedScenario.correct ? "对，这个表达要和具体场景绑定，之后才容易在聊天里调出来。" : "这个选项太泛了。表达库里的 chunk 要练的是“什么时候能直接开口用”。"}
                    </p>
                  )}
                </div>
              )}

              {step.id === "personalize" && (
                <div className="training-task-card">
                  <div>
                    <PenLine size={22} />
                    <strong>换成你的真实内容</strong>
                  </div>
                  <p>保留表达功能，把它改成你下次聊天真的可能会说的一句话。</p>
                  <textarea
                    value={replacementDraft}
                    onChange={(event) => setReplacementDraft(event.target.value)}
                    placeholder={current.practiceStem || `Try using "${current.pattern}" in your own sentence.`}
                  />
                </div>
              )}

              {step.id === "recall" && (
                <div className="training-task-card recall-training-card">
                  <div>
                    <EyeOff size={22} />
                    <strong>只看中文或情境，输出英文</strong>
                  </div>
                  <p>{recallPrompt}</p>
                  <div className="recall-input-grid">
                    <label>
                      手动输入，或粘贴语音转文字结果
                      <textarea
                        value={recallDraft}
                        onChange={(event) => setRecallDraft(event.target.value)}
                        placeholder="用英文写下你会怎么说"
                      />
                    </label>
                    <button className="secondary disabled-placeholder" type="button">
                      <Mic size={16} />
                      语音转文字待接入
                    </button>
                  </div>
                </div>
              )}
            </div>

            <aside className="training-meaning-card">
              <span>中文辅助</span>
              <strong>{nativeMeaning}</strong>
              <p>{usageHint}</p>
              {step.id === "recall" && <div className="recall-hidden-expression">{nativeMeaning}</div>}
              {alternatives.length > 0 && (
                <div>
                  <small>可替换说法</small>
                  {alternatives.map((alternative) => (
                    <em key={alternative}>{alternative}</em>
                  ))}
                </div>
              )}
            </aside>
          </div>

          <footer className="training-action-bar">
            <button className="secondary" onClick={skipCurrent}>
              跳过
            </button>
            <button className="secondary" onClick={() => {
              setStepIndex(0);
              setReplacementDraft("");
              setRecallDraft("");
              setSelectedScenarioId("");
            }}>
              <RotateCcw size={16} />
              重来
            </button>
            <button className="primary" onClick={moveNext} disabled={!canMoveNext}>
              {stepIndex === steps.length - 1 ? "完成这一题" : step.id === "judge" && !selectedScenarioId ? "先选一个场景" : "下一步"}
              <ArrowRight size={18} />
            </button>
          </footer>
        </article>
      </section>
    </main>
  );
}
