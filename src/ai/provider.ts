import type {
  AppStateRecord,
  CaptureFragment,
  ContentItem,
  ContentUnderstanding,
  ExpressionRecord,
  FragmentRecommendationOutput,
  MemoryUpdateOutput,
  MirrorOutput,
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
import { fetchWithTimeout } from "./fetchWithTimeout";
import { isOpenRouterApiKey, modelForTask, normalizeOpenRouterModel, shouldUseOpenRouter } from "./providerRouting";
import { buildOpenAiInput, buildOpenRouterMessages } from "./requestBuilders";
import { normalizeScreenshotRecognition, parseOpenAiJson, parseOpenAiText, quickReplyText } from "./responseParsing";
import { jsonSchemas, taskPrompts } from "./prompts";
import {
  expressionCardRules,
  memoryUpdateRules,
  mirrorRules,
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

type TaskName = keyof typeof taskPrompts;
const QUICK_PET_CHAT_PROMPT =
  "TinyBu desktop buddy. Reply in the user's language. Max 35 Chinese chars or 18 English words. No markdown.";

async function loadRequiredUserApiKey() {
  const apiKey = await loadUserApiKey();
  if (!apiKey) throw new Error("No user API key saved");
  return apiKey;
}

async function callOpenAi<T>(
  task: TaskName,
  payload: unknown,
  appState: AppStateRecord,
  providedApiKey?: string
): Promise<T> {
  const apiKey = providedApiKey ?? (await loadRequiredUserApiKey());

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: modelForTask(task, appState),
      instructions: taskPrompts[task],
      input: buildOpenAiInput(task, payload),
      text: {
        format: {
          type: "json_schema",
          ...jsonSchemas[task],
          strict: true
        }
      },
      max_output_tokens: task === "screenshotCapture" || task === "screenshotQuestion" ? 1600 : 900
    })
  });

  return parseOpenAiJson(response) as Promise<T>;
}

async function callOpenRouter<T>(
  task: TaskName,
  payload: unknown,
  appState: AppStateRecord,
  providedApiKey?: string
): Promise<T> {
  const apiKey = providedApiKey ?? (await loadRequiredUserApiKey());

  const baseUrl = (appState.settings.openRouterBaseUrl || "https://openrouter.ai/api/v1").replace(/\/+$/, "");
  const schema = jsonSchemas[task];
  const model = normalizeOpenRouterModel(modelForTask(task, appState));
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": window.location.origin,
      "X-Title": "TinyBu Desktop"
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: `${taskPrompts[task]}\nReturn only valid JSON.` },
        ...buildOpenRouterMessages(task, payload)
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: schema.name,
          strict: true,
          schema: schema.schema
        }
      },
      max_tokens: task === "screenshotCapture" || task === "screenshotQuestion" ? 1600 : 900
    })
  });

  return parseOpenAiJson(response) as Promise<T>;
}

async function callQuickPetChatOpenAi(
  payload: { message: string; [key: string]: unknown },
  appState: AppStateRecord,
  apiKey: string
): Promise<QuickPetChatOutput> {
  const response = await fetchWithTimeout(
    "https://api.openai.com/v1/responses",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: modelForTask("quickPetChat", appState),
        instructions: QUICK_PET_CHAT_PROMPT,
        input: String(payload.message),
        max_output_tokens: 70
      })
    },
    12000
  );

  return { reply: quickReplyText(await parseOpenAiText(response)) };
}

