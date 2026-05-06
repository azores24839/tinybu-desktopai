import { useEffect, useState } from "react";
import { ChevronLeft, Save } from "lucide-react";
import { AppHeader } from "../../components/AppHeader";
import { formatDate } from "../../lib/date";
import { nowIso } from "../../lib/defaults";
import type { CaptureItem, ExpressionRecord, TopicItem } from "../../types";
import { sourceLabel } from "../captures/captureUtils";

type TopicDetailPageProps = {
  topic: TopicItem;
  captures: CaptureItem[];
  expressions: ExpressionRecord[];
  updateTopic: (topic: TopicItem) => void;
  openStudyRoom: () => void;
  startPractice: () => void;
  back: () => void;
};

export function TopicDetailPage({
  topic,
  captures,
  expressions,
  updateTopic,
  openStudyRoom,
  startPractice,
  back
}: TopicDetailPageProps) {
  const [name, setName] = useState(topic.name);
  const [summary, setSummary] = useState(topic.summary);

  useEffect(() => {
    setName(topic.name);
    setSummary(topic.summary);
  }, [topic.id, topic.name, topic.summary]);

  return (
    <section className="page">
      <AppHeader title={topic.name} description="Topic Detail">
        <button className="secondary" onClick={back}>
          <ChevronLeft size={18} /> Back to Topics
        </button>
        <button className="secondary" onClick={() => updateTopic({ ...topic, name, summary, updatedAt: nowIso() })}>
          <Save size={18} /> Save
        </button>
        <button className="primary" onClick={openStudyRoom}>
          Open Study Room
        </button>
      </AppHeader>

      <section className="panel topic-hero">
        <div className="form-grid">
          <label>
            Topic name
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            Topic description
            <input value={summary} onChange={(event) => setSummary(event.target.value)} />
          </label>
        </div>
        <div className="meta-row">
          {topic.tags.map((tag) => (
            <span className="tag" key={tag}>{tag}</span>
          ))}
          <span>{captures.length} sources</span>
          <span>{expressions.length} saved expressions</span>
          <span>{topic.lastPracticedAt ? `Last practiced ${formatDate(topic.lastPracticedAt)}` : "Not practiced yet"}</span>
        </div>
      </section>

      <div className="two-column">
        <section className="panel">
          <div className="section-title">Sources</div>
          {captures.map((capture) => (
            <label className="source-row" key={capture.id}>
              <input type="checkbox" defaultChecked />
              <div>
                <strong>{capture.title}</strong>
                <span>{sourceLabel(capture.sourceKind)} · {capture.summary}</span>
              </div>
            </label>
          ))}
        </section>
        <section className="panel">
          <div className="section-title">Learning Overview</div>
          <h3>Key ideas</h3>
          <div className="mini-list">
            {captures.flatMap((capture) => capture.questions ?? []).slice(0, 4).map((question) => (
              <span key={question}>{question}</span>
            ))}
          </div>
          <h3>Recommended expressions</h3>
          <div className="mini-list">
            {captures.flatMap((capture) => capture.suggestedExpressions ?? []).slice(0, 5).map((expression) => (
              <span key={expression}>{expression}</span>
            ))}
          </div>
          <h3>Practice goals</h3>
          <p>{topic.practiceGoal}</p>
          <div className="button-row">
            <button className="primary" onClick={openStudyRoom}>
              Open Study Room
            </button>
            <button className="secondary" onClick={startPractice}>
              Start Practice
            </button>
          </div>
        </section>
      </div>
    </section>
  );
}
