import type { CaptureFragment, CaptureItem, PracticeTask, TopicItem } from "../../types";
import { topicCaptures } from "../topics/topicUtils";
import { practiceTaskToFragments } from "./practiceTasks";
import { selectPracticeFragments } from "./practiceUtils";
import type { PracticeSource } from "./practiceSessionTypes";

export type PracticeSessionInput = {
  source: PracticeSource;
  fragments: CaptureFragment[];
  firstQuestion: string;
};

export function buildTopicPracticeSession({
  captures,
  fallbackQuestion,
  topic
}: {
  captures: CaptureItem[];
  fallbackQuestion: string;
  topic: TopicItem;
}): PracticeSessionInput | null {
  const capturesForTopic = topicCaptures(topic, captures);
  const fragments = selectPracticeFragments(capturesForTopic);
  if (!fragments.length) return null;

  return {
    source: {
      kind: "topic",
      title: topic.name,
      summary: topic.summary,
      practiceGoal: topic.practiceGoal,
      topic,
      captures: capturesForTopic
    },
    fragments,
    firstQuestion: fallbackQuestion
  };
}

export function buildTaskPracticeSession({
  captures,
  task
}: {
  captures: CaptureItem[];
  task: PracticeTask;
}): PracticeSessionInput | null {
  const sourceCapture = task.sourceCaptureId ? captures.find((capture) => capture.id === task.sourceCaptureId) : undefined;
  const sourceCaptures = sourceCapture ? [sourceCapture] : [];
  const fragments = sourceCapture ? selectPracticeFragments(sourceCaptures) : practiceTaskToFragments(task);
  if (!fragments.length) return null;

  return {
    source: {
      kind: "task",
      title: task.title,
      summary: task.description,
      practiceGoal: task.targetGoal,
      task,
      captures: sourceCaptures
    },
    fragments,
    firstQuestion: task.starterQuestion
  };
}
