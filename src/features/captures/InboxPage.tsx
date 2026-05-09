import { useMemo, useState } from "react";
import { Archive, ChevronRight, MoreVertical, RotateCw, Search, Trash2 } from "lucide-react";
import { AppHeader } from "../../components/AppHeader";
import { EmptyState } from "../../components/EmptyState";
import { formatDate } from "../../lib/date";
import type { CaptureItem, CaptureStatus, TopicItem } from "../../types";
import { ScreenshotPreviewBlock } from "../screenshots/ScreenshotPreviewBlock";
import { captureStatusLabels, captureText, inferPracticeGoal, sourceLabel } from "./captureUtils";

type InboxPageProps = {
  captures: CaptureItem[];
  topics: TopicItem[];
  activeCapture?: CaptureItem;
  openCapture: (capture: CaptureItem) => void;
  updateCapture: (capture: CaptureItem) => void;
  confirmScreenshotText: (capture: CaptureItem) => void;
  archiveCapture: (capture: CaptureItem) => void;
  deleteCapture: (id: string) => void;
  createTopicFromCaptures: (captureIds: string[], name?: string, practiceGoal?: string) => void;
  addCapturesToTopic: (captureIds: string[], topic: TopicItem) => void;
  saveExpressionFromCapture: (capture: CaptureItem, expression: string) => void;
};

type InboxQueue = "suggested" | "needs-review" | "ready" | "archived";

