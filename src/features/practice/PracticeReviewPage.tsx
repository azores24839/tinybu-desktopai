import { AppHeader } from "../../components/AppHeader";
import { formatDate } from "../../lib/date";
import type { ExpressionRecord, PracticeSession, ReviewRecord, TopicItem } from "../../types";

export function PracticeReviewPage({
  topic,
  review,
  session,
  expressions,
  backToTopics,
  openNotebook,
  continuePractice
}: {
  topic: TopicItem;
  review: ReviewRecord;
  session?: PracticeSession;
  expressions: ExpressionRecord[];
  backToTopics: () => void;
  openNotebook: () => void;
  continuePractice: () => void;
}) {
  const saved = expressions.filter((expression) => review.savedExpressionIds.includes(expression.id));
  return (
    <section className="page">
      <AppHeader title="Practice Review" description={topic.name}>
        <button className="secondary" onClick={backToTopics}>
          Back to Topics
        </button>
        <button className="primary" onClick={openNotebook}>
          Save to Notebook
        </button>
      </AppHeader>

      <section className="panel review-summary">
        <div>
          <p className="eyebrow">Completed {formatDate(review.createdAt)}</p>
          <h2>{review.talkedAbout}</h2>
          <p>{session?.answers.length ?? 0} questions completed.</p>
        </div>
      </section>

      <div className="review-grid">
        <section className="panel">
          <div className="section-title">What You Practiced</div>
          <p>{review.talkedAbout}</p>
          <div className="mini-list">
            {review.didWell.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </section>
        <section className="panel">
          <div className="section-title">Better Expressions</div>
          {review.naturalExpressions.map((item) => (
            <article className="natural-pair" key={`${item.original}-${item.improved}`}>
              <span>User original</span>
              <p>{item.original}</p>
              <span>More natural</span>
              <strong>{item.improved}</strong>
              <button className="secondary">Save</button>
            </article>
          ))}
        </section>
      </div>

      <div className="two-column">
        <section className="panel">
          <div className="section-title">Saved Suggestions</div>
          <div className="mini-list">
            {saved.slice(0, 5).map((expression) => (
              <span key={expression.id}>{expression.pattern}</span>
            ))}
          </div>
        </section>
        <section className="panel">
          <div className="section-title">Next Step</div>
          <p>{review.nextPractice}</p>
          <div className="button-row">
            <button className="primary" onClick={openNotebook}>
              Review in Notebook
            </button>
            <button className="secondary" onClick={continuePractice}>
              Continue Practice
            </button>
            <button className="secondary" onClick={backToTopics}>
              Start another Topic
            </button>
          </div>
        </section>
      </div>
    </section>
  );
}
