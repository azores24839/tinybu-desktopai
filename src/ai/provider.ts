import type {
  AppStateRecord,
  CaptureFragment,
  ContentItem,
  ContentUnderstanding,
  ExpressionRecord,
  FragmentRecommendationOutput,
  MemoryUpdateOutput,
  ReviewOutput,
  PracticeAnswer,
  PracticeQuestionsOutput,
  PracticeTipOutput,
  PracticeTurnOutput,
  QuickPetChatOutput,
  RescueOutput,
  RescueType,
  ScreenshotRecognitionOutput,
  ScreenshotQuestionOutput,
  TalkMessage,
  TalkTurnOutput
} from "../types";
import { loadUserApiKey } from "../lib/secureKey";
import {
  callCloudProxy,
  callOpenAi,
  callOpenRouter,
  callQuickPetChatCloudProxy,
  callQuickPetChatOpenAi,
  callQuickPetChatOpenRouter,
  type ProviderTaskName
} from "./providerClients";
import { isOpenRouterApiKey, shouldUseOpenRouter } from "./providerRouting";
import { normalizeScreenshotRecognition } from "./responseParsing";
import {
  expressionCardRules,
  memoryUpdateRules,
  talkReviewRules,
  practiceQuestionsRules,
  practiceTipRules,
  practiceTurnRules,
  quickPetChatRules,
  recommendFragmentsRules,
  reviewRules,
  rescueRules,
  talkTurnRules,
  understandContentRules
} from "./rules";
import { buildScreenshotCapturePayload, buildScreenshotQuestionPayload, type ScreenshotQuestionSource } from "./screenshotPayloads";
import {
  buildContentUnderstandingPayload,
  buildExpressionCardPayload,
  buildMemoryPayload,
  buildReviewPayload,
  buildRescuePayload,
  buildTalkTurnPayload
} from "./taskPayloads";

type TaskName = ProviderTaskName;

async function loadRequiredUserApiKey() {
  const apiKey = await loadUserApiKey();
  if (!apiKey) throw new Error("No user API key saved");
  return apiKey;
}

async function callQuickPetChatUserKey(
  payload: { message: string; [key: string]: unknown },
  appState: AppStateRecord
): Promise<QuickPetChatOutput> {
  const apiKey = await loadRequiredUserApiKey();
  return isOpenRouterApiKey(apiKey) || shouldUseOpenRouter("quickPetChat", appState)
    ? callQuickPetChatOpenRouter(payload, appState, apiKey)
    : callQuickPetChatOpenAi(payload, appState, apiKey);
}

async function callUserKey<T>(task: TaskName, payload: unknown, appState: AppStateRecord) {
  const apiKey = await loadRequiredUserApiKey();
  return isOpenRouterApiKey(apiKey) || shouldUseOpenRouter(task, appState)
    ? callOpenRouter<T>(task, payload, appState, apiKey)
    : callOpenAi<T>(task, payload, appState, apiKey);
}

async function withFallback<T>(
  appState: AppStateRecord,
  aiCall: () => Promise<T>,
  fallback: () => T
): Promise<T> {
  if (appState.settings.aiProviderMode === "rules") return fallback();

  try {
    return await aiCall();
  } catch (error) {
    console.warn("TinyBu AI fell back to local rules", error);
    return fallback();
  }
}

export async function understandContent(
  content: ContentItem,
  appState: AppStateRecord
): Promise<ContentUnderstanding> {
  const payload = buildContentUnderstandingPayload(content, appState);

  return withFallback(
    appState,
    () =>
      appState.settings.aiProviderMode === "cloud-proxy"
        ? callCloudProxy("contentUnderstanding", payload, appState)
        : callUserKey("contentUnderstanding", payload, appState),
    () => understandContentRules(content)
  );
}

export async function recognizeScreenshotCapture(args: {
  imageDataUrl: string;
  width: number;
  height: number;
  appState: AppStateRecord;
}): Promise<ScreenshotRecognitionOutput> {
  if (args.appState.settings.aiProviderMode === "rules") {
    throw new Error("截图识别需要启用 API 模式。");
  }

  const payload = buildScreenshotCapturePayload(args);

  const recognition = await (args.appState.settings.aiProviderMode === "cloud-proxy"
    ? callCloudProxy("screenshotCapture", payload, args.appState)
    : callUserKey("screenshotCapture", payload, args.appState));

  return normalizeScreenshotRecognition(recognition);
}