type LearningGroup = {
  id: string;
  name: string;
  captures: CaptureItem[];
  summary: string;
  practiceGoal: string;
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
  saveExpressionFromCapture
}: InboxPageProps) {
  const [queue, setQueue] = useState<InboxQueue>("suggested");
  const [query, setQuery] = useState("");
  const [reviewGroupId, setReviewGroupId] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [targetTopicId, setTargetTopicId] = useState("");
  const [topicNameDraft, setTopicNameDraft] = useState("");
  const [learningFocusDraft, setLearningFocusDraft] = useState("");

  const suggestedCaptures = captures.filter((capture) => !capture.topicId && capture.status === "suggested");
  const needsReview = captures.filter((capture) => !capture.topicId && capture.status === "unsorted");
  const ready = captures.filter((capture) => capture.topicId && capture.status !== "archived");
  const archived = captures.filter((capture) => capture.status === "archived");
  const learningGroups = useMemo(() => buildLearningGroups(suggestedCaptures), [suggestedCaptures]);
  const activeGroup = learningGroups.find((group) => group.id === reviewGroupId);
  const selectedTopic = topics.find((topic) => topic.id === targetTopicId) ?? topics[0];
  const queueCaptures: Record<InboxQueue, CaptureItem[]> = {
    suggested: suggestedCaptures,
    "needs-review": needsReview,
    ready,
    archived
  };
  const visibleCaptures = queueCaptures[queue].filter((capture) => matchesQuery(capture, query));
  const filteredGroups = learningGroups
    .map((group) => ({
      ...group,
      captures: group.captures.filter((capture) => matchesQuery(capture, query))
    }))
    .filter((group) => group.captures.length);
  const visibleGroups = activeGroup ? [activeGroup] : filteredGroups;
  const activeGroupCaptures = activeGroup?.captures.filter((capture) => matchesQuery(capture, query)) ?? [];
  const allActiveCapturesSelected =
    !!activeGroupCaptures.length && activeGroupCaptures.every((capture) => selectedIds.includes(capture.id));
  const selectedCapture =
    activeCapture && visibleCaptures.some((capture) => capture.id === activeCapture.id)
      ? activeCapture
      : visibleCaptures[0];
  const firstExpression =
    selectedCapture?.suggestedExpressions?.[0] ??
    selectedCapture?.fragments.find((fragment) => fragment.recommended || fragment.selected)?.text ??
    selectedCapture?.fragments[0]?.text ??
    "";

  const queues: { id: InboxQueue; label: string; count: number }[] = [
    { id: "suggested", label: "Suggested Groups", count: learningGroups.length },
    { id: "needs-review", label: "Needs Review", count: needsReview.length },
    { id: "ready", label: "In Topics", count: ready.length }
  ];

  const startGroupReview = (group: LearningGroup) => {
    setReviewGroupId(group.id);
    setSelectedIds(group.captures.map((capture) => capture.id));
    setTopicNameDraft(group.name);
    setLearningFocusDraft(group.practiceGoal);
  };

  const leaveGroupReview = () => {
    setReviewGroupId("");
    setSelectedIds([]);
    setTopicNameDraft("");
    setLearningFocusDraft("");
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((items) => (items.includes(id) ? items.filter((item) => item !== id) : [...items, id]));
  };

  const toggleAllActiveCaptures = () => {
    if (!activeGroup) return;
    setSelectedIds(allActiveCapturesSelected ? [] : activeGroup.captures.map((capture) => capture.id));
  };

  return (
    <section className="page inbox-page">
      <AppHeader title="Inbox" />

      <div className="inbox-control-row">
        <div className="inbox-tabbar">
          {queues.map((item) => (
            <button
              key={item.id}
              className={queue === item.id ? "inbox-tab active" : "inbox-tab"}
              onClick={() => {
                setQueue(item.id);
                setReviewGroupId("");
                setSelectedIds([]);
              }}
            >
              {item.label}
              <strong>{item.count}</strong>
            </button>
          ))}
          <button
            className={queue === "archived" ? "inbox-tab archive-icon-tab active" : "inbox-tab archive-icon-tab"}
            onClick={() => {
              setQueue("archived");
              setReviewGroupId("");
              setSelectedIds([]);
            }}
            title="Archived"
          >
            <Archive size={17} />
          </button>
        </div>
        <label className="search-box inbox-header-search">
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search captures" />
        </label>
      </div>

      <div className={queue === "suggested" ? `inbox-folder-layout${activeGroup ? " has-captures" : ""}` : "inbox-layout"}>
        <main className="capture-column">
          {queue === "suggested" && (
            <section className="capture-section">
              <div className="inbox-intro">
                <h2>Folders</h2>
                <span>{activeGroup ? 1 : filteredGroups.length}</span>
              </div>
              {filteredGroups.length ? (
                <>
                  <div className={activeGroup ? "folder-grid single" : "folder-grid"}>
                    {visibleGroups.map((group, index) => (
                      <article
                        key={group.id}
                        className={`learning-folder-card tone-${index % 3}${activeGroup?.id === group.id ? " active" : ""}`}
                        onClick={() => startGroupReview(group)}
                      >
                        <svg className="folder-shape" viewBox="0 0 250 200" preserveAspectRatio="none" aria-hidden="true">
                          <path d="M20 0H94C109 0 118 6 128 18C139 31 151 33 172 33H224C238 33 250 45 250 59V174C250 188 238 200 224 200H16C7 200 0 193 0 184V20C0 9 9 0 20 0Z" />
                        </svg>
                        <button className="folder-menu" title="More" onClick={(event) => event.stopPropagation()}>
                          <MoreVertical size={18} />
                        </button>
                        <div className="folder-card-body">
                          <h3>{group.name}</h3>
                          <div className="folder-tags">
                            <span>{inferGroupTag(group)}</span>
                            <span>{group.practiceGoal}</span>
                          </div>
                          <div className="folder-footer">
                            <span className="folder-dots">
                              {group.captures.slice(0, 3).map((capture) => (
                                <i key={capture.id}>{capture.title.slice(0, 1).toUpperCase()}</i>
                              ))}
                            </span>
                            <strong>{group.captures.length} items</strong>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                  {activeGroup && (
                    <div className="folder-setup">
                      <div>
                        <h3>Topic description</h3>
                        <p>Keep the captures that belong together, then create one topic for the whole group.</p>
                      </div>
                      <div className="topic-field-row">
                        <label>
                          Topic name
                          <input value={topicNameDraft} onChange={(event) => setTopicNameDraft(event.target.value)} />
                        </label>
                        <label>
                          Learning Focus
                          <input value={learningFocusDraft} onChange={(event) => setLearningFocusDraft(event.target.value)} />
                        </label>
                      </div>
                      <div className="setup-actions">
                        <button className="primary" onClick={() => createTopicFromCaptures(selectedIds, topicNameDraft || activeGroup.name, learningFocusDraft || activeGroup.practiceGoal)}>
                          Create Topic
                        </button>
                        <button className="secondary" onClick={() => setSelectedIds(activeGroup.captures.map((capture) => capture.id))}>
                          Select All
                        </button>
                        <button className="secondary" onClick={() => setSelectedIds([])}>
                          Clear Selection
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <EmptyState title="No suggested folders" body="New captures with clear themes will appear here." />
              )}
            </section>
          )}

          {queue !== "suggested" && (
            <section className="capture-section">
              <div className="section-title">{queues.find((item) => item.id === queue)?.label ?? "Archived"} ({visibleCaptures.length})</div>
              {visibleCaptures.length ? (
                visibleCaptures.map((capture) => (
                  <CaptureRow
                    key={capture.id}
                    capture={capture}
                    active={selectedCapture?.id === capture.id}
                    openCapture={openCapture}
                    archiveCapture={archiveCapture}
                    deleteCapture={deleteCapture}
                  />
                ))
              ) : (
                <EmptyState title="Nothing here" body="Captured material that needs this queue will appear here." />
              )}
            </section>
          )}
        </main>

        {activeGroup && queue === "suggested" && (
          <aside key={activeGroup.id} className="folder-drawer">
            <div className="folder-drawer-title">
              <button
                className="drawer-collapse-button"
                onClick={leaveGroupReview}
                title="Back to folders"
              >
                <ChevronRight size={18} />
              </button>
              <span>Captures</span>
            </div>
            <div className="capture-select-toolbar">
              <label className="capture-check-label">
                <input type="checkbox" checked={allActiveCapturesSelected} onChange={toggleAllActiveCaptures} />
                Select All
              </label>
              <button className="quick-icon-button" onClick={() => setSelectedIds(activeGroup.captures.map((capture) => capture.id))} title="Refresh selection">
                <RotateCw size={16} />
              </button>
            </div>

            <div className="group-capture-list">
              {activeGroupCaptures.map((capture) => (
                <label key={capture.id} className="capture-select-card-row">
                  <input type="checkbox" checked={selectedIds.includes(capture.id)} onChange={() => toggleSelected(capture.id)} />
                  <div className={selectedIds.includes(capture.id) ? "capture-review-card selected" : "capture-review-card"}>
                    <h3>{capture.title}</h3>
                    <p>{capture.summary || capture.fragments[0]?.text}</p>
                    <div className="meta-row">
                      <span>{capture.fragments.length} sources</span>
                      <span>0 saved</span>
                      <span>{formatDate(capture.capturedAt)}</span>
                      <span>Ready to study</span>
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </aside>
        )}

        {queue !== "suggested" && (
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
                <div className="stack-actions">
                  {!!firstExpression && (
                    <button className="primary" onClick={() => saveExpressionFromCapture(selectedCapture, firstExpression)}>
                      Save Expression
                    </button>
                  )}
                  {!!topics.length && (
                    <>
                      <label>
                        Attach to existing topic
                        <select value={targetTopicId || topics[0].id} onChange={(event) => setTargetTopicId(event.target.value)}>
                          {topics.map((topic) => (
                            <option key={topic.id} value={topic.id}>
                              {topic.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button className="secondary" onClick={() => selectedTopic && addCapturesToTopic([selectedCapture.id], selectedTopic)}>
                        Attach to Topic
                      </button>
                    </>
                  )}
                  <button className="secondary" onClick={() => createTopicFromCaptures([selectedCapture.id], selectedCapture.topic)}>
                    Make Topic
                  </button>
                  <button className="danger" onClick={() => archiveCapture(selectedCapture)}>
                    Archive
                  </button>
                </div>
                <details className="quiet-details">
                  <summary>Advanced status</summary>
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
                </details>
              </>
            ) : (
              <EmptyState title="No capture selected" body="Choose a capture to preview source text and quick actions." />
            )}
          </aside>
        )}
      </div>
    </section>
  );
}

function CaptureRow({
  capture,
  active,
  openCapture,
  archiveCapture,
  deleteCapture
}: {
  capture: CaptureItem;
  active: boolean;
  openCapture: (capture: CaptureItem) => void;
  archiveCapture: (capture: CaptureItem) => void;
  deleteCapture: (id: string) => void;
}) {
  return (
    <article className={active ? "capture-card capture-row-card active" : "capture-card capture-row-card"} onClick={() => openCapture(capture)}>
      <div>
        <div className="capture-card-heading">
          <h3>{capture.title}</h3>
          <span className="status-pill">{capture.topicId ? "In Topic" : capture.sourceKind === "screenshot" ? "Needs text review" : "Needs review"}</span>
        </div>
        <p>{capture.summary || capture.fragments[0]?.text}</p>
        <div className="meta-row">
          <span>{sourceLabel(capture.sourceKind)}</span>
          <span>{formatDate(capture.capturedAt)}</span>
          {capture.topic && <span>{capture.topic}</span>}
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
  );
}

function buildLearningGroups(captures: CaptureItem[]): LearningGroup[] {
  const buckets = captures.reduce<Record<string, CaptureItem[]>>((acc, capture) => {
    const name = inferGroupName(capture);
    acc[name] = [...(acc[name] ?? []), capture];
    return acc;
  }, {});

  return Object.entries(buckets)
    .map(([name, items]) => ({
      id: name,
      name,
      captures: items,
      summary: summarizeGroup(items),
      practiceGoal: inferPracticeGoal(items)
    }))
    .sort((a, b) => b.captures.length - a.captures.length);
}

function inferGroupName(capture: CaptureItem) {
  const text = `${capture.title} ${capture.topic ?? ""} ${capture.summary ?? ""} ${(capture.keywords ?? []).join(" ")} ${captureText(capture)}`.toLowerCase();
  if (/game|figma|ui|asset|character|button|design|prototype|component/.test(text)) return "Game UI Design Work";
  if (/video|animation|facial|blink|hair|physics|wind|clothing|modeling|8k|parameter/.test(text)) return "Video Animation Prompts";
  if (/health|hospital|merger|wakemed|atrium|clinic|news/.test(text)) return "Healthcare News";
  if (/travel|hotel|airport|trip|itinerary|booking/.test(text)) return "Travel Planning";
  if (/meeting|feedback|colleague|work|task|project|communication|status/.test(text)) return "Workplace Communication";
  if (/opinion|agree|disagree|because|explain|表达|观点/.test(text)) return "Opinion Practice";
  if (capture.sourceKind === "youtube" || capture.sourceKind === "video") return "Video Learning";
  if (capture.sourceKind === "article") return "Article Notes";
  if (capture.sourceKind === "screenshot") return "Screenshot Notes";
  return capture.topic || "Fresh Captures";
}

function inferGroupTag(group: LearningGroup) {
  const text = group.name.toLowerCase();
  if (/news|health|hospital/.test(text)) return "News";
  if (/video|animation|prompt/.test(text)) return "Prompt";
  if (/ui|design|game/.test(text)) return "Design";
  if (/work|meeting|communication/.test(text)) return "Work";
  if (/travel/.test(text)) return "Travel";
  return "Learning";
}

function summarizeGroup(captures: CaptureItem[]) {
  const firstSummary = captures.find((capture) => capture.summary)?.summary;
  if (captures.length === 1) return firstSummary || "One capture that may become a focused learning topic.";
  const sourceKinds = Array.from(new Set(captures.map((capture) => sourceLabel(capture.sourceKind).toLowerCase())));
  return `${captures.length} related captures from ${sourceKinds.slice(0, 2).join(" and ")}.`;
}

function matchesQuery(capture: CaptureItem, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;
  const haystack = `${capture.title} ${capture.topic ?? ""} ${capture.summary ?? ""} ${captureText(capture)}`.toLowerCase();
  return haystack.includes(normalizedQuery);
}
