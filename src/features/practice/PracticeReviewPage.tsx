import { CheckCircle2, Circle } from "lucide-react";
import { formatDate } from "../../lib/date";
import type { PracticeChatReview } from "../../types";

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

  return (
    <section className="page practice-chat-review-page">
      <header className="practice-chat-review-header">
        <h2>{copy.title}</h2>
        <p className="review-topic-name">{sourceTitle}</p>
        <p className="review-date">{formatDate(review.createdAt)}</p>
      </header>

      <div className="practice-chat-review-body">
        <section className="panel">
          <h3 className="section-title">{copy.diaryTitle}</h3>
          <p className="review-diary">{review.diarySummary}</p>
        </section>

        <section className="panel">
          <h3 className="section-title">{copy.focusTitle}</h3>
          <div className="review-focus-items">
            {review.focusItems.map((item) => (
              <div key={item.id} className={`review-focus-item ${item.completed ? "completed" : ""}`}>
                {item.completed ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </section>

        {review.betterExpressions.length > 0 && (
          <section className="panel">
            <h3 className="section-title">{copy.expressionsTitle}</h3>
            <div className="review-expressions">
              {review.betterExpressions.map((expr, i) => (
                <div key={i} className="review-expression-item">
                  {expr.original && (
                    <div className="expression-original">
                      <span className="expression-label">{copy.originalLabel}</span>
                      <p>{expr.original}</p>
                    </div>
                  )}
                  <div className="expression-improved">
                    <span className="expression-label">{copy.improvedLabel}</span>
                    <p className="improved-text">{expr.improved}</p>
                  </div>
                  {expr.note && (
                    <p className="expression-note">{expr.note}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="panel">
          <h3 className="section-title">{copy.wordsTitle}</h3>
          <div className="review-words">
            {review.savedWordsOrChunks.map((word, i) => (
              <span key={i} className="word-pill">{word}</span>
            ))}
          </div>
        </section>

        <section className="panel">
          <h3 className="section-title">{copy.nextTitle}</h3>
          <p className="review-next">{review.nextStep}</p>
        </section>
      </div>

      <footer className="practice-chat-review-footer">
        <button className="primary" onClick={() => onDone(review)}>
          {copy.done}
        </button>
        <button className="secondary" onClick={() => onPracticeAgain(review)}>
          {copy.practiceAgain}
        </button>
      </footer>
    </section>
  );
}

const zh = {
  title: "练习复盘",
  diaryTitle: "今天表达了",
  focusTitle: "完成的小目标",
  expressionsTitle: "更自然的一句话",
  wordsTitle: "下次还能用",
  nextTitle: "TinyBu 记住了",
  originalLabel: "你的表达",
  improvedLabel: "更自然的说法",
  done: "完成",
  practiceAgain: "再练一次"
};

const en = {
  title: "Practice Review",
  diaryTitle: "What you expressed",
  focusTitle: "Small goals covered",
  expressionsTitle: "A more natural way",
  wordsTitle: "Reusable language",
  nextTitle: "What TinyBu remembers",
  originalLabel: "Your expression",
  improvedLabel: "More natural",
  done: "Done",
  practiceAgain: "Practice again"
};