export async function answerScreenshotQuestion(args: {
  question: string;
  screenshot: ScreenshotQuestionSource;
  appState: AppStateRecord;
}): Promise<ScreenshotQuestionOutput> {
  if (args.appState.settings.aiProviderMode === "rules") {
    return {
      answer: `我先根据截图文字回答：${args.screenshot.sourceText.slice(0, 220)}`,
      quotedText: args.screenshot.sourceText.slice(0, 120),
      nextAction: "切换到 API 模式后可以得到更完整的解释。"
    };
  }

  const payload = buildScreenshotQuestionPayload(args);

  return args.appState.settings.aiProviderMode === "cloud-proxy"
    ? callCloudProxy("screenshotQuestion", payload, args.appState)
    : callUserKey("screenshotQuestion", payload, args.appState);
}

export async function generateExpressionCard(
  sentence: string,
  content: ContentItem,
  appState: AppStateRecord
) {
  const payload = buildExpressionCardPayload(sentence, content, appState);

  const base = await withFallback(
    appState,
    async () => {
      const output = await (appState.settings.aiProviderMode === "cloud-proxy"
        ? callCloudProxy<Omit<ExpressionRecord, "id">>("expressionCard", payload, appState)
        : callUserKey<Omit<ExpressionRecord, "id">>("expressionCard", payload, appState));
      return {
        original: sentence,
        meaning: output.meaning,
        keywords: output.keywords,
        pattern: output.pattern,
        scene: output.scene,
        practiceStem: output.practiceStem,
        sourceTitle: content.title,
        sourceContentId: content.id
      };
    },
    () => expressionCardRules(sentence, content, appState)
  );

  return base;
}

export async function generateTalkTurn(args: {
  answer: string;
  messages: TalkMessage[];
  content: ContentItem;
  expressions: ExpressionRecord[];
  appState: AppStateRecord;
  roundCount: number;
}): Promise<TalkTurnOutput> {
  const payload = buildTalkTurnPayload(args);

  return withFallback(
    args.appState,
    () =>
      args.appState.settings.aiProviderMode === "cloud-proxy"
        ? callCloudProxy("talkTurn", payload, args.appState)
        : callUserKey("talkTurn", payload, args.appState),
    () => talkTurnRules(args)
  );
}

export async function generateRescue(
  type: RescueType,
  currentQuestion: string,
  appState: AppStateRecord
): Promise<RescueOutput> {
  const payload = buildRescuePayload(type, currentQuestion, appState);

  return withFallback(
    appState,
    () =>
      appState.settings.aiProviderMode === "cloud-proxy"
        ? callCloudProxy("rescue", payload, appState)
        : callUserKey("rescue", payload, appState),
    () => rescueRules(type, { question: currentQuestion, appState })
  );
}

export async function generateTalkReview(args: {
  sessionTitle: string;
  messages: TalkMessage[];
  expressions: ExpressionRecord[];
  appState: AppStateRecord;
}): Promise<ReviewOutput> {
  const payload = buildReviewPayload(args);

  return withFallback(
    args.appState,
    () =>
      args.appState.settings.aiProviderMode === "cloud-proxy"
        ? callCloudProxy("talkReview", payload, args.appState)
        : callUserKey("talkReview", payload, args.appState),
    () => talkReviewRules(args)
  );
}

export async function updateMemory(args: {
  review: ReviewOutput;
  expressions: ExpressionRecord[];
  rescueUsed?: RescueType[];
  appState: AppStateRecord;
}): Promise<MemoryUpdateOutput> {
  const payload = buildMemoryPayload(args);

  return withFallback(
    args.appState,
    () =>
      args.appState.settings.aiProviderMode === "cloud-proxy"
        ? callCloudProxy("memory", payload, args.appState)
        : callUserKey("memory", payload, args.appState),
    () => memoryUpdateRules(args)
  );
}

