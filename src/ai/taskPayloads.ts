import type { AppStateRecord, ContentItem } from "../types";

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
