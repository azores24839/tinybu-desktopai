import type { AppStateRecord } from "../types";

export type ScreenshotQuestionSource = {
  imageDataUrl?: string;
  title: string;
  sourceText: string;
  summary?: string;
  screenType?: string;
  visibleText?: string[];
  errorMessages?: string[];
  interactiveElements?: string[];
};

export function buildScreenshotCapturePayload(args: {
  imageDataUrl: string;
  width: number;
  height: number;
  appState: AppStateRecord;
}) {
  return {
    imageDataUrl: args.imageDataUrl,
    width: args.width,
    height: args.height,
    level: args.appState.profile.level,
    targetLanguage: args.appState.profile.targetLanguage,
    nativeLanguage: args.appState.profile.nativeLanguage
  };
}

export function isVisualScreenshotQuestion(question: string) {
  return /右|左|上|下|按钮|图标|颜色|红色|蓝色|位置|where|button|icon|color|right|left/i.test(question);
}

export function buildScreenshotQuestionPayload(args: {
  question: string;
  screenshot: ScreenshotQuestionSource;
  appState: AppStateRecord;
  forceImage?: boolean;
}) {
  const visualQuestion = isVisualScreenshotQuestion(args.question);
  return {
    question: args.question,
    title: args.screenshot.title,
    sourceText: args.screenshot.sourceText,
    summary: args.screenshot.summary,
    screenType: args.screenshot.screenType,
    visibleText: args.screenshot.visibleText ?? [],
    errorMessages: args.screenshot.errorMessages ?? [],
    interactiveElements: args.screenshot.interactiveElements ?? [],
    imageDataUrl: visualQuestion || args.forceImage ? args.screenshot.imageDataUrl : undefined,
    nativeLanguage: args.appState.profile.nativeLanguage,
    targetLanguage: args.appState.profile.targetLanguage
  };
}
