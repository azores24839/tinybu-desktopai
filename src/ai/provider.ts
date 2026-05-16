import type {
  AppStateRecord,
  CaptureFragment,
  ChatMessage,
  ContentItem,
  ContentUnderstanding,
  FragmentRecommendationOutput,
  PracticeChatReviewOutput,
  PracticePlan,
  QuickPetChatOutput,
  ScreenshotRecognitionOutput,
  ScreenshotQuestionOutput
} from "../types";
import { loadUserApiKey } from "../lib/secureKey";
import {
  callCloudProxy,
  callOpenAi,
  callOpenRouter,
  callPracticeChatCloudProxy,
  callPracticeChatOpenAi,
  callPracticeChatOpenRouter,
  callQuickPetChatCloudProxy,
  callQuickPetChatOpenAi,
  callQuickPetChatOpenRouter,
  type ProviderTaskName
} from "./providerClients";
import { isOpenRouterApiKey, shouldUseOpenRouter } from "./providerRouting";
import { normalizeScreenshotRecognition } from "./responseParsing";
import {
  practiceChatReviewRules,
  practiceQuestionsRules,
  quickPetChatRules,
  recommendFragmentsRules,
  understandContentRules
} from "./rules";
import { buildScreenshotCapturePayload, buildScreenshotQuestionPayload, type ScreenshotQuestionSource } from "./screenshotPayloads";
import { buildContentUnderstandingPayload } from "./taskPayloads";

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

async function callPracticeChatUserKey(
  payload: { userAnswer: string; topicName: string; chatHistory: Array<{ role: string; text: string }> },
  appState: AppStateRecord
): Promise<string> {
  const apiKey = await loadRequiredUserApiKey();
  return isOpenRouterApiKey(apiKey) || shouldUseOpenRouter("practiceChat", appState)
    ? callPracticeChatOpenRouter(payload, appState, apiKey)
    : callPracticeChatOpenAi(payload, appState, apiKey);
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
}): Promise<PracticePlan> {
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

export async function generatePracticeChat(args: {
  userAnswer: string;
  topicName: string;
  chatHistory: Array<{ role: string; text: string }>;
  appState: AppStateRecord;
}): Promise<string> {
  const payload = {
    userAnswer: args.userAnswer,
    topicName: args.topicName,
    chatHistory: args.chatHistory.slice(-6)
  };

  const lang = args.appState.profile.interfaceLanguage;
  const fallbackReply =
    lang === "中文"
      ? "说得不错！你还可以试试用更自然的说法来表达这个意思。"
      : "Good try! Maybe you can express that idea in a more natural way.";

  if (args.appState.settings.aiProviderMode === "rules") {
    return fallbackReply;
  }

  try {
    return args.appState.settings.aiProviderMode === "cloud-proxy"
      ? await callPracticeChatCloudProxy(payload, args.appState)
      : await callPracticeChatUserKey(payload, args.appState);
  } catch (error) {
    console.warn("Practice chat AI failed, using fallback", error);
    return fallbackReply;
  }
}

export async function generatePracticeChatReview(args: {
  topicName: string;
  practiceGoal: string;
  whatToCover: string[];
  chatMessages: ChatMessage[];
  targetLanguage: string;
  nativeLanguage: string;
  appState: AppStateRecord;
}): Promise<PracticeChatReviewOutput> {
  const payload = {
    topicName: args.topicName,
    practiceGoal: args.practiceGoal,
    whatToCover: args.whatToCover,
    chatMessages: args.chatMessages.map((m) => ({ role: m.role, text: m.text })),
    targetLanguage: args.targetLanguage,
    nativeLanguage: args.nativeLanguage,
    level: args.appState.profile.level
  };

  return withFallback(
    args.appState,
    () =>
      args.appState.settings.aiProviderMode === "cloud-proxy"
        ? callCloudProxy("practiceChatReview", payload, args.appState)
        : callUserKey("practiceChatReview", payload, args.appState),
    () => practiceChatReviewRules(args)
  );
}
