import type { CaptureItem, TopicItem } from "../../types";

export function selectPracticeFragments(capturesForTopic: CaptureItem[]) {
  const selectedFragments = capturesForTopic.flatMap((capture) =>
    capture.fragments.filter((fragment) => fragment.selected || fragment.recommended)
  );
  const fallbackFragments = capturesForTopic.flatMap((capture) => capture.fragments).slice(0, 6);
  return selectedFragments.length ? selectedFragments : fallbackFragments;
}

export function buildPracticeChatCompletion({
  topic,
  capturesForTopic,
  practicedAt
}: {
  topic: TopicItem;
  capturesForTopic: CaptureItem[];
  practicedAt: string;
}) {
  return {
    nextTopic: {
      ...topic,
      status: "practiced" as const,
      lastPracticedAt: practicedAt,
      updatedAt: practicedAt
    },
    updatedCaptures: capturesForTopic.map((capture) => ({
      ...capture,
      status: "practiced" as const
    }))
  };
}
