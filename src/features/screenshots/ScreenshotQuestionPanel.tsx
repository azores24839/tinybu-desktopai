import type { FormEvent } from "react";
import type { CaptureItem } from "../../types";

type ScreenshotQuestionPanelProps = {
  capture: CaptureItem;
  questionInput: string;
  setQuestionInput: (value: string) => void;
  askAboutScreenshot: (capture: CaptureItem, question: string) => void;
  busy: boolean;
};

export function ScreenshotQuestionPanel({
  capture,
  questionInput,
  setQuestionInput,
  askAboutScreenshot,
  busy
}: ScreenshotQuestionPanelProps) {
  if (!capture.screenshot) return null;

  function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    askAboutScreenshot(capture, questionInput);
  }

  return (
    <section className="panel">
      <div className="section-title">Ask this screenshot</div>
      <form className="inline-form" onSubmit={submitQuestion}>
        <input
          value={questionInput}
          onChange={(event) => setQuestionInput(event.target.value)}
          placeholder="Ask about this screenshot..."
          disabled={busy}
        />
        <button className="primary" disabled={!questionInput.trim() || busy}>
          Ask
        </button>
      </form>
      <div className="mini-list">
        {(capture.screenshot.questionAnswers ?? []).map((item) => (
          <span key={item.id}>{item.answer}</span>
        ))}
      </div>
    </section>
  );
}
