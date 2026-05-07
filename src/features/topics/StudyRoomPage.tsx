import { ChevronLeft } from "lucide-react";
import { AppHeader } from "../../components/AppHeader";
import { EmptyState } from "../../components/EmptyState";
import type { CaptureItem, ExpressionRecord, TopicItem } from "../../types";
import { ScreenshotPreviewBlock } from "../screenshots/ScreenshotPreviewBlock";
import { ScreenshotQuestionPanel } from "../screenshots/ScreenshotQuestionPanel";
import { captureStatusLabels, sourceLabel } from "../captures/captureUtils";

type StudyRoomPageProps = {
  topic: TopicItem;
  captures: CaptureItem[];
  expressions: ExpressionRecord[];
  activeCapture?: CaptureItem;
  setActiveCapture: (capture: CaptureItem) => void;
  saveExpression: (capture: CaptureItem, expression: string) => void;
  startPractice: () => void;
  back: () => void;
  screenshotQuestionInput: string;
  setScreenshotQuestionInput: (value: string) => void;
  askAboutScreenshot: (capture: CaptureItem, question: string) => void;
  confirmScreenshotText: (capture: CaptureItem) => void;
  screenshotQuestionBusy: boolean;
};

export function StudyRoomPage({
  topic,
  captures,
  expressions,
  activeCapture,
  setActiveCapture,
  saveExpression,
  startPractice,
  back,
  screenshotQuestionInput,
  setScreenshotQuestionInput,
  askAboutScreenshot,
  confirmScreenshotText,
  screenshotQuestionBusy
}: StudyRoomPageProps) {
  const current = activeCapture && captures.some((capture) => capture.id === activeCapture.id) ? activeCapture : captures[0];
  const usefulExpressions = current?.suggestedExpressions ?? [];

  return (
    <section className="page">
      <AppHeader title={topic.name} description="Study Room">
        <button className="secondary" onClick={back}>
          <ChevronLeft size={18} /> Topic
        </button>
        <button className="primary" onClick={startPractice}>
          Start Practice
        </button>
      </AppHeader>

      <div className="study-layout">
        <aside className="source-nav">
          <div className="section-title">Source Navigator</div>
          {captures.map((capture) => (
            <button key={capture.id} className={current?.id === capture.id ? "source-nav-row active" : "source-nav-row"} onClick={() => setActiveCapture(capture)}>
              <strong>{capture.title}</strong>
              <span>{sourceLabel(capture.sourceKind)} · {captureStatusLabels[capture.status]}</span>
            </button>
          ))}
        </aside>

        <main className="study-main">
          {current ? (
            <>
              <section className="panel">
                <p className="eyebrow">Original Source</p>
                <h2>{current.title}</h2>
                <ScreenshotPreviewBlock capture={current} onConfirmText={confirmScreenshotText} />
                <div className="source-preview tall">
                  {current.fragments.map((fragment) => (
                    <p key={fragment.id}>{fragment.text}</p>
                  ))}
                </div>
              </section>
              <section className="panel">
                <div className="section-title">AI Summary</div>
                <p>{current.summary || topic.summary}</p>
                <h3>Plain explanation</h3>
                <p>{current.summary || "TinyBu will explain this source after capture understanding finishes."}</p>
                <h3>Key ideas</h3>
                <div className="mini-list">
                  {(current.questions ?? []).slice(0, 5).map((question) => (
                    <span key={question}>{question}</span>
                  ))}
                </div>
              </section>
              <ScreenshotQuestionPanel
                capture={current}
                questionInput={screenshotQuestionInput}
                setQuestionInput={setScreenshotQuestionInput}
                askAboutScreenshot={askAboutScreenshot}
                busy={screenshotQuestionBusy}
              />
            </>
          ) : (
            <EmptyState title="No source selected" body="This topic does not have sources yet." />
          )}
        </main>

        <aside className="expression-panel">
          <div className="section-title">Useful Expressions</div>
          {current && usefulExpressions.length ? (
            usefulExpressions.map((expression) => (
              <article className="expression-card" key={expression}>
                <h3>{expression}</h3>
                <p>{current.summary || "Useful expression from this source."}</p>
                <span>When to use: {topic.practiceGoal}</span>
                <button className="secondary" onClick={() => saveExpression(current, expression)}>
                  Save to Notebook
                </button>
              </article>
            ))
          ) : (
            <p>Useful expressions will appear from captured content or Practice Review.</p>
          )}
          {!!expressions.length && (
            <>
              <h3>Saved in this Topic</h3>
              <div className="mini-list">
                {expressions.slice(0, 4).map((expression) => (
                  <span key={expression.id}>{expression.pattern}</span>
                ))}
              </div>
            </>
          )}
          <button className="primary sticky-action" onClick={startPractice}>
            Start Practice
          </button>
        </aside>
      </div>
    </section>
  );
}
