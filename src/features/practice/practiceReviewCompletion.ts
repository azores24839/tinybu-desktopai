import type { TinyBuDatabase } from "../../lib/db";
import type { CaptureItem, PracticeChatReview, PracticeTask } from "../../types";
import { topicCaptures } from "../topics/topicUtils";
import { buildPracticeChatCompletion } from "./practiceUtils";
import type { PracticeSource } from "./practiceSessionTypes";

export type PracticeReviewCompletionArtifacts = {
  completion: ReturnType<typeof buildPracticeChatCompletion> | null;
  nextTask: PracticeTask | null;
};

export function buildPracticeReviewCompletionArtifacts({
  captures,
  review,
  source
}: {
  captures: CaptureItem[];
  review: PracticeChatReview;
  source: PracticeSource;
}): PracticeReviewCompletionArtifacts {
  return {
    nextTask: source.kind === "task" ? { ...source.task, status: "used", usedAt: review.createdAt } : null,
    completion:
      source.kind === "topic"
        ? buildPracticeChatCompletion({
            topic: source.topic,
            capturesForTopic: topicCaptures(source.topic, captures),
            practicedAt: review.createdAt
          })
        : null
  };
}

export async function savePracticeReviewCompletion({
  db,
  review,
  artifacts
}: {
  db: TinyBuDatabase;
  review: PracticeChatReview;
  artifacts: PracticeReviewCompletionArtifacts;
}) {
  await db.transaction("rw", [db.practiceChatReviews, db.topics, db.captures, db.practiceTasks], async () => {
    await db.practiceChatReviews.put(review);
    if (artifacts.nextTask) await db.practiceTasks.put(artifacts.nextTask);
    if (artifacts.completion) {
      await db.topics.put(artifacts.completion.nextTopic);
      if (artifacts.completion.updatedCaptures.length) await db.captures.bulkPut(artifacts.completion.updatedCaptures);
    }
  });
}