export async function recommendFragments(
  fragments: CaptureFragment[],
  appState: AppStateRecord
): Promise<FragmentRecommendationOutput> {
  const payload = {
    fragments: fragments.map((fragment) => ({ id: fragment.id, text: fragment.text })),
    level: appState.profile.level,
    targetLanguage: appState.profile.targetLanguage
  };

  return withFallback(
    appState,
    () =>
      appState.settings.aiProviderMode === "cloud-proxy"
        ? callCloudProxy("recommendFragments", payload, appState)
        : callUserKey("recommendFragments", payload, appState),
    () => recommendFragmentsRules(fragments)
  );
}

export async function generatePracticeQuestions(args: {
  fragments: CaptureFragment[];
  appState: AppStateRecord;
}): Promise<PracticeQuestionsOutput> {
  const payload = {
    fragments: args.fragments.map((fragment) => ({ id: fragment.id, text: fragment.text })),
    level: args.appState.profile.level,
    targetLanguage: args.appState.profile.targetLanguage,
    nativeLanguage: args.appState.profile.nativeLanguage
  };

  return withFallback(
    args.appState,
    () =>
      args.appState.settings.aiProviderMode === "cloud-proxy"
        ? callCloudProxy("practiceQuestions", payload, args.appState)
        : callUserKey("practiceQuestions", payload, args.appState),
    () => practiceQuestionsRules(args)
  );
}

export async function generatePracticeTip(args: {
  question: string;
  tipLevel: number;
  outline: string;
  example: string;
  appState: AppStateRecord;
}): Promise<PracticeTipOutput> {
  const payload = {
    question: args.question,
    tipLevel: args.tipLevel,
    outline: args.outline,
    example: args.example,
    level: args.appState.profile.level,
    targetLanguage: args.appState.profile.targetLanguage,
    nativeLanguage: args.appState.profile.nativeLanguage
  };

  return withFallback(
    args.appState,
    () =>
      args.appState.settings.aiProviderMode === "cloud-proxy"
        ? callCloudProxy("practiceTip", payload, args.appState)
        : callUserKey("practiceTip", payload, args.appState),
    () => practiceTipRules(args)
  );
}

export async function generatePracticeTurn(args: {
  answer: string;
  question: string;
  questionIndex: number;
  appState: AppStateRecord;
}): Promise<PracticeTurnOutput> {
  const payload = {
    answer: args.answer,
    question: args.question,
    questionIndex: args.questionIndex,
    level: args.appState.profile.level,
    supportPreference: args.appState.profile.supportPreference
  };

  return withFallback(
    args.appState,
    () =>
      args.appState.settings.aiProviderMode === "cloud-proxy"
        ? callCloudProxy("practiceTurn", payload, args.appState)
        : callUserKey("practiceTurn", payload, args.appState),
    () => practiceTurnRules(args)
  );
}

export async function generateQuickPetChat(args: {
  message: string;
  appState: AppStateRecord;
}): Promise<QuickPetChatOutput> {
  const payload = {
    message: args.message,
    instruction: "Reply briefly as a desktop language-learning buddy.",
    nativeLanguage: args.appState.profile.nativeLanguage,
    targetLanguage: args.appState.profile.targetLanguage,
    level: args.appState.profile.level,
    supportPreference: args.appState.profile.supportPreference
  };

  if (args.appState.settings.aiProviderMode === "rules") {
    throw new Error("Quick chat is set to Rules fallback mode. Switch AI provider mode to Cloud proxy or User API key.");
  }

  return args.appState.settings.aiProviderMode === "cloud-proxy"
    ? callQuickPetChatCloudProxy(payload, args.appState)
    : callQuickPetChatUserKey(payload, args.appState);
}

export async function generateReview(args: {
  title: string;
  fragments: CaptureFragment[];
  answers: PracticeAnswer[];
  appState: AppStateRecord;
}): Promise<ReviewOutput> {
  const payload = {
    title: args.title,
    fragments: args.fragments.map((fragment) => ({ id: fragment.id, text: fragment.text })),
    answers: args.answers,
    level: args.appState.profile.level,
    nativeLanguage: args.appState.profile.nativeLanguage,
    targetLanguage: args.appState.profile.targetLanguage
  };

  return withFallback(
    args.appState,
    () =>
      args.appState.settings.aiProviderMode === "cloud-proxy"
        ? callCloudProxy("review", payload, args.appState)
        : callUserKey("review", payload, args.appState),
    () => reviewRules(args)
  );
}
