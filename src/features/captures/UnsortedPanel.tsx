import { useState, useMemo } from "react";
import { CheckSquare, Plus, Square, Trash2 } from "lucide-react";
import type { CaptureItem, TopicItem } from "../../types";
import { formatDate } from "../../lib/date";
import { sourceLabel } from "./captureUtils";

type UnsortedPanelProps = {
  captures: CaptureItem[];
  topics: TopicItem[];
  onDelete: (id: string) => void;
  onAddToTopic: (captureIds: string[], topic: TopicItem) => void;
  onCreateTopic: (captureIds: string[], name: string, practiceGoal?: string) => void;
};

export function UnsortedPanel({
  captures,
  topics,
  onDelete,
  onAddToTopic,
  onCreateTopic,
}: UnsortedPanelProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [hoveredId, setHoveredId] = useState("");
  const [drawerTopicId, setDrawerTopicId] = useState("");
  const [newTopicName, setNewTopicName] = useState("");

  const selectedCaptures = captures.filter((c) => selectedIds.has(c.id));
  const single = selectedCaptures.length === 1;
  const multi = selectedCaptures.length > 1;

  const sourceBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    selectedCaptures.forEach((c) => {
      const label = sourceLabel(c.sourceKind);
      counts[label] = (counts[label] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => `${count} ${label}`)
      .join(" / ");
  }, [selectedCaptures]);

  const commonTheme = useMemo(() => {
    const keywords = selectedCaptures.flatMap((c) => c.keywords || []);
    if (keywords.length) {
      const freq: Record<string, number> = {};
      keywords.forEach((k) => (freq[k] = (freq[k] || 0) + 1));
      const top = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
      return top ? top[0] : "";
    }
    return "";
  }, [selectedCaptures]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(captures.map((c) => c.id)));
  const deselectAll = () => setSelectedIds(new Set());

  const handleAddToTopic = (topic: TopicItem) => {
    if (!selectedCaptures.length) return;
    onAddToTopic(selectedCaptures.map((c) => c.id), topic);
    setSelectedIds(new Set());
    setDrawerTopicId("");
  };

  const handleCreateTopic = () => {
    if (!selectedCaptures.length || !newTopicName.trim()) return;
    onCreateTopic(selectedCaptures.map((c) => c.id), newTopicName.trim());
    setSelectedIds(new Set());
    setNewTopicName("");
  };

  if (!captures.length) {
    return (
      <div className="unsorted-empty">
        <div className="empty-state">
          <h2>No unsorted captures</h2>
          <p>Captures without a topic will appear here for manual organization.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="unsorted-layout">
      <aside className="unsorted-queue-column">
        <div className="unsorted-queue-toolbar">
          <button className="secondary" onClick={selectedIds.size ? deselectAll : selectAll}>
            {selectedIds.size ? <Square size={14} /> : <CheckSquare size={14} />}
            {selectedIds.size ? "Clear" : "Select All"}
          </button>
          <span className="unsorted-count">{selectedIds.size || captures.length} items</span>
        </div>

        <div className="unsorted-queue-list">
          {captures.map((capture) => {
            const isSelected = selectedIds.has(capture.id);
            const isHovered = hoveredId === capture.id;
            let cardClass = "unsorted-card";
            if (isSelected) cardClass += " selected";

            return (
              <div
                key={capture.id}
                className={cardClass}
                onMouseEnter={() => setHoveredId(capture.id)}
                onMouseLeave={() => setHoveredId("")}
              >
                <label className="unsorted-card-check">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(capture.id)}
                  />
                </label>
                <div className="unsorted-card-body" onClick={() => toggleSelect(capture.id)}>
                  <div className="unsorted-card-head">
                    <h3>{capture.title}</h3>
                    <button
                      className="unsorted-card-delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(capture.id);
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          next.delete(capture.id);
                          return next;
                        });
                      }}
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="unsorted-card-meta">
                    <span>{sourceLabel(capture.sourceKind)}</span>
                    <span className="unsorted-dot">&middot;</span>
                    <span>{formatDate(capture.capturedAt)}</span>
                  </div>
                  <p className="unsorted-card-preview">
                    {capture.summary || capture.sourceText?.slice(0, 120) || capture.fragments[0]?.text?.slice(0, 120) || "No preview available."}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </aside>

      <main className="unsorted-center">
        {selectedCaptures.length === 0 ? (
          <div className="unsorted-center-empty">
            <h2>Selected Preview</h2>
            <p>Select one or more captures to preview content.</p>
          </div>
        ) : single ? (
          <div className="unsorted-center-body">
            <div className="unsorted-center-heading">
              <h2>Content Preview</h2>
            </div>
            <div className="unsorted-preview-content">
              <h3>{selectedCaptures[0].title}</h3>
              <span className="unsorted-source-label">{sourceLabel(selectedCaptures[0].sourceKind)}</span>
              <pre className="unsorted-preview-text">
                {captureTextComputed(selectedCaptures[0])}
              </pre>
            </div>
          </div>
        ) : (
          <div className="unsorted-center-body">
            <div className="unsorted-center-heading">
              <h2>Batch Summary</h2>
            </div>
            <div className="unsorted-preview-content">
              <h3>Selected {selectedCaptures.length} items</h3>
              <p className="unsorted-batch-meta">Source distribution: {sourceBreakdown}</p>
              {commonTheme && (
                <p className="unsorted-batch-theme">
                  <strong>Common theme:</strong> {commonTheme}
                </p>
              )}
              {selectedCaptures.slice(0, 3).map((capture) => (
                <div key={capture.id} className="unsorted-batch-preview">
                  <h4>{capture.title}</h4>
                  <pre className="unsorted-preview-text">
                    {capture.sourceText?.slice(0, 300) || capture.fragments[0]?.text?.slice(0, 300) || ""}
                  </pre>
                </div>
              ))}
              {selectedCaptures.length > 3 && (
                <p className="unsorted-batch-more">...and {selectedCaptures.length - 3} more</p>
              )}
            </div>
          </div>
        )}
      </main>

      <aside className="unsorted-topic-panel">
        <div className="unsorted-topic-header">
          <h2>Move to Topic</h2>
        </div>

        <div className="unsorted-topic-list">
          {topics.length ? (
            topics.map((topic) => (
              <label
                key={topic.id}
                className={drawerTopicId === topic.id ? "unsorted-topic-row selected" : "unsorted-topic-row"}
                onClick={() => { setDrawerTopicId(topic.id); setNewTopicName(""); }}
              >
                <input
                  type="radio"
                  name="unsorted-topic"
                  checked={drawerTopicId === topic.id}
                  onChange={() => { setDrawerTopicId(topic.id); setNewTopicName(""); }}
                />
                <div>
                  <strong>{topic.name}</strong>
                  <span>{topic.captureIds.length} captures</span>
                </div>
              </label>
            ))
          ) : (
            <p className="unsorted-topic-empty">No topics yet. Create one below.</p>
          )}
        </div>

        <div className="unsorted-topic-new">
          <div className="unsorted-topic-new-header">
            <Plus size={16} />
            <span>Create new topic</span>
          </div>
          <input
            value={newTopicName}
            onChange={(e) => { setNewTopicName(e.target.value); setDrawerTopicId(""); }}
            placeholder="Topic name..."
          />
        </div>

        <div className="unsorted-topic-footer">
          <button
            className="primary"
            disabled={(!drawerTopicId && !newTopicName.trim()) || !selectedCaptures.length}
            onClick={() => {
              if (drawerTopicId) {
                const topic = topics.find((t) => t.id === drawerTopicId);
                if (topic) handleAddToTopic(topic);
              } else if (newTopicName.trim()) {
                handleCreateTopic();
              }
            }}
          >
            Confirm
          </button>
        </div>
      </aside>
    </div>
  );
}

function captureTextComputed(capture: CaptureItem): string {
  return capture.sourceText || capture.fragments.map((f) => f.text).join("\n");
}
