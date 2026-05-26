import { inferExpressionMeaning } from "../../lib/expressionMeaning";
import { nowIso, uid } from "../../lib/defaults";
import type { TinyBuDatabase } from "../../lib/db";
import type { ChatMessage, ExpressionRecord, MemoryItem, PracticeChatReview } from "../../types";

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function confidenceRank(confidence: "low" | "medium" | "high") {
  return confidence === "high" ? 3 : confidence === "medium" ? 2 : 1;
}

export function lowerConfidence(a: "low" | "medium" | "high", b: "low" | "medium" | "high") {
  return confidenceRank(a) <= confidenceRank(b) ? a : b;
}

export function clampReviewScore(score: number) {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function computeFocusItems(whatToCover: string[], messages: ChatMessage[]): PracticeChatReview["focusItems"] {
  const userTexts = messages.filter((m) => m.role === "user").map((m) => m.text);
  const all = userTexts.join(" ").toLowerCase();
  return whatToCover.map((item, i) => {
    const kws = extractKeywords(item);
    const completed = kws.length > 0 && kws.some((kw) => all.includes(kw));
    return { id: `focus-${i}`, label: item, completed };
  });
}

export function reviewToExpressionRecords(review: PracticeChatReview, sourceTitle: string): ExpressionRecord[] {
  const corrections = review.betterExpressions.map((expression): ExpressionRecord => ({
    id: uid("expression"),
    original: expression.original || expression.improved,
    meaning: expression.note || "Optimized from practice review",
    keywords: [],
    pattern: expression.improved,
    scene: sourceTitle,
    practiceStem: expression.improved,
    sourceTitle,
    sourceContentId: review.id,
    capturedAt: review.createdAt,
    saved: true,
    useLater: true,
    usedInTalk: false,
    userSentence: "",
    practiceCount: 0,
    learned: false,
    category: "need-practice"
  }));

  const chunks = review.savedWordsOrChunks
    .filter((item) => item.trim().split(/\s+/).length > 2)
    .slice(0, 4)
    .map((chunk): ExpressionRecord => ({
      id: uid("expression"),
      original: chunk,
      meaning: inferExpressionMeaning(chunk),
      keywords: [],
      pattern: chunk,
      scene: sourceTitle,
      practiceStem: chunk,
      sourceTitle,
      sourceContentId: review.id,
      capturedAt: review.createdAt,
      saved: true,
      useLater: true,
      usedInTalk: false,
      userSentence: "",
      practiceCount: 0,
      learned: false,
      category: "pattern"
    }));

  return [...corrections, ...chunks];
}

export function createPracticeMemory(review: PracticeChatReview): MemoryItem | null {
  return review.memoryTags?.length
    ? {
        id: uid("memory"),
        type: "interest",
        title: "TinyBu learned",
        body: `From this practice, TinyBu should remember: ${review.memoryTags.join(", ")}.`,
        editable: true,
        updatedAt: review.createdAt || nowIso()
      }
    : null;
}

export async function savePracticeReviewArtifacts({
  db,
  review,
  sourceTitle
}: {
  db: TinyBuDatabase;
  review: PracticeChatReview;
  sourceTitle: string;
}) {
  const memory = createPracticeMemory(review);
  const expressionRecords = reviewToExpressionRecords(review, sourceTitle);

  await db.transaction("rw", [db.practiceChatReviews, db.memories, db.expressions], async () => {
    await db.practiceChatReviews.put(review);
    if (memory) await db.memories.put(memory);
    if (expressionRecords.length) await db.expressions.bulkPut(expressionRecords);
  });

  return { memory, expressionRecords };
}
