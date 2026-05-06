import { useEffect, useState } from "react";
import { AppHeader } from "../../components/AppHeader";
import { EmptyState } from "../../components/EmptyState";
import { formatDate } from "../../lib/date";
import type { CaptureItem, ExpressionRecord, Screen, TopicItem } from "../../types";
import { topicCaptures, topicExpressions, topicStatusLabels } from "./topicUtils";

type TopicsPageProps = {
  topics: TopicItem[];
  captures: CaptureItem[];
  expressions: ExpressionRecord[];
  openTopic: (topic: TopicItem, next?: Screen) => void;
  startPractice: (topic: TopicItem) => void;
};

export function TopicsPage({ topics, captures, expressions, openTopic, startPractice }: TopicsPageProps) {
  const [selectedTopicId, setSelectedTopicId] = useState(topics[0]?.id ?? "");
  const selectedTopic = topics.find((topic) => topic.id === selectedTopicId) ?? topics[0];
  const sources = topicCaptures(selectedTopic, captures);
  const savedExpressions = topicExpressions(selectedTopic, expressions);

  useEffect(() => {
    if (!selectedTopicId && topics[0]) setSelectedTopicId(topics[0].id);
  }, [selectedTopicId, topics]);

  return (
    <section className="page">
      <AppHeader title="Topics" description="Choose a topic, inspect sources, then study or practice." />
      <div className="topics-layout">
        <main className="topic-list">
          {topics.length ? (
            topics.map((topic) => (
              <button
                key={topic.id}
                className={selectedTopic?.id === topic.id ? "topic-list-card active" : "topic-list-card"}
                onClick={() => setSelectedTopicId(topic.id)}
              >
                <div>
                  <h3>{topic.name}</h3>
                  <p>{topic.summary}</p>
                </div>
                <div className="meta-row">
                  <span>{topic.captureIds.length} sources</span>
                  <span>{topic.savedExpressionCount} saved</span>
                  <span>{formatDate(topic.updatedAt)}</span>
                  <span className="status-pill">{topicStatusLabels[topic.status]}</span>
                </div>
              </button>
            ))
          ) : (
            <EmptyState title="No topics yet" body="Open Inbox and use Organize with Bu to create your first topic." />
          )}
        </main>
        <aside className="topic-detail-panel">
          {selectedTopic ? (
            <>
              <p className="eyebrow">Topic Detail</p>
              <h2>{selectedTopic.name}</h2>
              <p>{selectedTopic.summary}</p>
              <div className="stats-grid two">
                <div>
                  <span>Sources</span>
                  <strong>{sources.length}</strong>
                </div>
                <div>
                  <span>Useful Expressions</span>
                  <strong>{savedExpressions.length}</strong>
                </div>
              </div>
              <div>
                <h3>Sources Preview</h3>
                <div className="mini-list">
                  {sources.slice(0, 5).map((capture) => (
                    <span key={capture.id}>{capture.title}</span>
                  ))}
                </div>
              </div>
              <div>
                <h3>Recent Practice</h3>
                <p>{selectedTopic.lastPracticedAt ? formatDate(selectedTopic.lastPracticedAt) : "No practice yet."}</p>
              </div>
              <div className="stack-actions">
                <button className="primary" onClick={() => openTopic(selectedTopic, "study-room")}>
                  Open Study Room
                </button>
                <button className="secondary" onClick={() => startPractice(selectedTopic)}>
                  Start Practice
                </button>
                <button className="secondary" onClick={() => openTopic(selectedTopic)}>
                  Edit Topic
                </button>
              </div>
            </>
          ) : (
            <EmptyState title="Select a topic" body="Topic details will show sources, overview, and practice actions." />
          )}
        </aside>
      </div>
    </section>
  );
}
