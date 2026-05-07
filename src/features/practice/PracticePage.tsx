import { Lightbulb, Send } from "lucide-react";
import { AppHeader } from "../../components/AppHeader";
import { EmptyState } from "../../components/EmptyState";
import type { CaptureItem, PracticeSession, TopicItem } from "../../types";

export function PracticePage({
  topic,
  captures,
  session,
  input,
  setInput,
  requestTip,
  submitAnswer,
  endPractice
}: {
  topic: TopicItem;
  captures: CaptureItem[];
  session: PracticeSession;
  input: string;
  setInput: (value: string) => void;
  requestTip: (session: PracticeSession) => void;
  submitAnswer: (session: PracticeSession) => void;
  endPractice: () => void;
}) {
  const question = session.questions[session.currentQuestionIndex];
  const selectedFragments = captures
    .flatMap((capture) => capture.fragments.map((fragment) => ({ ...fragment, captureTitle: capture.title })))
    .filter((fragment) => session.selectedFragmentIds.includes(fragment.id));
  const relatedIds = new Set(question?.relatedFragmentIds ?? []);
  const lastAnswer = session.answers[session.answers.length - 1];

  if (!question) {
    return <EmptyState title="No practice question" body="Start Practice again from a topic." />;
  }

  return (
    <section className="page">
      <AppHeader title="Practice" description={topic.name}>
        <button className="secondary" onClick={endPractice}>
          End Practice
        </button>
      </AppHeader>

      <div className="practice-layout">
        <main className="practice-main">
          <section className="panel question-card">
            <span>
              Question {session.currentQuestionIndex + 1} / {session.questions.length}
            </span>
            <h2>{question.question}</h2>
            <p>Small goal: {topic.practiceGoal}</p>
          </section>

          <section className="panel chat-panel">
            {session.answers.map((answer) => (
              <div className="practice-message" key={answer.id}>
                <div className="user-answer">
                  <strong>You</strong>
                  <p>{answer.answer}</p>
                </div>
                <div className="bu-feedback">
                  <strong>TinyBu</strong>
                  <p>{answer.tinybuReply}</p>
                  <button className="secondary">Save expression</button>
                </div>
              </div>
            ))}
            {lastAnswer && (
              <div className="tiny-note">
                <span>More natural</span>
                <p>{lastAnswer.tinybuReply}</p>
              </div>
            )}
          </section>

          <section className="answer-box">
            <textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="Type your answer in the target language..." />
            <div className="bottom-actions">
              <button className="secondary" disabled={question.tipLevel >= 2} onClick={() => requestTip(session)}>
                <Lightbulb size={18} />
                Tips
              </button>
              <button className="primary" onClick={() => submitAnswer(session)}>
                <Send size={18} />
                Send
              </button>
              <button className="danger" onClick={endPractice}>
                End Practice
              </button>
            </div>
          </section>
        </main>

        <aside className="practice-support">
          <section className="panel">
            <div className="section-title">Topic</div>
            <h3>{topic.name}</h3>
            <p>{topic.summary}</p>
          </section>
          <section className="panel">
            <div className="section-title">Progress</div>
            <strong>{session.answers.length} completed</strong>
          </section>
          <section className="panel">
            <div className="section-title">Tips</div>
            {question.tipLevel === 0 && <p>Click Tips for a direction. Click once more for a complete reference sentence.</p>}
            {question.tipLevel === 1 && <p>{question.tipOutline}</p>}
            {question.tipLevel >= 2 && <p>{question.tipExample}</p>}
          </section>
          <section className="panel">
            <div className="section-title">Source Summary</div>
            <div className="mini-list">
              {selectedFragments.slice(0, 5).map((fragment) => (
                <span className={relatedIds.has(fragment.id) ? "active" : ""} key={fragment.id}>
                  {fragment.text}
                </span>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}