async function callQuickPetChatOpenRouter(
  payload: { message: string; [key: string]: unknown },
  appState: AppStateRecord,
  apiKey: string
): Promise<QuickPetChatOutput> {
  const baseUrl = (appState.settings.openRouterBaseUrl || "https://openrouter.ai/api/v1").replace(/\/+$/, "");
  const response = await fetchWithTimeout(
    `${baseUrl}/chat/completions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": window.location.origin,
        "X-Title": "TinyBu Desktop"
      },
      body: JSON.stringify({
        model: normalizeOpenRouterModel(modelForTask("quickPetChat", appState)),
        messages: [
          { role: "system", content: QUICK_PET_CHAT_PROMPT },
          { role: "user", content: String(payload.message) }
        ],
        max_tokens: 70,
        temperature: 0.35
      })
    },
    12000
  );

  return { reply: quickReplyText(await parseOpenAiText(response)) };
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

async function callQuickPetChatCloudProxy(
  payload: { message: string; [key: string]: unknown },
  appState: AppStateRecord
): Promise<QuickPetChatOutput> {
  const response = await fetchWithTimeout(
    appState.settings.cloudProxyUrl,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task: "quickPetChat",
        model: modelForTask("quickPetChat", appState),
        payload: {
          message: payload.message,
          fast: true
        }
      })
    },
    12000
  );

  return { reply: quickReplyText(await parseOpenAiText(response)) };
}

async function callUserKey<T>(task: TaskName, payload: unknown, appState: AppStateRecord) {
  const apiKey = await loadRequiredUserApiKey();
  return isOpenRouterApiKey(apiKey) || shouldUseOpenRouter(task, appState)
    ? callOpenRouter<T>(task, payload, appState, apiKey)
    : callOpenAi<T>(task, payload, appState, apiKey);
}

async function callCloudProxy<T>(
  task: TaskName,
  payload: unknown,
  appState: AppStateRecord
): Promise<T> {
  const response = await fetch(appState.settings.cloudProxyUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      task,
      model: modelForTask(task, appState),
      payload
    })
  });

  return parseOpenAiJson(response) as Promise<T>;
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
  const payload = {
    transcript: content.transcript.map((line) => line.text).join("\n"),
    level: appState.profile.level,
    targetLanguage: appState.profile.targetLanguage,
    nativeLanguage: appState.profile.nativeLanguage
  };

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

  const payload = {
    imageDataUrl: args.imageDataUrl,
    width: args.width,
    height: args.height,
    level: args.appState.profile.level,
    targetLanguage: args.appState.profile.targetLanguage,
    nativeLanguage: args.appState.profile.nativeLanguage
  };

  const recognition = await (args.appState.settings.aiProviderMode === "cloud-proxy"
    ? callCloudProxy("screenshotCapture", payload, args.appState)
    : callUserKey("screenshotCapture", payload, args.appState));

  return normalizeScreenshotRecognition(recognition);
}

export async function answerScreenshotQuestion(args: {
  question: string;
  screenshot: {
    imageDataUrl?: string;
    title: string;
    sourceText: string;
    summary?: string;
    screenType?: string;
    visibleText?: string[];
    errorMessages?: string[];
    interactiveElements?: string[];
  };
  appState: AppStateRecord;
}): Promise<ScreenshotQuestionOutput> {
  if (args.appState.settings.aiProviderMode === "rules") {
    return {
      answer: `我先根据截图文字回答：${args.screenshot.sourceText.slice(0, 220)}`,
      quotedText: args.screenshot.sourceText.slice(0, 120),
      nextAction: "切换到 API 模式后可以得到更完整的解释。"
    };
  }

  const visualQuestion = /右|左|上|下|按钮|图标|颜色|红色|蓝色|位置|where|button|icon|color|right|left/i.test(args.question);
  const payload = {
    question: args.question,
    title: args.screenshot.title,
    sourceText: args.screenshot.sourceText,
    summary: args.screenshot.summary,
    screenType: args.screenshot.screenType,
    visibleText: args.screenshot.visibleText ?? [],
    errorMessages: args.screenshot.errorMessages ?? [],
    interactiveElements: args.screenshot.interactiveElements ?? [],
    imageDataUrl: visualQuestion ? args.screenshot.imageDataUrl : undefined,
    nativeLanguage: args.appState.profile.nativeLanguage,
    targetLanguage: args.appState.profile.targetLanguage
  };

  return args.appState.settings.aiProviderMode === "cloud-proxy"
    ? callCloudProxy("screenshotQuestion", payload, args.appState)
    : callUserKey("screenshotQuestion", payload, args.appState);
}

export async function generateExpressionCard(
  sentence: string,
  content: ContentItem,
  appState: AppStateRecord
) {
  const payload = {
    sentence,
    context: content.summary,
    level: appState.profile.level,
    targetLanguage: appState.profile.targetLanguage,
    nativeLanguage: appState.profile.nativeLanguage
  };

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
  const payload = {
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
  const payload = {
    rescueType: type,
    currentQuestion,
    level: appState.profile.level,
    anxiety: appState.profile.anxiety
  };

  return withFallback(
    appState,
    () =>
      appState.settings.aiProviderMode === "cloud-proxy"
        ? callCloudProxy("rescue", payload, appState)
        : callUserKey("rescue", payload, appState),
    () => rescueRules(type, { question: currentQuestion, appState })
  );
}

export async function generateMirror(args: {
  sessionTitle: string;
  messages: TalkMessage[];
  expressions: ExpressionRecord[];
  appState: AppStateRecord;
}): Promise<MirrorOutput> {
  const payload = {
    sessionTitle: args.sessionTitle,
    messages: args.messages,
    expressions: args.expressions,
    level: args.appState.profile.level,
    nativeLanguage: args.appState.profile.nativeLanguage,
    targetLanguage: args.appState.profile.targetLanguage
  };

  return withFallback(
    args.appState,
    () =>
      args.appState.settings.aiProviderMode === "cloud-proxy"
        ? callCloudProxy("mirror", payload, args.appState)
        : callUserKey("mirror", payload, args.appState),
    () => mirrorRules(args)
  );
}

export async function updateMemory(args: {
  mirror: MirrorOutput;
  expressions: ExpressionRecord[];
  rescueUsed?: RescueType[];
  appState: AppStateRecord;
}): Promise<MemoryUpdateOutput> {
  const payload = {
    mirror: args.mirror,
    expressions: args.expressions,
    rescueUsed: args.rescueUsed ?? [],
    profile: args.appState.profile
  };

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
}): Promise<MirrorOutput> {
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
