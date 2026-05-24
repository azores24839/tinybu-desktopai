import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import ts from "typescript";
import {
  isAnthropicCompatibleModel,
  normalizeAnthropicModel,
  normalizeOpenRouterModel,
  shouldUseOpenRouterModel
} from "../apps/api/providerRouting.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const retiredProductNamePattern = /\b(?:NOMI|Nomi|nomi|NORI|Nori|nori|Mirror|mirror)[A-Za-z0-9_-]*/g;
const ignoredRetiredNameDirs = new Set([".git", "dist", "node_modules", "src-tauri/target"]);

async function loadTsModule(relativePath) {
  const filePath = resolve(root, relativePath);
  const source = await readFile(filePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX
    },
    fileName: filePath
  }).outputText;

  return import(`data:text/javascript;base64,${Buffer.from(`${output}\n//# sourceURL=${pathToFileURL(filePath).href}`).toString("base64")}`);
}

async function listProjectFiles(dir = root, prefix = "") {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (!ignoredRetiredNameDirs.has(relativePath) && !ignoredRetiredNameDirs.has(entry.name)) {
        files.push(...(await listProjectFiles(resolve(dir, entry.name), relativePath)));
      }
      continue;
    }
    if (/\.(?:ts|tsx|js|mjs|json|html|css|md|rs)$/.test(entry.name) && relativePath !== "test/regression.test.mjs") {
      files.push(relativePath);
    }
  }
  return files;
}

test("retired product names are absent from project files", async () => {
  const files = await listProjectFiles();
  const violations = [];

  for (const relativePath of files) {
    const source = await readFile(resolve(root, relativePath), "utf8");
    for (const match of source.matchAll(retiredProductNamePattern)) {
      violations.push(`${relativePath}: ${match[0]}`);
    }
  }

  assert.deepEqual(violations, []);
});

test("provider routing keeps MiniMax on Anthropic-compatible when user token exists", () => {
  assert.equal(normalizeOpenRouterModel("MiniMax-M2.7"), "minimax/minimax-m2.7");
  assert.equal(normalizeAnthropicModel("minimax/minimax-m2.7"), "MiniMax-M2.7");
  assert.equal(isAnthropicCompatibleModel("minimax/minimax-m2.7"), true);
  assert.equal(shouldUseOpenRouterModel("minimax/minimax-m2.7", { anthropicAuthToken: "user-minimax-key" }), false);
});

test("provider routing sends provider-qualified Qwen models to OpenRouter", () => {
  assert.equal(shouldUseOpenRouterModel("qwen/qwen-vl-max", { anthropicAuthToken: "user-minimax-key" }), true);
  assert.equal(shouldUseOpenRouterModel("openai/gpt-4o-mini", { anthropicAuthToken: "user-minimax-key" }), true);
});

test("frontend provider routing picks task models and OpenRouter mode predictably", async () => {
  const { isOpenRouterApiKey, modelForTask, normalizeOpenRouterModel, shouldUseOpenRouter } = await loadTsModule("src/ai/providerRouting.ts");
  const appState = {
    settings: {
      aiModel: "MiniMax-M2.7",
      visionModel: "qwen/qwen-vl-max",
      openRouterBaseUrl: "https://openrouter.ai/api/v1"
    }
  };

  assert.equal(modelForTask("practiceQuestions", appState), "MiniMax-M2.7");
  assert.equal(modelForTask("screenshotCapture", appState), "qwen/qwen-vl-max");
  assert.equal(normalizeOpenRouterModel("MiniMax-M2.7"), "minimax/minimax-m2.7");
  assert.equal(isOpenRouterApiKey(" sk-or-test "), true);
  assert.equal(shouldUseOpenRouter("practiceQuestions", appState), false);
  assert.equal(shouldUseOpenRouter("screenshotCapture", appState), true);
});

