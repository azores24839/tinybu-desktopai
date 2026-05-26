import { generatePracticeChatReview } from "../../ai/provider";
import { practiceChatReviewRules } from "../../ai/rules";
import type { AppStateRecord, ChatMessage, PracticePlan, PracticeReviewFeatures, PracticeChatReviewOutput } from "../../types";
import type { PracticeSource } from "./practiceSessionTypes";

export type PracticeReviewGenerationArgs = {
  topicName: string;
  practiceGoal: string;
  whatToCover: string[];
  chatMessages: ChatMessage[];
  reviewFeatures: PracticeReviewFeatures;
  targetLanguage: string;
  nativeLanguage: string;
  appState: AppStateRecord;
};

export function buildPracticeReviewGenerationArgs({
  appState,
  messages,
  practicePlan,
  reviewFeatures,
  source,
  whatToCover
}: {
  appState: AppStateRecord;
  messages: ChatMessage[];
  practicePlan: PracticePlan | null;
  reviewFeatures: PracticeReviewFeatures;
  source: PracticeSource;
  whatToCover: string[];
}): PracticeReviewGenerationArgs {
  return {
    topicName: source.title,
    practiceGoal: practicePlan?.practiceGoal ?? source.practiceGoal,
    whatToCover,
    chatMessages: messages,
    reviewFeatures,
    targetLanguage: appState.profile.targetLanguage,
    nativeLanguage: appState.profile.nativeLanguage,
    appState
  };
}

export async function generatePracticeReviewOutput({
  mockPracticeEnabled,
  onFallback,
  reviewArgs,
  timeoutAfter
}: {
  mockPracticeEnabled: boolean;
  onFallback: (error: unknown) => void;
  reviewArgs: PracticeReviewGenerationArgs;
  timeoutAfter: Promise<never>;
}): Promise<PracticeChatReviewOutput> {
  if (mockPracticeEnabled) return practiceChatReviewRules(reviewArgs);

  return Promise.race([generatePracticeChatReview(reviewArgs), timeoutAfter]).catch((error) => {
    onFallback(error);
    return practiceChatReviewRules(reviewArgs);
  });
}
