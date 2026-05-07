import type {
  CaptureFragment,
  CaptureItem,
  PracticeAnswer,
  PracticeQuestion,
  PracticeQuestionsOutput,
  PracticeSession,
  PracticeTipOutput,
  PracticeTurnOutput,
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
