import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, Mic, Search, Trash2 } from "lucide-react";
import { AppHeader } from "../../components/AppHeader";
import { EmptyState } from "../../components/EmptyState";
import { formatDate } from "../../lib/date";
import { expressionAlternatives, expressionNativeMeaning, expressionUsageHint } from "../../lib/expressionMeaning";
import type { ExpressionRecord } from "../../types";

type LibraryFilter = "all" | "correction" | "chunk" | "mastered";

function filterExpression(expression: ExpressionRecord, filter: LibraryFilter) {
  if (filter === "correction") return expression.category === "need-practice" || !!expression.original;
  if (filter === "chunk") return expression.category === "pattern" || expression.pattern.split(/\s+/).length > 3;
  if (filter === "mastered") return expression.learned;
  return true;
}

function masteryLabel(expression: ExpressionRecord) {
  if (expression.learned) return "熟练运用";
  if (expression.practiceCount > 0 || expression.userSentence.trim()) return "基本掌握";
  return "未掌握";
}

export function NotebookPage({ expressions, updateExpression, deleteExpression, startTraining }: {
  expressions: ExpressionRecord[];
  updateExpression: (record: ExpressionRecord) => void;
  deleteExpression: (id: string) => void;
  startTraining: () => void;
}) {
  const [filter, setFilter] = useState<LibraryFilter>("all");
  const [selectedId, setSelectedId] = useState(expressions[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const visible = useMemo(() => expressions.filter((expression) => filterExpression(expression, filter)), [expressions, filter]);
  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return visible;
    return visible.filter((expression) =>
      [expression.pattern, expression.meaning, expression.scene, expression.original]
        .join(" ")
        .toLowerCase()
        .includes(value)
    );
  }, [query, visible]);
  const selected = expressions.find((expression) => expression.id === selectedId) ?? filtered[0];
  const dueCount = expressions.filter((expression) => !expression.learned || expression.useLater).length;

  useEffect(() => {
    if (!selectedId && expressions[0]) setSelectedId(expressions[0].id);
    if (selectedId && !expressions.some((expression) => expression.id === selectedId)) {
      setSelectedId(expressions[0]?.id ?? "");
    }
  }, [expressions, selectedId]);

  return (
    <section className="page expression-library-page expression-library-redesign">
      <AppHeader title="表达库" description="把复盘里的优化句变成下次能直接开口的表达。" />

      <section className="expression-library-hero">
        <div>
          <span>Today practice</span>
          <h2>{dueCount || expressions.length} 个表达可以练</h2>
          <p>先在这里整理和查看，开始后会进入全屏的一题一题训练。</p>
        </div>
        <button className="primary expression-start-button" onClick={startTraining} disabled={!expressions.length}>
          <Mic size={18} />
          开始训练
          <ArrowRight size={18} />
        </button>
      </section>

      <div className="expression-library-toolbar">
        <div className="expression-filter-tabs">
          {[
            ["all", "全部"],
            ["correction", "易错修正"],
            ["chunk", "地道语块"],
            ["mastered", "已掌握"]
          ].map(([value, label]) => (
            <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value as LibraryFilter)}>
              {label}
            </button>
          ))}
        </div>
        <label className="expression-search">
          <Search size={17} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索表达或主题" />
        </label>
      </div>

      <div className="expression-library-grid">
        <main className="expression-library-collection">
          {filtered.length ? (
            filtered.map((expression) => (
              <button
                key={expression.id}
                className={selected?.id === expression.id ? "expression-library-card active" : "expression-library-card"}
                onClick={() => setSelectedId(expression.id)}
              >
                <div className="expression-card-main">
                  <strong>{expression.pattern}</strong>
                  <span>{expressionNativeMeaning(expression)}</span>
                </div>
                <div className="expression-card-meta">
                  <em>{expression.category === "need-practice" ? "优化句" : "语块"}</em>
                  <em>{expression.scene}</em>
                  <em>{masteryLabel(expression)}</em>
                </div>
              </button>
            ))
          ) : (
            <EmptyState title="表达库是空的" body="完成一次 call 后，复盘里的优化句会进入这里。" />
          )}
        </main>

        <aside className="expression-preview-panel">
          {selected ? (
            <>
              <div className="expression-preview-head">
                <span>{selected.scene}</span>
                <h2>{selected.pattern}</h2>
                <p>{expressionNativeMeaning(selected)}</p>
              </div>

              {selected.original && (
                <div className="expression-original-card">
                  <span>原句</span>
                  <p>{selected.original}</p>
                </div>
              )}

              <div className="expression-original-card expression-usage-card">
                <span>什么时候用</span>
                <p>{expressionUsageHint(selected)}</p>
              </div>

              {expressionAlternatives(selected.pattern).length > 0 && (
                <div className="expression-original-card expression-alternative-card">
                  <span>可以替换成</span>
                  <div className="expression-alternative-list">
                    {expressionAlternatives(selected.pattern).map((alternative) => (
                      <em key={alternative}>{alternative}</em>
                    ))}
                  </div>
                </div>
              )}

              <div className="expression-preview-stats">
                <div>
                  <span>掌握程度</span>
                  <strong>{masteryLabel(selected)}</strong>
                </div>
                <div>
                  <span>保存时间</span>
                  <strong>{formatDate(selected.capturedAt)}</strong>
                </div>
                <div>
                  <span>训练次数</span>
                  <strong>{selected.practiceCount}</strong>
                </div>
              </div>

              <div className="expression-preview-actions">
                <button className="secondary" onClick={() => updateExpression({ ...selected, useLater: !selected.useLater })}>
                  <CheckCircle2 size={16} />
                  {selected.useLater ? "移出待练" : "加入待练"}
                </button>
                <button className="danger quiet-danger" onClick={() => deleteExpression(selected.id)}>
                  <Trash2 size={16} />
                  删除
                </button>
              </div>
            </>
          ) : (
            <EmptyState title="选择一个表达" body="这里会显示含义、原句和掌握状态；训练会在全屏模式里完成。" />
          )}
        </aside>
      </div>
    </section>
  );
}
