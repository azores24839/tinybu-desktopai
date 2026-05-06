import { useEffect, useState } from "react";
import { AppHeader } from "../../components/AppHeader";
import { EmptyState } from "../../components/EmptyState";
import { formatDate } from "../../lib/date";
import type { ExpressionRecord } from "../../types";

type NotebookPageProps = {
  expressions: ExpressionRecord[];
  updateExpression: (record: ExpressionRecord) => void;
  deleteExpression: (id: string) => void;
};

export function NotebookPage({ expressions, updateExpression, deleteExpression }: NotebookPageProps) {
  const [filter, setFilter] = useState<"all" | "topic" | "recent" | "review">("all");
  const [selectedId, setSelectedId] = useState(expressions[0]?.id ?? "");
  const visible = expressions.filter((expression) => {
    if (filter === "recent") return expression.saved;
    if (filter === "review") return expression.useLater || expression.category === "need-practice";
    return true;
  });
  const selected = expressions.find((expression) => expression.id === selectedId) ?? visible[0];

  useEffect(() => {
    if (!selectedId && expressions[0]) setSelectedId(expressions[0].id);
  }, [expressions, selectedId]);

  return (
    <section className="page">
      <AppHeader title="Notebook" description="Saved expressions worth taking with you." />
      <div className="notebook-layout">
        <aside className="filter-panel">
          {[
            ["all", "All Expressions"],
            ["topic", "By Topic"],
            ["recent", "Recently Saved"],
            ["review", "Review Later"]
          ].map(([value, label]) => (
            <button key={value} className={filter === value ? "filter active" : "filter"} onClick={() => setFilter(value as typeof filter)}>
              {label}
            </button>
          ))}
        </aside>
        <main className="expression-list">
          {visible.length ? (
            visible.map((expression) => (
              <button
                key={expression.id}
                className={selected?.id === expression.id ? "expression-row active" : "expression-row"}
                onClick={() => setSelectedId(expression.id)}
              >
                <strong>{expression.pattern}</strong>
                <span>{expression.meaning}</span>
                <div className="meta-row">
                  <span>{expression.sourceTitle}</span>
                  <span>{formatDate(expression.capturedAt)}</span>
                  <span>{expression.learned ? "Learned" : expression.useLater ? "Review Later" : "Saved"}</span>
                </div>
              </button>
            ))
          ) : (
            <EmptyState title="Notebook is empty" body="Save expressions from Study Room or Practice Review." />
          )}
        </main>
        <aside className="detail-panel">
          {selected ? (
            <>
              <p className="eyebrow">Expression Detail</p>
              <h2>{selected.pattern}</h2>
              <p>{selected.meaning}</p>
              <div className="detail-stack">
                <div>
                  <span>When to use</span>
                  <strong>{selected.scene}</strong>
                </div>
                <div>
                  <span>Example sentence</span>
                  <strong>{selected.original}</strong>
                </div>
                <div>
                  <span>Source</span>
                  <strong>{selected.sourceTitle}</strong>
                </div>
                <label>
                  User&apos;s own version
                  <textarea value={selected.userSentence} onChange={(event) => updateExpression({ ...selected, userSentence: event.target.value })} />
                </label>
              </div>
              <div className="stack-actions">
                <button className="secondary" onClick={() => updateExpression({ ...selected, useLater: !selected.useLater })}>
                  Mark review
                </button>
                <button className="secondary" onClick={() => updateExpression({ ...selected, learned: true })}>
                  Mark learned
                </button>
                <button className="danger" onClick={() => deleteExpression(selected.id)}>
                  Delete
                </button>
              </div>
            </>
          ) : (
            <EmptyState title="Select an expression" body="Expression details and editing controls appear here." />
          )}
        </aside>
      </div>
    </section>
  );
}