test("AI response parsing handles wrapped JSON, compact replies, and screenshot OCR aliases", async () => {
  const { extractJsonText, normalizeScreenshotRecognition, parseJsonValue, quickReplyText } = await loadTsModule("src/ai/responseParsing.ts");

  assert.equal(extractJsonText("```json\n{\"topic\":\"food\"}\n```"), "{\"topic\":\"food\"}");
  assert.deepEqual(parseJsonValue("\"{\\\"topic\\\":\\\"food\\\"}\""), { topic: "food" });

  const compact = quickReplyText(" hello    world ".repeat(10));
  assert.equal(compact.length, 91);
  assert.equal(compact.endsWith("..."), true);

  const recognition = normalizeScreenshotRecognition({
    screenshot_capture: {
      title: "Dialog",
      ocr_text: "保存失败",
      language: "zh",
      screen_type: "error dialog",
      error_messages: ["保存失败"],
      interactive_elements: ["重试"]
    }
  });
  assert.equal(recognition.text, "保存失败");
  assert.deepEqual(recognition.visibleText, ["保存失败"]);
  assert.deepEqual(recognition.errorMessages, ["保存失败"]);
  assert.deepEqual(recognition.interactiveElements, ["重试"]);
});

test("AI request builders preserve text payloads and screenshot image inputs", async () => {
  const { buildOpenAiInput, buildOpenRouterMessages } = await loadTsModule("src/ai/requestBuilders.ts");

  assert.equal(buildOpenAiInput("practiceQuestions", { topic: "travel" }), "{\"topic\":\"travel\"}");
  assert.deepEqual(buildOpenRouterMessages("practiceQuestions", { topic: "travel" }), [
    { role: "user", content: "{\"topic\":\"travel\"}" }
  ]);

  const imageDataUrl = "data:image/png;base64,abc";
  const openAiInput = buildOpenAiInput("screenshotCapture", { imageDataUrl, width: 10, height: 20 });
  assert.equal(openAiInput[0].content[0].type, "input_text");
  assert.equal(JSON.parse(openAiInput[0].content[0].text).width, 10);
  assert.match(JSON.parse(openAiInput[0].content[0].text).instruction, /OCR every readable text/);
  assert.deepEqual(openAiInput[0].content[1], { type: "input_image", image_url: imageDataUrl, detail: "high" });

  const openRouterMessages = buildOpenRouterMessages("screenshotQuestion", { imageDataUrl, question: "What is this?" });
  assert.equal(openRouterMessages[0].content[0].type, "text");
  assert.match(JSON.parse(openRouterMessages[0].content[0].text).instruction, /Answer the user's question/);
  assert.deepEqual(openRouterMessages[0].content[1], { type: "image_url", image_url: { url: imageDataUrl, detail: "high" } });
});

test("screenshot AI payloads only include images for visual layout questions", async () => {
  const { buildScreenshotCapturePayload, buildScreenshotQuestionPayload, isVisualScreenshotQuestion } = await loadTsModule("src/ai/screenshotPayloads.ts");
  const appState = {
    profile: {
      level: "B1",
      nativeLanguage: "中文",
      targetLanguage: "English"
    }
  };
  const imageDataUrl = "data:image/png;base64,abc";

  assert.deepEqual(buildScreenshotCapturePayload({ imageDataUrl, width: 320, height: 180, appState }), {
    imageDataUrl,
    width: 320,
    height: 180,
    level: "B1",
    targetLanguage: "English",
    nativeLanguage: "中文"
  });

  assert.equal(isVisualScreenshotQuestion("右上角的按钮是什么？"), true);
  assert.equal(isVisualScreenshotQuestion("这段文字是什么意思？"), false);

  const screenshot = {
    imageDataUrl,
    title: "Screenshot",
    sourceText: "保存失败",
    visibleText: ["保存失败"]
  };
  assert.equal(buildScreenshotQuestionPayload({ question: "右上角的按钮是什么？", screenshot, appState }).imageDataUrl, imageDataUrl);
  assert.equal(buildScreenshotQuestionPayload({ question: "这段文字是什么意思？", screenshot, appState }).imageDataUrl, undefined);
});

test("content understanding payload preserves transcript and learner language profile", async () => {
  const { buildContentUnderstandingPayload } = await loadTsModule("src/ai/taskPayloads.ts");
  const appState = {
    profile: {
      level: "A2",
      nativeLanguage: "中文",
      targetLanguage: "English"
    }
  };
  const content = {
    transcript: [{ text: "Where is the station?" }, { text: "It is near the park." }]
  };

  assert.deepEqual(buildContentUnderstandingPayload(content, appState), {
    transcript: "Where is the station?\nIt is near the park.",
    level: "A2",
    targetLanguage: "English",
    nativeLanguage: "中文"
  });
});

test("screenshot confirmation is only available while image data and OCR text are present", async () => {
  const { canConfirmScreenshotText } = await loadTsModule("src/features/screenshots/screenshotUtils.ts");
  const capture = {
    screenshot: {
      imageDataUrl: "data:image/png;base64,abc",
      visibleText: ["Hello"]
    }
  };

  assert.equal(canConfirmScreenshotText(capture), true);
  assert.equal(canConfirmScreenshotText({ screenshot: { visibleText: ["Hello"] } }), false);
  assert.equal(canConfirmScreenshotText({ screenshot: { imageDataUrl: "data:image/png;base64,abc", visibleText: [] } }), false);
});

test("practice utils prefer selected or recommended fragments before fallback fragments", async () => {
  const { selectPracticeFragments } = await loadTsModule("src/features/practice/practiceUtils.ts");
  const captures = [
    {
      fragments: [
        { id: "a", text: "A", selected: false, recommended: false },
        { id: "b", text: "B", selected: true, recommended: false }
      ]
    },
    {
      fragments: [{ id: "c", text: "C", selected: false, recommended: true }]
    }
  ];

  assert.deepEqual(
    selectPracticeFragments(captures).map((fragment) => fragment.id),
    ["b", "c"]
  );

  assert.deepEqual(
    selectPracticeFragments([{ fragments: Array.from({ length: 8 }, (_, index) => ({ id: `f${index}` })) }]).map((fragment) => fragment.id),
    ["f0", "f1", "f2", "f3", "f4", "f5"]
  );
});

test("practice chat completion marks the topic and source captures practiced", async () => {
  const { buildPracticeChatCompletion } = await loadTsModule("src/features/practice/practiceUtils.ts");
  const practicedAt = "2026-05-13T08:00:00.000Z";
  const topic = {
    id: "topic-1",
    name: "Travel",
    captureIds: ["capture-1"],
    status: "in-progress",
    lastPracticedAt: undefined,
    updatedAt: "2026-05-12T00:00:00.000Z"
  };
  const captures = [
    { id: "capture-1", status: "studied", fragments: [] },
    { id: "capture-2", status: "in-topic", fragments: [] }
  ];

  const result = buildPracticeChatCompletion({ topic, capturesForTopic: captures, practicedAt });

  assert.equal(result.nextTopic.status, "practiced");
  assert.equal(result.nextTopic.lastPracticedAt, practicedAt);
  assert.equal(result.nextTopic.updatedAt, practicedAt);
  assert.deepEqual(result.updatedCaptures.map((capture) => capture.status), ["practiced", "practiced"]);
});

test("today practice tasks always provide a lightweight starting point", async () => {
  const { buildTodayPracticeTasks } = await loadTsModule("src/features/practice/practiceTasks.ts");
  const profile = { interfaceLanguage: "中文", targetLanguage: "English" };

  const tasks = buildTodayPracticeTasks({ captures: [], memories: [], profile, limit: 3 });

  assert.equal(tasks.length, 3);
  assert.deepEqual(tasks.map((task) => task.taskType), ["tinybu-material", "scenario", "open-chat"]);
  assert.ok(tasks.every((task) => task.title && task.description && task.targetGoal && task.starterQuestion));
});

test("capture-based practice tasks only use suitable saved content", async () => {
  const { buildTodayPracticeTasks, isCapturePracticeReady, practiceTaskToFragments } = await loadTsModule("src/features/practice/practiceTasks.ts");
  const profile = { interfaceLanguage: "English", targetLanguage: "English" };
  const shortCapture = {
    id: "short",
    title: "Short",
    status: "suggested",
    capturedAt: "2026-05-20T01:00:00.000Z",
    fragments: [{ text: "Too short" }]
  };
  const usefulCapture = {
    id: "useful",
    title: "Useful",
    topic: "AI learning",
    summary: "A short idea about learning with AI.",
    status: "suggested",
    capturedAt: "2026-05-20T02:00:00.000Z",
    fragments: [
      {
        text: "AI learning tools are useful when they help people express their own ideas, not only translate sentences.",
        selected: true,
        recommended: true
      }
    ]
  };

  assert.equal(isCapturePracticeReady(shortCapture), false);
  assert.equal(isCapturePracticeReady(usefulCapture), true);

  const tasks = buildTodayPracticeTasks({ captures: [shortCapture, usefulCapture], memories: [], profile, limit: 3 });
  assert.equal(tasks[0].taskType, "capture-based");
  assert.equal(tasks[0].sourceCaptureId, "useful");
  assert.equal(practiceTaskToFragments(tasks[0])[0].selected, true);
});

test("review v2 schema requires status, strength, next focus, and why", async () => {
  const { jsonSchemas } = await loadTsModule("src/ai/prompts.ts");
  const schema = jsonSchemas.practiceChatReview.schema;

  assert.equal(["expressionStatus", "strength", "nextFocus", "why"].every((field) => schema.required.includes(field)), true);
  assert.equal(schema.properties.why.minItems, 1);
  assert.equal(schema.properties.why.maxItems, 3);
});

test("review diagnostics maps expression status and lowers confidence for short practice", async () => {
  const { expressionStatusLabel, extractPracticeReviewFeatures } = await loadTsModule("src/features/practice/practiceReviewDiagnostics.ts");

  assert.equal(expressionStatusLabel(38, "中文"), "还在热身");
  assert.equal(expressionStatusLabel(52, "中文"), "开始接住了");
  assert.equal(expressionStatusLabel(72, "中文"), "表达变清楚了");
  assert.equal(expressionStatusLabel(88, "中文"), "很有状态");

  const features = extractPracticeReviewFeatures({
    messages: [{ id: "u1", role: "user", text: "I am tired.", createdAt: "2026-05-22T00:00:00.000Z" }],
    whatToCover: ["state", "reason"],
    completedFocusItemIds: [],
    targetChunks: [],
    interfaceLanguage: "中文"
  });

  assert.equal(features.confidence, "low");
  assert.equal(features.why.length >= 1, true);
});

test("rules fallback returns complete review v2 fields", async () => {
  const { practiceChatReviewRules } = await loadTsModule("src/ai/rules.ts");
  const output = practiceChatReviewRules({
    topicName: "Small talk",
    practiceGoal: "Explain one idea",
    whatToCover: ["state", "reason"],
    chatMessages: [
      { id: "b1", role: "bu", text: "How are you?", createdAt: "2026-05-22T00:00:00.000Z" },
      { id: "u1", role: "user", text: "I feel tired because I slept late.", createdAt: "2026-05-22T00:00:01.000Z" }
    ],
    targetLanguage: "English",
    nativeLanguage: "中文",
    appState: {
      profile: {
        interfaceLanguage: "中文"
      }
    }
  });

  assert.equal(typeof output.expressionStatus.score, "number");
  assert.equal(output.expressionStatus.confidence, "low");
  assert.equal(typeof output.strength.label, "string");
  assert.equal(typeof output.nextFocus.practiceMove, "string");
  assert.equal(output.why.length >= 1, true);
  assert.equal(typeof output.dimensionSignals.taskCompletion, "number");
});

test("review page keeps legacy records compatible and labels evidence section as Why", async () => {
  const source = await readFile(resolve(root, "src/features/practice/PracticeReviewPage.tsx"), "utf8");

  assert.match(source, /review\.expressionStatus && review\.strength && review\.nextFocus/);
  assert.match(source, /<h3>Why<\/h3>/);
  assert.doesNotMatch(source, />Evidence</);
});
