import { AppHeader } from "../../components/AppHeader";
import { nowIso } from "../../lib/defaults";
import type { ExpressionRecord, MemoryItem, TopicItem } from "../../types";

type MemoryPageProps = {
  memories: MemoryItem[];
  topics: TopicItem[];
  expressions: ExpressionRecord[];
  updateMemoryItem: (item: MemoryItem) => void;
  deleteMemory: (id: string) => void;
};

export function MemoryPage({ memories, topics, expressions, updateMemoryItem, deleteMemory }: MemoryPageProps) {
  const interests = memories.filter((memory) => memory.type === "interest");
  const stuck = memories.filter((memory) => memory.type === "support" || memory.type === "anxiety");
  const next = memories.filter((memory) => memory.type === "next");
  const opinionExpressions = expressions.filter((expression) => /think|opinion|reason|compare|request/i.test(expression.pattern));

  return (
    <section className="page">
      <AppHeader title="Bu’s Memory" description="A warm learning profile that remembers interests, patterns, and next steps." />
      <section className="panel memory-summary">
        <div>
          <span>Topics you practice</span>
          <strong>{topics.slice(0, 3).map((topic) => topic.name).join(", ") || "Not enough data yet"}</strong>
        </div>
        <div>
          <span>Current interests</span>
          <strong>{interests[0]?.title || topics[0]?.name || "Fresh captures"}</strong>
        </div>
        <div>
          <span>Common stuck points</span>
          <strong>{stuck[0]?.title || "Giving longer reasons"}</strong>
        </div>
        <div>
          <span>Recent progress</span>
          <strong>{expressions.length} expressions saved</strong>
        </div>
      </section>
      <div className="memory-grid">
        <section className="panel">
          <div className="section-title">Topics You Care About</div>
          <div className="mini-list">
            {topics.slice(0, 8).map((topic) => (
              <span key={topic.id}>{topic.name}</span>
            ))}
          </div>
        </section>
        <section className="panel">
          <div className="section-title">Expressions You&apos;re Building</div>
          <div className="mini-list">
            {(opinionExpressions.length ? opinionExpressions : expressions).slice(0, 8).map((expression) => (
              <span key={expression.id}>{expression.pattern}</span>
            ))}
          </div>
        </section>
        <section className="panel">
          <div className="section-title">Bu&apos;s Suggestions</div>
          <div className="mini-list">
            {(next.length ? next : memories).slice(0, 6).map((memory) => (
              <span key={memory.id}>{memory.title}</span>
            ))}
            {!memories.length && (
              <>
                <span>Continue Topic: {topics[0]?.name || "First Topic"}</span>
                <span>Review expressions from yesterday</span>
                <span>Practice giving longer reasons</span>
              </>
            )}
          </div>
        </section>
      </div>
      {!!memories.length && (
        <section className="panel">
          <div className="section-title">Editable Memory Notes</div>
          <div className="memory-note-list">
            {memories.map((memory) => (
              <article className="memory-note" key={memory.id}>
                <input value={memory.title} onChange={(event) => updateMemoryItem({ ...memory, title: event.target.value, updatedAt: nowIso() })} />
                <textarea value={memory.body} onChange={(event) => updateMemoryItem({ ...memory, body: event.target.value, updatedAt: nowIso() })} />
                <button className="danger" onClick={() => deleteMemory(memory.id)}>
                  Delete
                </button>
              </article>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}
