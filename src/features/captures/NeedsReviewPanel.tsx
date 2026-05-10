import { useState } from "react";
import { ChevronRight, Plus, Trash2, X } from "lucide-react";
import type { CaptureItem, ReviewIssueType, TopicItem } from "../../types";
import { formatDate } from "../../lib/date";
import { sourceLabel } from "./captureUtils";

type NeedsReviewPanelProps = {
  captures: CaptureItem[];
  topics: TopicItem[];
  onConfirm: (capture: CaptureItem, editedText: string) => void;
  onRetry: (capture: CaptureItem) => void;
  onMoveToUnsorted: (capture: CaptureItem) => void;
  onDiscard: (capture: CaptureItem) => void;
  onAddToTopic: (captureId: string, topic: TopicItem) => void;
  onCreateTopic: (captureId: string, name: string, practiceGoal?: string) => void;
};

const issueLabels: Record<ReviewIssueType, string> = {
  ocr_off: "OCR off",
  ocr_failed: "Recognition failed",
  recognition_failed: "Recognition failed",
  low_confidence: "Low confidence",
  text_too_short: "Text too short",
  transcript_messy: "Transcript messy",
  extraction_issue: "Extraction issue",
  signin_page: "Sign-in page",
  mixed_language: "Mixed language",
  empty_capture: "Empty capture"
};

function getNotice(issueType: ReviewIssueType | undefined): string {
  switch (issueType) {
    case "ocr_off":
      return "Text recognition is currently off. You can retry recognition, type the text manually, or move this capture to Unsorted.";
    case "ocr_failed":
    case "recognition_failed":
      return "Text recognition failed. You can retry recognition, type the text manually, or move this capture to Unsorted.";
    case "low_confidence":
      return "Some words may be missing or inaccurate. Please check the extracted text before TinyBu organizes it.";
    case "transcript_messy":
      return "Some captions look duplicated or broken. Please check the useful text before organizing.";
    case "extraction_issue":
    case "text_too_short":
      return "This capture looks unusually short. TinyBu may have captured page UI instead of the article itself.";
    case "signin_page":
      return "TinyBu may have captured a sign-in or subscription page instead of the article content.";
    default:
      return "This capture may need your review before organizing.";
  }
}

