import type {
  CaptureFragment,
  CaptureItem,
  ExpressionRecord,
  MirrorOutput,
  PracticeAnswer,
  PracticeQuestion,
  PracticeQuestionsOutput,
  PracticeSession,
  PracticeTipOutput,
  PracticeTurnOutput,
  ReviewRecord,
  TopicItem
} from "../../types";

export function selectPracticeFragments(capturesForTopic: CaptureItem[]) {
  const selectedFragments = capturesForTopic.flatMap((capture) =>
    capture.fragments.filter((fragment) => fragment.selected || fragment.recommended)
  );
  const fallbackFragments = capturesForTopic.flatMap((capture) => capture.fragments).slice(0, 6);
  return selectedFragments.length ? selectedFragments : fallbackFragments;
}

export function buildPracticeQuestions(outputQuestions: PracticeQuestionsOutput["questions"], createId: () => string): PracticeQuestion[] {
  return outputQuestions.slice(0, 5).map((question) => ({
    id: createId(),
    ...question,
    tipLevel: 0
  }));
}

export function buildPracticeSession({
  topic,
  capturesForTopic,
  fragments,
  questions,
  createId,
  now
}: {
  topic: TopicItem;
  capturesForTopic: CaptureItem[];
  fragments: CaptureFragment[];
  questions: PracticeQuestion[];
  createId: () => string;
  now: () => string;
}): PracticeSession {
  return {
    id: createId(),
    captureId: capturesForTopic[0]?.id ?? "",
    topicId: topic.id,
    selectedFragmentIds: fragments.map((fragment) => fragment.id),
    stage: "answer",
    questions,
    answers: [],
    currentQuestionIndex: 0,
    status: "active",
    createdAt: now(),
    updatedAt: now()
  };
}

export function buildPracticeQuestionWithTip({
  question,
  tip,
  nextLevel
}: {
  question: PracticeQuestion;
  tip: PracticeTipOutput;
  nextLevel: number;
}): PracticeQuestion {
  return {
    ...question,
    tipLevel: nextLevel,
    tipOutline: tip.outline || question.tipOutline,
    tipExample: tip.example || question.tipExample
  };
}

export function buildPracticeAnswer({
  question,
  answer,
  turn,
  createId,
  now
}: {
  question: PracticeQuestion;
  answer: string;
  turn: PracticeTurnOutput;
  createId: () => string;
  now: () => string;
}): PracticeAnswer {
  return {
    id: createId(),
    questionId: question.id,
    answer,
    nomiReply: `${turn.encouragement} ${turn.response}`,
    createdAt: now()
  };
}

export function selectPracticeReviewFragments(capturesForTopic: CaptureItem[], selectedFragmentIds: string[]) {
  const selectedIds = new Set(selectedFragmentIds);
  return capturesForTopic.flatMap((capture) => capture.fragments).filter((fragment) => selectedIds.has(fragment.id));
}

export function buildSavedPracticeExpressions({
  reviewOutput,
  topic,
  createId,
  now
}: {
  reviewOutput: MirrorOutput;
  topic: TopicItem;
  createId: () => string;
  now: () => string;
}): ExpressionRecord[] {
  return reviewOutput.savedExpressions.map((item) => ({
    id: createId(),
    ...item,
    sourceTitle: topic.name,
    sourceContentId: topic.captureIds[0] ?? topic.id,
    capturedAt: now(),
    saved: true,
    useLater: true,
    usedInTalk: false,
    userSentence: "",
    practiceCount: 1,
    learned: false,
    category: "need-practice"
  }));
}

export function buildPracticeReviewRecord({
  reviewOutput,
  session,
  savedExpressions,
  createId,
  now
}: {
  reviewOutput: MirrorOutput;
  session: PracticeSession;
  savedExpressions: ExpressionRecord[];
  createId: () => string;
  now: () => string;
}): ReviewRecord {
  return {
    id: createId(),
    sessionId: session.id,
    talkedAbout: reviewOutput.talkedAbout,
    didWell: reviewOutput.didWell,
    naturalExpressions: reviewOutput.naturalExpressions,
    savedExpressionIds: savedExpressions.map((item) => item.id),
    nextPractice: reviewOutput.nextPractice,
    createdAt: now()
  };
}

export function buildCompletedPracticeSession({
  session,
  answers,
  review,
  now
}: {
  session: PracticeSession;
  answers: PracticeAnswer[];
  review: ReviewRecord;
  now: () => string;
}): PracticeSession {
  return {
    ...session,
    answers,
    stage: "review",
    reviewId: review.id,
    status: "completed",
    updatedAt: now(),
    completedAt: now()
  };
}

export function buildPracticedCaptures(capturesForTopic: CaptureItem[]) {
  return capturesForTopic.map((capture) => ({ ...capture, status: "practiced" as const }));
}

export function buildPracticedTopic({
  topic,
  savedExpressionCount,
  now
}: {
  topic: TopicItem;
  savedExpressionCount: number;
  now: () => string;
}): TopicItem {
  return {
    ...topic,
    status: "practiced",
    savedExpressionCount: topic.savedExpressionCount + savedExpressionCount,
    lastPracticedAt: now(),
    updatedAt: now()
  };
}
