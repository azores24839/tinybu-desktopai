import type { CaptureItem, ExpressionRecord, TopicItem, TopicStatus } from "../../types";

export const topicStatusLabels: Record<TopicStatus, string> = {
  ready: "Ready to study",
  "in-progress": "In progress",
  practiced: "Practiced"
};

export function topicCaptures(topic: TopicItem | undefined, captures: CaptureItem[]) {
  if (!topic) return [];
  const ids = new Set(topic.captureIds);
  return captures.filter((capture) => ids.has(capture.id));
}

export function topicExpressions(topic: TopicItem | undefined, expressions: ExpressionRecord[]) {
  if (!topic) return [];
  return expressions.filter((expression) => topic.captureIds.includes(expression.sourceContentId));
}
