import { useState } from "react";
import { Check, MessageCircle, RefreshCcw, Target, X } from "lucide-react";
import { formatDate } from "../../lib/date";
import type { PracticeChatReview } from "../../types";

function splitDiary(summary: string) {
  return summary
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function highlightParagraph(paragraph: string, tags: string[]) {
  const matches = tags.filter((tag) => tag.length > 2 && paragraph.toLowerCase().includes(tag.toLowerCase()));
  if (!matches.length) return paragraph;
  const pattern = new RegExp(`(${matches.map((tag) => tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return paragraph.split(pattern).map((part, index) =>
    matches.some((tag) => tag.toLowerCase() === part.toLowerCase()) ? (
      <mark key={`${part}-${index}`}>{part}</mark>
    ) : (
      part
    )
  );
}

function looksLikeChunk(item: string) {
  return item.includes("...") || item.split(/\s+/).length > 3 || /[.?!]$/.test(item.trim());
}

export function PracticeReviewPage({
  sourceTitle,
  review,
  onDone,
  onPracticeAgain,
  interfaceLanguage
}: {
  sourceTitle: string;
  review: PracticeChatReview;
  onDone: (review: PracticeChatReview) => void;
  onPracticeAgain: (review: PracticeChatReview) => void;
  interfaceLanguage: "中文" | "English";
}) {
  const copy = interfaceLanguage === "中文" ? zh : en;
  const [step, setStep] = useState<"diary" | "archive">("diary");
  const [selectedExpression, setSelectedExpression] = useState(false);
  const [selectedWords, setSelectedWords] = useState<Set<number>>(
    () => new Set(review.savedWordsOrChunks.map((_, index) => index))
  );
  const initialMemoryTags = review.memoryTags?.length ? review.memoryTags : review.savedWordsOrChunks.slice(0, 6);
  const [memoryTags, setMemoryTags] = useState(initialMemoryTags);
  const completedCount = review.focusItems.filter((item) => item.completed).length;
  const totalGoals = review.focusItems.length || 1;
  const savedCount = review.savedWordsOrChunks.length;
  const expression = review.betterExpressions[0];
  const diaryParagraphs = splitDiary(review.diarySummary);
  const vocabItems = review.savedWordsOrChunks
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !looksLikeChunk(item));
  const chunkItems = review.savedWordsOrChunks
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => looksLikeChunk(item));
  const reviewWithMemoryTags = () => ({ ...review, memoryTags });
  const selectedReview = () => ({
    ...review,
    betterExpressions: selectedExpression && expression ? [expression] : [],
    savedWordsOrChunks: review.savedWordsOrChunks.filter((_, index) => selectedWords.has(index)),
    memoryTags
  });

  function toggleWord(index: number) {
    setSelectedWords((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function removeMemoryTag(tagToRemove: string) {
    setMemoryTags((tags) => tags.filter((tag) => tag !== tagToRemove));
  }

  return (
    <section className={`page practice-chat-review-page ${step === "archive" ? "archive-step" : "diary-step"}`}>
      <div className="practice-review-shell">
        <header className="practice-chat-review-header">
          <div>
            <span className="review-kicker">{copy.kicker}</span>
            <h2>{step === "diary" ? copy.title : copy.archiveTitle}</h2>
            <p className="review-topic-name">{sourceTitle}</p>
          </div>
          <p className="review-date">{formatDate(review.createdAt)}</p>
        </header>

        {step === "diary" ? (
          <>
            <section className="review-hero-grid">
              <div className="review-memory-card">
                <div className="review-memory-avatar">
                  <img src="/assets/tinybu-practice.png" alt="TinyBu" />
                </div>
                <div>
                  <p>{copy.completedPractice}</p>
                  <div className="review-diary-text">
                    {diaryParagraphs.map((paragraph, index) => (
                      <p key={`${paragraph}-${index}`}>{highlightParagraph(paragraph, memoryTags)}</p>
                    ))}
                  </div>
                </div>
              </div>

              <div className="review-memory-chips">
                <span>
                  <MessageCircle size={20} />
                  {review.userMessageCount} {copy.stats.spoken}
                </span>
                <span>
                  <Target size={20} />
                  {completedCount}/{totalGoals} {copy.stats.goals}
                </span>
              </div>
            </section>

            <section className="review-memory-tags-panel">
              <div className="review-panel-heading">
                <h3>{copy.memoryTagsTitle}</h3>
                <span>{memoryTags.length}</span>
              </div>
              <div className="review-memory-tags">
                {memoryTags.map((tag) => (
                  <button key={tag} onClick={() => removeMemoryTag(tag)} aria-label={`${copy.removeTag} ${tag}`}>
                    {tag}
                    <X size={13} />
                  </button>
                ))}
              </div>
            </section>

            <footer className="practice-chat-review-footer">
              <button className="secondary" onClick={() => setStep("archive")}>
                {copy.archiveCta}
              </button>
              <button className="primary" onClick={() => onDone(reviewWithMemoryTags())}>
                {copy.done}
              </button>
              <button className="secondary" onClick={() => onPracticeAgain(reviewWithMemoryTags())}>
                <RefreshCcw size={16} />
                {copy.practiceAgain}
              </button>
            </footer>
          </>
        ) : (
          <>
            <main className="review-archive-layout">
              <section className="panel review-words-panel review-language-panel">
                <div className="review-panel-heading">
                  <h3>{copy.vocabTitle}</h3>
                  <span>{vocabItems.filter(({ index }) => selectedWords.has(index)).length}/{vocabItems.length}</span>
                </div>
                <p className="review-save-hint">{copy.vocabHint}</p>
                {vocabItems.length ? (
                  <div className="review-select-words">
                    {vocabItems.map(({ item, index }) => (
                      <button key={`${item}-${index}`} className={selectedWords.has(index) ? "selected" : ""} onClick={() => toggleWord(index)}>
                        <span>{selectedWords.has(index) ? <Check size={13} /> : null}</span>
                        {item}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="review-muted">{copy.noVocab}</p>
                )}
              </section>

              <section className="panel review-words-panel review-language-panel">
                <div className="review-panel-heading">
                  <h3>{copy.chunksTitle}</h3>
                  <span>{chunkItems.filter(({ index }) => selectedWords.has(index)).length}/{chunkItems.length}</span>
                </div>
                <p className="review-save-hint">{copy.chunksHint}</p>
                {chunkItems.length ? (
                  <div className="review-select-words chunk-list">
                    {chunkItems.map(({ item, index }) => (
                      <button key={`${item}-${index}`} className={selectedWords.has(index) ? "selected" : ""} onClick={() => toggleWord(index)}>
                        <span>{selectedWords.has(index) ? <Check size={13} /> : null}</span>
                        {item}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="review-muted">{copy.noChunks}</p>
                )}
              </section>

              {expression && (
                <section className="panel review-expression-panel compact-expression-panel">
                  <div className="review-panel-heading">
                    <h3>{copy.naturalSentenceTitle}</h3>
                    <span>{selectedExpression ? 1 : 0}/1</span>
                  </div>
                  <button
                    className={`review-main-expression-card ${selectedExpression ? "selected" : ""}`}
                    onClick={() => setSelectedExpression((selected) => !selected)}
                  >
                    <span className="review-select-check">{selectedExpression ? <Check size={14} /> : null}</span>
                    <div>
                      <strong>{expression.improved}</strong>
                      {expression.original && <p>{copy.originalLabel}: {expression.original}</p>}
                    </div>
                  </button>
                </section>
              )}
            </main>

            <footer className="practice-chat-review-footer">
              <button className="secondary" onClick={() => setStep("diary")}>
                {copy.backToDiary}
              </button>
              <button className="primary" onClick={() => onDone(selectedReview())}>
                {copy.saveAndDone}
              </button>
              <button className="secondary" onClick={() => onDone({ ...review, betterExpressions: [], savedWordsOrChunks: [] })}>
                {copy.skipSave}
              </button>
            </footer>
          </>
        )}
      </div>
    </section>
  );
}

const zh = {
  kicker: "Review",
  title: "今天完成了一次表达练习",
  archiveTitle: "Vocab / Chunk 存档",
  completedPractice: "TinyBu 的小记",
  memoryTitle: "我记住了这次练习",
  memoryTagsTitle: "TinyBu 会记住这些",
  removeTag: "不记录",
  practiceDone: "完成 1 次口语练习",
  archiveTeaserTitle: "可以留下的内容",
  archiveTeaserBody: "我帮你挑出了一些值得下次再用的表达。想保存时再进入存档，不想整理也可以直接完成。",
  focusTitle: "小目标覆盖",
  expressionsTitle: "推荐保存",
  wordsTitle: "想保存的表达",
  nextTitle: "TinyBu 的小记",
  recommendedLabel: "建议留下这一句",
  originalLabel: "原句",
  improvedLabel: "更自然",
  saveHint: "只保存你点亮的内容。",
  noExpression: "这次没有需要特别改写的句子。",
  vocabTitle: "Vocab",
  chunksTitle: "Chunks",
  naturalSentenceTitle: "自然说法",
  vocabHint: "适合下次复用的词和短语，默认会保存。",
  chunksHint: "适合直接拿来开口的句架，默认会保存。",
  noVocab: "这次没有特别需要保存的词。",
  noChunks: "这次没有特别需要保存的句架。",
  archiveCta: "存 Vocab / Chunk",
  backToDiary: "返回小记",
  saveAndDone: "保存并完成",
  skipSave: "不保存，完成",
  done: "完成",
  practiceAgain: "再练一次",
  stats: {
    spoken: "次开口",
    goals: "目标",
    archive: "个可存"
  }
};

const en = {
  kicker: "Review",
  title: "You completed one expression practice",
  archiveTitle: "Vocab / Chunk Archive",
  completedPractice: "TinyBu's note",
  memoryTitle: "I saved this little memory",
  memoryTagsTitle: "TinyBu will remember",
  removeTag: "Do not remember",
  practiceDone: "1 speaking practice",
  archiveTeaserTitle: "Optional saves",
  archiveTeaserBody: "TinyBu picked a few sentences and phrases. Open the archive if you want to keep them, or finish without organizing.",
  focusTitle: "Small goals covered",
  expressionsTitle: "Recommended save",
  wordsTitle: "Expressions to save",
  nextTitle: "TinyBu's note",
  recommendedLabel: "Keep this sentence",
  originalLabel: "Original",
  improvedLabel: "More natural",
  saveHint: "Only highlighted items will be saved.",
  noExpression: "No sentence needed a special rewrite this time.",
  vocabTitle: "Vocab",
  chunksTitle: "Chunks",
  naturalSentenceTitle: "Natural sentence",
  vocabHint: "Reusable words and phrases are selected by default.",
  chunksHint: "Reusable speaking chunks are selected by default.",
  noVocab: "No specific vocab to save this time.",
  noChunks: "No specific chunks to save this time.",
  archiveCta: "Save vocab / chunks",
  backToDiary: "Back to note",
  saveAndDone: "Save and finish",
  skipSave: "Finish without saving",
  done: "Done",
  practiceAgain: "Practice again",
  stats: {
    spoken: "turns spoken",
    goals: "goals",
    archive: "saves"
  }
};
