import { nowIso, uid } from "../../lib/defaults";
import type {
  ChatMessage,
  PracticeChatReview,
  PracticeChatReviewOutput,
  PracticeReviewFeatures
} from "../../types";
import { expressionStatusLabel } from "./practiceReviewDiagnostics";
import { clampReviewScore, lowerConfidence } from "./practiceReviewPersistence";
import type { PracticeSource } from "./practiceSessionTypes";

export function buildPracticeReviewRecord({
  bookmarkedLines,
  completedFocusItemIds,
  focusItems,
  interfaceLanguage,
  messages,
  output,
  reviewFeatures,
  source
}: {
  bookmarkedLines: string[];
  completedFocusItemIds: string[];
  focusItems: PracticeChatReview["focusItems"];
  interfaceLanguage: "中文" | "English";
  messages: ChatMessage[];
  output: PracticeChatReviewOutput;
  reviewFeatures: PracticeReviewFeatures;
  source: PracticeSource;
}): PracticeChatReview {
  const userMessages = messages.filter((m) => m.role === "user");
  const expressionScore = clampReviewScore(output.expressionStatus.score);
  const expressionStatus = {
    score: expressionScore,
    label: output.expressionStatus.label || expressionStatusLabel(expressionScore, interfaceLanguage),
    confidence: lowerConfidence(output.expressionStatus.confidence, reviewFeatures.confidence)
  };

  return {
    id: uid("pcr"),
    topicId: source.kind === "topic" ? source.topic.id : undefined,
    taskId: source.kind === "task" ? source.task.id : undefined,
    createdAt: nowIso(),
    diarySummary: output.diarySummary,
    taskOutcome: output.taskOutcome,
    reviewScores: output.reviewScores,
    completedFocusItemIds,
    focusItems,
    betterExpressions: output.betterExpressions,
    savedWordsOrChunks: Array.from(new Set([...bookmarkedLines, ...output.savedWordsOrChunks])),
    memoryTags: output.memoryTags,
    nextStep: output.nextStep,
    messageCount: messages.length,
    userMessageCount: userMessages.length,
    expressionStatus,
    strength: output.strength,
    nextFocus: output.nextFocus,
    why: output.why,
    dimensionSignals: output.dimensionSignals
  };
}
