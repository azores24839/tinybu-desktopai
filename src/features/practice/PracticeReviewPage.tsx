import { useState } from "react";
import { BarChart3, Check, CheckCircle2, LibraryBig, RefreshCcw, Sparkles, Target, X } from "lucide-react";
import { formatDate } from "../../lib/date";
import type { PracticeChatReview } from "../../types";

function splitParagraphs(summary: string) {
  return summary
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function clampScore(score: number | undefined, fallback: number) {
  if (!Number.isFinite(score)) return fallback;
  return Math.max(0, Math.min(100, Math.round(score ?? fallback)));
}

function fallbackScores(review: PracticeChatReview) {
  const signals = review.dimensionSignals;
  const overall = review.expressionStatus?.score ?? 68;
  return {
    fluency: clampScore(signals?.continuity, overall),
    naturalness: clampScore(signals?.control, overall),
    vocabulary: clampScore(signals?.development, overall)
  };
}

export function PracticeReviewPage({
  sourceTitle,
  review,
  onDone,
  onPracticeAgain,
  interfaceLanguage
}: {
  sourceTitle: string;
  review: PracticeChatReview;
  onDone: (review: PracticeChatReview) => void;
  onPracticeAgain: (review: PracticeChatReview) => void;
  interfaceLanguage: "中文" | "English";
}) {
  const copy = interfaceLanguage === "中文" ? zh : en;
  const [showArchive, setShowArchive] = useState(false);
  const [selectedExpressionIndexes, setSelectedExpressionIndexes] = useState<Set<number>>(
    () => new Set(review.betterExpressions.map((_, index) => index))
  );
  const [selectedChunkIndexes, setSelectedChunkIndexes] = useState<Set<number>>(
    () => new Set(review.savedWordsOrChunks.map((_, index) => index))
  );
  const scores = review.reviewScores ?? fallbackScores(review);
  const paragraphs = splitParagraphs(review.diarySummary);
  const structuredReview = review.expressionStatus && review.strength && review.nextFocus
    ? {
        expressionStatus: review.expressionStatus,
        strength: review.strength,
        nextFocus: review.nextFocus
      }
    : null;
  const outcome = review.taskOutcome ?? {
    label: copy.taskFallbackTitle,
    detail: review.nextFocus?.detail || copy.taskFallbackBody
  };

  function toggleExpression(index: number) {
    setSelectedExpressionIndexes((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function toggleChunk(index: number) {
    setSelectedChunkIndexes((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function selectedReview() {
    return {
      ...review,
      betterExpressions: review.betterExpressions.filter((_, index) => selectedExpressionIndexes.has(index)),
      savedWordsOrChunks: review.savedWordsOrChunks.filter((_, index) => selectedChunkIndexes.has(index))
    };
  }

  function allExpressionsSelected() {
    return review.betterExpressions.length > 0 && selectedExpressionIndexes.size === review.betterExpressions.length;
  }

  function allChunksSelected() {
    return review.savedWordsOrChunks.length > 0 && selectedChunkIndexes.size === review.savedWordsOrChunks.length;
  }

  function toggleAllExpressions() {
    setSelectedExpressionIndexes(
      allExpressionsSelected() ? new Set() : new Set(review.betterExpressions.map((_, index) => index))
    );
  }

  function toggleAllChunks() {
    setSelectedChunkIndexes(
      allChunksSelected() ? new Set() : new Set(review.savedWordsOrChunks.map((_, index) => index))
    );
  }

  return (
    <section className="page practice-chat-review-page">
      <div className="practice-review-shell review-redesign-shell">
        <header className="practice-chat-review-header">
          <div>
            <span className="review-kicker">{copy.kicker}</span>
            <h2>{copy.title}</h2>
            <p className="review-topic-name">{sourceTitle}</p>
          </div>
          <p className="review-date">{formatDate(review.createdAt)}</p>
        </header>

        <section className="review-redesign-grid">
          <article className="review-task-card">
            <div className="review-card-title">
              <Target size={20} />
              <span>{copy.taskTitle}</span>
            </div>
            <h3>{outcome.label}</h3>
            <p>{outcome.detail}</p>
          </article>

          <article className="review-score-card">
            <div className="review-card-title">
              <BarChart3 size={20} />
              <span>{copy.scoreTitle}</span>
            </div>
            <div className="review-score-list">
              {[
                [copy.fluency, scores.fluency],
                [copy.naturalness, scores.naturalness],
                [copy.vocabulary, scores.vocabulary]
              ].map(([label, score]) => (
                <div className="review-score-row" key={label}>
                  <span>{label}</span>
                  <div>
                    <i style={{ width: `${score}%` }} />
                  </div>
                  <strong>{score}</strong>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="review-analysis-card">
          <div className="review-card-title">
            <Sparkles size={20} />
            <span>{copy.analysisTitle}</span>
          </div>
          {paragraphs.length ? (
            paragraphs.map((paragraph, index) => <p key={`${paragraph}-${index}`}>{paragraph}</p>)
          ) : (
            <p>{copy.noAnalysis}</p>
          )}
        </section>

        {structuredReview && (
          <section className="review-analysis-card">
            <div className="review-card-title">
              <Sparkles size={20} />
              <span>{copy.structuredTitle}</span>
            </div>
            <article className="review-suggestion-item">
              <span>{structuredReview.expressionStatus.label}</span>
              <p>{structuredReview.strength.detail}</p>
            </article>
            <article className="review-suggestion-item">
              <span>{structuredReview.nextFocus.label}</span>
              <p>{structuredReview.nextFocus.practiceMove}</p>
            </article>
            {review.why?.length ? (
              <article className="review-suggestion-item">
                <h3>Why</h3>
                {review.why.map((moment, index) => (
                  <p key={`${moment.quote}-${index}`}>
                    <strong>{moment.quote}</strong>
                    {moment.interpretation}
                  </p>
                ))}
              </article>
            ) : null}
          </section>
        )}

        <section className="review-suggestions-card">
          <div className="review-card-title">
            <CheckCircle2 size={20} />
            <span>{copy.suggestionsTitle}</span>
          </div>
          {review.betterExpressions.length ? (
            <div className="review-suggestion-list">
              {review.betterExpressions.map((expression, index) => (
                <article key={`${expression.improved}-${index}`} className="review-suggestion-item">
                  <span>{expression.note || copy.expressionIssue}</span>
                  {expression.original && (
                    <p className="review-original-line">
                      <strong>{copy.originalLabel}</strong>
                      {expression.original}
                    </p>
                  )}
                  <p className="review-improved-line">
                    <strong>{copy.improvedLabel}</strong>
                    {expression.improved}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <p className="review-muted">{copy.noSuggestions}</p>
          )}
        </section>

        <footer className="practice-chat-review-footer">
          <button className="secondary" onClick={() => setShowArchive(true)}>
            <LibraryBig size={16} />
            {copy.archiveCta}
          </button>
          <button className="primary" onClick={() => onDone(selectedReview())}>
            {copy.done}
          </button>
          <button className="secondary" onClick={() => onPracticeAgain(selectedReview())}>
            <RefreshCcw size={16} />
            {copy.practiceAgain}
          </button>
        </footer>

        {showArchive && (
          <div className="review-archive-modal" role="dialog" aria-label={copy.archiveTitle}>
            <div className="review-archive-card">
              <header>
                <div>
                  <span className="review-kicker">{copy.archiveKicker}</span>
                  <h3>{copy.archiveTitle}</h3>
                </div>
                <button onClick={() => setShowArchive(false)} aria-label={copy.closeArchive}>
                  <X size={18} />
                </button>
              </header>

              <section>
                <div className="review-archive-section-heading">
                  <div>
                    <h3>{copy.expressionArchiveTitle}</h3>
                    <span>{selectedExpressionIndexes.size}/{review.betterExpressions.length}</span>
                  </div>
                  <button onClick={toggleAllExpressions} disabled={!review.betterExpressions.length}>
                    {allExpressionsSelected() ? copy.clearAll : copy.selectAll}
                  </button>
                </div>
                {review.betterExpressions.length ? (
                  <div className="review-archive-select-list">
                    {review.betterExpressions.map((expression, index) => (
                      <button
                        key={`${expression.improved}-${index}`}
                        className={selectedExpressionIndexes.has(index) ? "selected" : ""}
                        onClick={() => toggleExpression(index)}
                      >
                        <span>{selectedExpressionIndexes.has(index) ? <Check size={13} /> : null}</span>
                        <strong>{expression.improved}</strong>
                        {expression.original && <em>{expression.original}</em>}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="review-muted">{copy.noExpressionArchive}</p>
                )}
              </section>

              <section>
                <div className="review-archive-section-heading">
                  <div>
                    <h3>{copy.chunkArchiveTitle}</h3>
                    <span>{selectedChunkIndexes.size}/{review.savedWordsOrChunks.length}</span>
                  </div>
                  <button onClick={toggleAllChunks} disabled={!review.savedWordsOrChunks.length}>
                    {allChunksSelected() ? copy.clearAll : copy.selectAll}
                  </button>
                </div>
                {review.savedWordsOrChunks.length ? (
                  <div className="review-archive-select-list chunks">
                    {review.savedWordsOrChunks.map((chunk, index) => (
                      <button
                        key={`${chunk}-${index}`}
                        className={selectedChunkIndexes.has(index) ? "selected" : ""}
                        onClick={() => toggleChunk(index)}
                      >
                        <span>{selectedChunkIndexes.has(index) ? <Check size={13} /> : null}</span>
                        <strong>{chunk}</strong>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="review-muted">{copy.noChunkArchive}</p>
                )}
              </section>

              <footer>
                <button className="secondary" onClick={() => setShowArchive(false)}>
                  {copy.backToReview}
                </button>
                <button className="primary" onClick={() => onDone(selectedReview())}>
                  {copy.saveArchive}
                </button>
              </footer>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

const zh = {
  kicker: "Review",
  title: "本次口语复盘",
  taskTitle: "任务完成情况",
  taskFallbackTitle: "已完成一次主题对话",
  taskFallbackBody: "TinyBu 已根据这次对话整理出整体表现和可优化表达。",
  scoreTitle: "综合评分",
  fluency: "流利度",
  naturalness: "表达自然度",
  vocabulary: "词汇量",
  analysisTitle: "整体表现分析",
  noAnalysis: "这次练习内容较短，先保留轻量复盘。",
  structuredTitle: "关键表现",
  suggestionsTitle: "优化建议",
  expressionIssue: "表达错误",
  originalLabel: "原句",
  improvedLabel: "优化",
  noSuggestions: "这次没有明显需要改写的语法或表达错误。",
  archiveCta: "整理进表达库",
  archiveKicker: "Archive",
  archiveTitle: "选择要保存的表达",
  closeArchive: "关闭存档",
  expressionArchiveTitle: "优化句",
  chunkArchiveTitle: "收藏对话 / Chunk",
  selectAll: "全选",
  clearAll: "取消全选",
  noExpressionArchive: "这次没有可保存的优化句。",
  noChunkArchive: "这次没有可保存的对话或 Chunk。",
  backToReview: "返回复盘",
  saveArchive: "保存并完成",
  done: "完成",
  practiceAgain: "再练一次"
};

const en = {
  kicker: "Review",
  title: "Speaking review",
  taskTitle: "Mission result",
  taskFallbackTitle: "One topic conversation completed",
  taskFallbackBody: "TinyBu organized your overall performance and expression fixes from this call.",
  scoreTitle: "Scores",
  fluency: "Fluency",
  naturalness: "Naturalness",
  vocabulary: "Vocabulary",
  analysisTitle: "Overall performance",
  noAnalysis: "This practice was short, so TinyBu kept the review light.",
  structuredTitle: "Key performance",
  suggestionsTitle: "Optimization suggestions",
  expressionIssue: "Expression issue",
  originalLabel: "Original",
  improvedLabel: "Better",
  noSuggestions: "No clear grammar or expression issue needed rewriting this time.",
  archiveCta: "Organize library",
  archiveKicker: "Archive",
  archiveTitle: "Choose expressions to save",
  closeArchive: "Close archive",
  expressionArchiveTitle: "Optimized sentences",
  chunkArchiveTitle: "Saved lines / chunks",
  selectAll: "Select all",
  clearAll: "Clear all",
  noExpressionArchive: "No optimized sentence to save this time.",
  noChunkArchive: "No saved line or chunk to save this time.",
  backToReview: "Back to review",
  saveArchive: "Save and finish",
  done: "Done",
  practiceAgain: "Practice again"
};
