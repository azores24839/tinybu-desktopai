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
  RescueOutput,
  RescueType,
  ScreenshotRecognitionOutput,
  ScreenshotQuestionOutput,
  TalkMessage,
  TalkTurnOutput
} from "../types";
import { loadUserApiKey } from "../lib/secureKey";
import { jsonSchemas, taskPrompts } from "./prompts";
import {
  expressionCardRules,
  memoryUpdateRules,
  mirrorRules,
  practiceQuestionsRules,
  practiceTipRules,
  practiceTurnRules,
  recommendFragmentsRules,
  reviewRules,
  rescueRules,
  talkTurnRules,
  understandContentRules
} from "./rules";

type TaskName = keyof typeof taskPrompts;
type ImageTaskPayload = { imageDataUrl?: string; [key: string]: unknown };

function modelForTask(task: TaskName, appState: AppStateRecord) {
  return task === "screenshotCapture" || task === "screenshotQuestion"
    ? appState.settings.visionModel || appState.settings.aiModel
    : appState.settings.aiModel;
}

function buildOpenAiInput(task: TaskName, payload: unknown) {
  if (task !== "screenshotCapture" && task !== "screenshotQuestion") return JSON.stringify(payload);

  const screenshotPayload = payload as ImageTaskPayload;
  const { imageDataUrl, ...textPayload } = screenshotPayload;
  const content: Array<
    { type: "input_text"; text: string } | { type: "input_image"; image_url?: string; detail?: "high" }
  > = [
    {
      type: "input_text",
      text: JSON.stringify({
        ...textPayload,
        instruction:
          task === "screenshotCapture"
            ? "OCR every readable text string. Do not filter by usefulness or language."
            : "Answer the user's question about this screenshot."
      })
    }
  ];

  if (imageDataUrl) {
    content.push({
      type: "input_image",
      image_url: imageDataUrl,
      detail: "high"
    });
  }

  return [
    {
      role: "user",
      content
    }
  ];
}

function buildOpenRouterMessages(task: TaskName, payload: unknown) {
  if (task !== "screenshotCapture" && task !== "screenshotQuestion") {
    return [
      {
        role: "user",
        content: JSON.stringify(payload)
      }
    ];
  }

  const screenshotPayload = payload as ImageTaskPayload;
  const { imageDataUrl, ...textPayload } = screenshotPayload;
  const content: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string; detail: "high" } }> = [
    {
      type: "text",
      text: JSON.stringify({
        ...textPayload,
        instruction:
          task === "screenshotCapture"
            ? "OCR every readable text string. Do not filter by usefulness or language."
            : "Answer the user's question about this screenshot."
      })
    }
  ];

  if (imageDataUrl) {
    content.push({
      type: "image_url",
      image_url: { url: imageDataUrl, detail: "high" }
    });
  }

  return [
    {
      role: "user",
      content
    }
  ];
}

function extractJsonText(text = "") {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const objectStart = trimmed.indexOf("{");
  const arrayStart = trimmed.indexOf("[");
  const starts = [objectStart, arrayStart].filter((index) => index >= 0);
  if (!starts.length) return trimmed;

  const start = Math.min(...starts);
  const end = Math.max(trimmed.lastIndexOf("}"), trimmed.lastIndexOf("]"));
  return end > start ? trimmed.slice(start, end + 1) : trimmed;
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== "string") return value;

  const parsed = JSON.parse(extractJsonText(value));
  return typeof parsed === "string" ? parseJsonValue(parsed) : parsed;
}

async function parseOpenAiJson(response: Response) {
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.message || data?.error || `AI request failed: ${response.status}`);
  }

  const messageContent = data.choices?.[0]?.message?.content;
  const messageContentText = Array.isArray(messageContent)
    ? messageContent.find((content: { type?: string }) => content.type === "text")?.text
    : messageContent;
  const outputText =
    data.output_text ??
    data.output
      ?.flatMap((item: { content?: Array<{ type?: string; text?: string }> }) => item.content ?? [])
      ?.find((content: { type?: string }) => content.type === "output_text")?.text ??
    messageContentText;

  if (!outputText) {
    throw new Error("AI response did not contain output text");
  }

  return parseJsonValue(outputText);
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? "").trim()).filter(Boolean);
}

function normalizeScreenshotRecognition(value: unknown): ScreenshotRecognitionOutput {
  const rawRecord = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const record =
    rawRecord.screenshot_capture && typeof rawRecord.screenshot_capture === "object"
      ? (rawRecord.screenshot_capture as Record<string, unknown>)
      : rawRecord;
  const visibleText = asStringArray(record.visibleText ?? record.visible_text ?? record.ocrText ?? record.ocr_text);
  const text =
    String(record.text ?? record.ocrText ?? record.ocr_text ?? visibleText.join("\n") ?? "")
      .trim();

  if (!text) {
    throw new Error("没有识别到文字。请确认截图区域包含清晰文字，或稍后重试。");
  }

  return {
    title: String(record.title ?? "Screenshot Capture"),
    text,
    language: String(record.language ?? "Unknown"),
    contextNote: String(record.contextNote ?? record.context_note ?? ""),
    screenType: String(record.screenType ?? record.screen_type ?? "Screenshot"),
    visibleText: visibleText.length ? visibleText : [text],
    errorMessages: asStringArray(record.errorMessages ?? record.error_messages),
    interactiveElements: asStringArray(record.interactiveElements ?? record.interactive_elements)
  };
}

async function callOpenAi<T>(
  task: TaskName,
  payload: unknown,
  appState: AppStateRecord
): Promise<T> {
  const apiKey = await loadUserApiKey();
  if (!apiKey) throw new Error("No user API key saved");

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
  appState: AppStateRecord
): Promise<T> {
  const apiKey = await loadUserApiKey();
  if (!apiKey) throw new Error("No user API key saved");

  const baseUrl = (appState.settings.openRouterBaseUrl || "https://openrouter.ai/api/v1").replace(/\/+$/, "");
  const schema = jsonSchemas[task];
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": window.location.origin,
      "X-Title": "TinyBu Desktop"
    },
    body: JSON.stringify({
      model: modelForTask(task, appState),
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

function shouldUseOpenRouter(task: TaskName, appState: AppStateRecord) {
  const baseUrl = appState.settings.openRouterBaseUrl;
  return Boolean(baseUrl) && modelForTask(task, appState).includes("/");
}

function callUserKey<T>(task: TaskName, payload: unknown, appState: AppStateRecord) {
  return shouldUseOpenRouter(task, appState) ? callOpenRouter<T>(task, payload, appState) : callOpenAi<T>(task, payload, appState);
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
