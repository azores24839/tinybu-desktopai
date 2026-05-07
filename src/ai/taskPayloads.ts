import type { AppStateRecord, ContentItem, ExpressionRecord, ReviewOutput, RescueType, TalkMessage } from "../types";

export function buildContentUnderstandingPayload(content: ContentItem, appState: AppStateRecord) {
  return {
    transcript: content.transcript.map((line) => line.text).join("\n"),
    level: appState.profile.level,
    targetLanguage: appState.profile.targetLanguage,
    nativeLanguage: appState.profile.nativeLanguage
  };
}

export function buildExpressionCardPayload(sentence: string, content: ContentItem, appState: AppStateRecord) {
  return {
    sentence,
    context: content.summary,
    level: appState.profile.level,
    targetLanguage: appState.profile.targetLanguage,
    nativeLanguage: appState.profile.nativeLanguage
  };
}

export function buildTalkTurnPayload(args: {
  answer: string;
  messages: TalkMessage[];
  content: ContentItem;
  expressions: ExpressionRecord[];
  appState: AppStateRecord;
}) {
  return {
    answer: args.answer,
    messages: args.messages,
    contentSummary: args.content.summary,
    capturedExpressions: args.expressions.map((item) => ({
      original: item.original,
      pattern: item.pattern
    })),
    level: args.appState.profile.level,
    anxiety: args.appState.profile.anxiety,
    supportPreference: args.appState.profile.supportPreference
  };
}

export function buildRescuePayload(type: RescueType, currentQuestion: string, appState: AppStateRecord) {
  return {
    rescueType: type,
    currentQuestion,
    level: appState.profile.level,
    anxiety: appState.profile.anxiety
  };
}

export function buildReviewPayload(args: {
  sessionTitle: string;
  messages: TalkMessage[];
  expressions: ExpressionRecord[];
  appState: AppStateRecord;
}) {
  return {
    sessionTitle: args.sessionTitle,
    messages: args.messages,
    expressions: args.expressions,
    level: args.appState.profile.level,
    nativeLanguage: args.appState.profile.nativeLanguage,
    targetLanguage: args.appState.profile.targetLanguage
  };
}

export function buildMemoryPayload(args: {
  review: ReviewOutput;
  expressions: ExpressionRecord[];
  rescueUsed?: RescueType[];
  appState: AppStateRecord;
}) {
  return {
    review: args.review,
    expressions: args.expressions,
    rescueUsed: args.rescueUsed ?? [],
    profile: args.appState.profile
  };
}