export function NeedsReviewPanel({
  captures,
  topics,
  onConfirm,
  onRetry,
  onMoveToUnsorted,
  onDiscard,
  onAddToTopic,
  onCreateTopic
}: NeedsReviewPanelProps) {
  const [selectedId, setSelectedId] = useState(captures[0]?.id ?? "");
  const [editedText, setEditedText] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
  const [drawerTopicId, setDrawerTopicId] = useState("");
  const [newTopicName, setNewTopicName] = useState("");
  const [screenshotEnlarged, setScreenshotEnlarged] = useState(false);
  const [showUnsavedHint, setShowUnsavedHint] = useState(false);
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());

  const activeCaptures = captures.filter((c) => !resolvedIds.has(c.id));
  const selected = activeCaptures.find((c) => c.id === selectedId) ?? activeCaptures[0];
  const isScreenshot = selected?.sourceKind === "screenshot";
  const displayText = editedText !== "" ? editedText : selected?.extractedText ?? "";

  const handleSelect = (capture: CaptureItem) => {
    setSelectedId(capture.id);
    setEditedText("");
    setConfirmed(false);
    setShowUnsavedHint(false);
  };

  const handleDelete = (e: React.MouseEvent, captureId: string) => {
    e.stopPropagation();
    const target = captures.find((c) => c.id === captureId) ?? captures[0];
    onDiscard(target);
    const next = activeCaptures.filter((c) => c.id !== captureId);
    const nextCapture = next[next.findIndex((c) => c.id === selectedId) + 1] ?? next[0];
    setResolvedIds((prev) => new Set(prev).add(captureId));
    if (nextCapture) {
      setSelectedId(nextCapture.id);
      setEditedText("");
      setConfirmed(false);
    }
  };

  const handleConfirm = () => {
    if (selected) {
      setConfirmed(true);
      if (displayText) {
        onConfirm(selected, displayText);
      }
    }
  };

  const handleOpenDrawer = () => setShowDrawer(true);
  const handleCloseDrawer = () => {
    setShowDrawer(false);
    setDrawerTopicId("");
    setNewTopicName("");
  };

  const handleDrawerConfirm = () => {
    if (!selected) return;
    if (newTopicName.trim()) {
      onCreateTopic(selected.id, newTopicName.trim());
    } else if (drawerTopicId) {
      const topic = topics.find((t) => t.id === drawerTopicId);
      if (topic) onAddToTopic(selected.id, topic);
    } else {
      return;
    }
    handleCloseDrawer();
    setResolvedIds((prev) => new Set(prev).add(selected.id));
    const next = activeCaptures.filter((c) => c.id !== selected.id)[0];
    if (next) {
      setSelectedId(next.id);
      setEditedText("");
      setConfirmed(false);
    }
  };

  if (!activeCaptures.length) {
    return (
      <div className="needs-review-empty">
        <div className="empty-state">
          <h2>No captures need review</h2>
          <p>TinyBu will place screenshots, unclear OCR results, messy transcripts, and unusual captures here before organizing them.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="needs-review-layout">
      <aside className="review-queue-column">
        <div className="review-queue-list">
          {activeCaptures.map((capture) => (
            <button
              key={capture.id}
              className={capture.id === selectedId ? "review-queue-card active" : "review-queue-card"}
              onClick={() => handleSelect(capture)}
            >
              <div className="review-queue-card-head">
                <h3>{capture.title}</h3>
                <button className="review-card-delete" onClick={(e) => handleDelete(e, capture.id)} title="Delete">
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="review-queue-card-meta">
                <span>{sourceLabel(capture.sourceKind)}</span>
                <span className="review-queue-dot">·</span>
                <span className="review-issue-label">{capture.issueType ? issueLabels[capture.issueType] : "Needs review"}</span>
              </div>
              <p className="review-queue-preview">{capture.sourceText?.slice(0, 100) || capture.summary || "No preview available."}</p>
              <span className="review-queue-time">{formatDate(capture.capturedAt)}</span>
            </button>
          ))}
        </div>
      </aside>

      <main className="review-center">
        {selected ? (
          <>
            <div className="review-center-scroll">
              <div className="review-center-body">
                <div className="review-center-heading">
                  <h2>Review Recognition</h2>
                  <p>Check the captured content before TinyBu organizes it.</p>
                </div>

                {isScreenshot && selected.originalImageUrl && (
                  <div className="review-screenshot-row">
                    <div className="review-screenshot-thumb" onClick={() => setScreenshotEnlarged(true)}>
                      <img src={selected.originalImageUrl} alt={selected.title} />
                    </div>
                    {selected.issueType && (
                      <div className="review-notice review-notice-inline">
                        <strong>TinyBu noticed:</strong>
                        <p>{getNotice(selected.issueType)}</p>
                      </div>
                    )}
                  </div>
                )}

                {!isScreenshot && selected.issueType && (
                  <div className="review-notice">
                    <strong>TinyBu noticed:</strong>
                    <p>{getNotice(selected.issueType)}</p>
                  </div>
                )}

                {selected.sourceKind === "youtube" && selected.originalText && (
                  <div className="review-original-preview">
                    <h3>Original Transcript</h3>
                    <pre className="review-original-text">{selected.originalText}</pre>
                  </div>
                )}

                {selected.sourceKind === "article" && selected.originalText && (
                  <div className="review-original-preview">
                    <h3>Captured Article Text</h3>
                    <pre className="review-original-text">{selected.originalText}</pre>
                  </div>
                )}

                <div className="review-text-area">
                  <div className="review-text-header">
                    {isScreenshot && <h3>Extracted Text</h3>}
                    {(selected.sourceKind === "youtube" || selected.sourceKind === "video") && <h3>Cleaned Text</h3>}
                    {selected.sourceKind === "article" && <h3>Cleaned Content</h3>}
                    <div className="review-text-header-actions">
                      {isScreenshot && (
                        <button className="secondary" onClick={() => onRetry(selected)}>
                          Retry Recognition
                        </button>
                      )}
                      <button
                        className={confirmed ? "primary review-confirmed-btn" : "primary"}
                        disabled={!displayText.trim()}
                        onClick={handleConfirm}
                      >
                        {confirmed ? "Text Confirmed" : "Confirm Text"}
                      </button>
                    </div>
                  </div>
                  <textarea
                    className="review-editable-textarea"
                    value={displayText}
                    onChange={(e) => setEditedText(e.target.value)}
                    placeholder={isScreenshot ? "No text extracted yet. Type or retry recognition." : "No cleaned text available. Type manually."}
                    rows={6}
                  />
                </div>
              </div>
            </div>

            <div className="review-bottom-bar">
              {!confirmed && showUnsavedHint && (
                <span className="review-bottom-hint">Confirm the extracted text first, then choose where to move this capture.</span>
              )}
              <button
                className="secondary"
                disabled={!confirmed}
                onClick={() => {
                  if (!confirmed) { setShowUnsavedHint(true); return; }
                  if (selected) {
                    onMoveToUnsorted(selected);
                    setResolvedIds((prev) => new Set(prev).add(selected.id));
                    const next = activeCaptures.filter((c) => c.id !== selected.id)[0];
                    if (next) {
                      setSelectedId(next.id);
                      setEditedText("");
                      setConfirmed(false);
                    }
                  }
                }}
              >
                Move to Unsorted
              </button>
              <button
                className="secondary"
                disabled={!confirmed}
                onClick={() => { if (!confirmed) { setShowUnsavedHint(true); return; } handleOpenDrawer(); }}
              >
                Move to Topic
                <ChevronRight size={14} />
              </button>
            </div>
          </>
        ) : (
          <div className="empty-state">
            <h2>No capture selected</h2>
            <p>Choose a capture from the queue to review.</p>
          </div>
        )}
      </main>

      {showDrawer && (
        <div className="review-drawer-overlay" onClick={handleCloseDrawer}>
          <aside className="review-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="review-drawer-header">
              <h2>Move to Topic</h2>
              <button className="review-drawer-close" onClick={handleCloseDrawer}>
                <X size={18} />
              </button>
            </div>

            <div className="review-drawer-topic-list">
              {topics.length ? (
                topics.map((topic) => (
                  <label
                    key={topic.id}
                    className={drawerTopicId === topic.id ? "review-drawer-topic-row selected" : "review-drawer-topic-row"}
                    onClick={() => { setDrawerTopicId(topic.id); setNewTopicName(""); }}
                  >
                    <input
                      type="radio"
                      name="drawer-topic"
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
                <p className="review-drawer-empty">No topics yet. Create one below.</p>
              )}
            </div>

            <div className="review-drawer-new-topic">
              <div className="review-drawer-new-header">
                <Plus size={16} />
                <span>Create new topic</span>
              </div>
              <input
                className="review-drawer-input"
                value={newTopicName}
                onChange={(e) => { setNewTopicName(e.target.value); setDrawerTopicId(""); }}
                placeholder="Topic name..."
              />
            </div>

            <div className="review-drawer-footer">
              <button
                className="primary"
                disabled={!drawerTopicId && !newTopicName.trim()}
                onClick={handleDrawerConfirm}
              >
                Confirm
              </button>
            </div>
          </aside>
        </div>
      )}

      {screenshotEnlarged && selected?.originalImageUrl && (
        <div className="review-screenshot-overlay" onClick={() => setScreenshotEnlarged(false)}>
          <button className="review-screenshot-overlay-close" onClick={() => setScreenshotEnlarged(false)}>
            <X size={24} />
          </button>
          <img src={selected.originalImageUrl} alt={selected.title} />
        </div>
      )}
    </div>
  );
}
