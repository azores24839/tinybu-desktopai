import { useState } from "react";
import { Archive, Search, Trash2 } from "lucide-react";
import { AppHeader } from "../../components/AppHeader";
import { EmptyState } from "../../components/EmptyState";
import { formatDate } from "../../lib/date";
import type { CaptureItem, CaptureStatus, ExternalCaptureKind, TopicItem } from "../../types";
import { ScreenshotPreviewBlock } from "../screenshots/ScreenshotPreviewBlock";
import { captureStatusLabels, captureText, sourceLabel } from "./captureUtils";

type InboxPageProps = {
  captures: CaptureItem[];
  topics: TopicItem[];
  activeCapture?: CaptureItem;
  openCapture: (capture: CaptureItem) => void;
  updateCapture: (capture: CaptureItem) => void;
  confirmScreenshotText: (capture: CaptureItem) => void;
  archiveCapture: (capture: CaptureItem) => void;
  deleteCapture: (id: string) => void;
  createTopicFromCaptures: (captureIds: string[], name?: string) => void;
  addCapturesToTopic: (captureIds: string[], topic: TopicItem) => void;
  organize: () => void;
};

export function InboxPage({
  captures,
  topics,
  activeCapture,
  openCapture,
  updateCapture,
  confirmScreenshotText,
  archiveCapture,
  deleteCapture,
  createTopicFromCaptures,
  addCapturesToTopic,
  organize
}: InboxPageProps) {
  const [status, setStatus] = useState<"all" | CaptureStatus>("all");
  const [source, setSource] = useState<"all" | ExternalCaptureKind>("all");
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const visible = captures.filter((capture) => {
    if (status !== "all" && capture.status !== status) return false;
    if (source !== "all" && capture.sourceKind !== source) return false;
    const haystack = `${capture.title} ${capture.summary} ${captureText(capture)}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  });
  const selectedCapture = activeCapture && visible.some((capture) => capture.id === activeCapture.id) ? activeCapture : visible[0];

  const toggleSelected = (id: string) => {
    setSelectedIds((items) => (items.includes(id) ? items.filter((item) => item !== id) : [...items, id]));
  };

  return (
    <section className="page">
      <AppHeader title="Inbox" description="Review, filter, and prepare raw captures before organizing them into topics.">
        <button className="secondary" onClick={organize}>
          Organize with Bu
        </button>
        <button className="primary" onClick={() => createTopicFromCaptures(selectedIds.length ? selectedIds : selectedCapture ? [selectedCapture.id] : [])}>
          New Topic
        </button>
      </AppHeader>

      <div className="inbox-layout">
        <aside className="filter-panel">
          <label className="search-box">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search captures" />
          </label>
          <div>
            <h3>Status</h3>
            {(["all", "unsorted", "suggested", "in-topic", "archived"] as const).map((item) => (
              <button key={item} className={status === item ? "filter active" : "filter"} onClick={() => setStatus(item)}>
                {item === "all" ? "All" : captureStatusLabels[item]}
              </button>
            ))}
          </div>
          <div>
            <h3>Source</h3>
            {(["all", "selection", "article", "youtube", "screenshot", "manual"] as const).map((item) => (
              <button key={item} className={source === item ? "filter active" : "filter"} onClick={() => setSource(item)}>
                {item === "all" ? "All" : sourceLabel(item)}
              </button>
            ))}
          </div>
        </aside>

        <main className="capture-column">
          {visible.length ? (
            visible.map((capture) => (
              <article
                key={capture.id}
                className={selectedCapture?.id === capture.id ? "capture-card active" : "capture-card"}
                onClick={() => openCapture(capture)}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(capture.id)}
                  onChange={(event) => {
                    event.stopPropagation();
                    toggleSelected(capture.id);
                  }}
                  onClick={(event) => event.stopPropagation()}
                />
                <div>
                  <h3>{capture.title}</h3>
                  <p>{capture.summary || capture.fragments[0]?.text}</p>
                  <div className="meta-row">
                    <span>{sourceLabel(capture.sourceKind)}</span>
                    <span>{formatDate(capture.capturedAt)}</span>
                    <span className="status-pill">{captureStatusLabels[capture.status]}</span>
                  </div>
                </div>
                <div className="quick-actions">
                  <button onClick={(event) => { event.stopPropagation(); archiveCapture(capture); }} title="Archive">
                    <Archive size={16} />
                  </button>
                  <button onClick={(event) => { event.stopPropagation(); deleteCapture(capture.id); }} title="Delete">
                    <Trash2 size={16} />
                  </button>
                </div>
              </article>
            ))
          ) : (
            <EmptyState title="Inbox is empty" body="New browser captures, screenshots, or pasted text will arrive here." />
          )}
        </main>

        <aside className="detail-panel">
          {selectedCapture ? (
            <>
              <div>
                <p className="eyebrow">{sourceLabel(selectedCapture.sourceKind)}</p>
                <h2>{selectedCapture.title}</h2>
                <p>{selectedCapture.summary || "No AI summary yet."}</p>
              </div>
              <ScreenshotPreviewBlock capture={selectedCapture} onConfirmText={confirmScreenshotText} />
              <div className="source-preview">
                {selectedCapture.fragments.slice(0, 8).map((fragment) => (
                  <p key={fragment.id}>{fragment.text}</p>
                ))}
              </div>
              <div>
                <h3>Suggested Topic</h3>
                <span className="topic-suggestion">{selectedCapture.topic || "Fresh Captures"}</span>
              </div>
              <div className="stack-actions">
                <button className="primary" onClick={() => createTopicFromCaptures([selectedCapture.id], selectedCapture.topic)}>
                  Add to Topic
                </button>
                <button className="secondary" onClick={() => createTopicFromCaptures([selectedCapture.id])}>
                  Create New Topic
                </button>
                {!!topics.length && (
                  <button className="secondary" onClick={() => addCapturesToTopic([selectedCapture.id], topics[0])}>
                    Move to {topics[0].name}
                  </button>
                )}
                <button className="secondary" onClick={organize}>
                  Organize
                </button>
                <button className="danger" onClick={() => archiveCapture(selectedCapture)}>
                  Archive
                </button>
              </div>
              <label>
                Capture status
                <select
                  value={selectedCapture.status}
                  onChange={(event) => updateCapture({ ...selectedCapture, status: event.target.value as CaptureStatus })}
                >
                  {Object.entries(captureStatusLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : (
            <EmptyState title="No capture selected" body="Choose a capture to preview source text and quick actions." />
          )}
        </aside>
      </div>
    </section>
  );
}
