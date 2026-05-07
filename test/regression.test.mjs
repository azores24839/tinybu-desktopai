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
const legacyNamePattern = /\b(?:NOMI|Nomi|nomi|NORI|Nori|nori|Mirror|mirror)[A-Za-z0-9_-]*/g;
const ignoredLegacyNameDirs = new Set([".git", "dist", "node_modules", "src-tauri/target"]);
const legacyNameAllowlist = new Map([
  ["apps/api/server.mjs", new Set(["nomi"])],
  ["docs/current-core-capabilities.md", new Set(["nomiCapture", "mirrorCards", "Mirror"])],
  ["docs/ui-function-inventory.md", new Set(["nomiCapture"])],
  ["src/App.tsx", new Set(["nomiCapture", "NOMI_CAPTURE"])],
  ["src/lib/db.ts", new Set(["nomi-desktop", "mirrorCards"])],
  ["src/lib/secureKey.ts", new Set(["nomi-dev-openai-key"])]
]);

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
      if (!ignoredLegacyNameDirs.has(relativePath) && !ignoredLegacyNameDirs.has(entry.name)) {
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

test("legacy Nomi, Nori, and Mirror names stay confined to compatibility allowlist", async () => {
  const files = await listProjectFiles();
  const violations = [];

  for (const relativePath of files) {
    const source = await readFile(resolve(root, relativePath), "utf8");
    const allowed = legacyNameAllowlist.get(relativePath) ?? new Set();
    for (const match of source.matchAll(legacyNamePattern)) {
      const token = match[0];
      if (!allowed.has(token)) {
        violations.push(`${relativePath}: ${token}`);
      }
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

test("general AI task payloads preserve transcript, context, and learner profile", async () => {
  const {
    buildContentUnderstandingPayload,
    buildExpressionCardPayload,
    buildMemoryPayload,
    buildReviewPayload,
    buildRescuePayload,
    buildTalkTurnPayload
  } = await loadTsModule("src/ai/taskPayloads.ts");
  const appState = {
    profile: {
      level: "A2",
      nativeLanguage: "中文",
      targetLanguage: "English",
      anxiety: 4,
      supportPreference: "gentle"
    }
  };
  const messages = [{ role: "user", text: "Where is the station?" }];
  const expressions = [
    { original: "near the park", pattern: "near ..." },
    { original: "go straight", pattern: "go straight" }
  ];
  const content = {
    id: "content-1",
    title: "Travel clip",
    summary: "A short travel conversation.",
    transcript: [{ text: "Where is the station?" }, { text: "It is near the park." }]
  };

  assert.deepEqual(buildContentUnderstandingPayload(content, appState), {
    transcript: "Where is the station?\nIt is near the park.",
    level: "A2",
    targetLanguage: "English",
    nativeLanguage: "中文"
  });
  assert.deepEqual(buildExpressionCardPayload("near the park", content, appState), {
    sentence: "near the park",
    context: "A short travel conversation.",
    level: "A2",
    targetLanguage: "English",
    nativeLanguage: "中文"
  });
  assert.deepEqual(
    buildTalkTurnPayload({
      answer: "I think it is nearby.",
      messages,
      content,
      expressions,
      appState
    }),
    {
      answer: "I think it is nearby.",
      messages,
      contentSummary: "A short travel conversation.",
      capturedExpressions: expressions,
      level: "A2",
      anxiety: 4,
      supportPreference: "gentle"
    }
  );
  assert.deepEqual(buildRescuePayload("hint", "How should I answer?", appState), {
    rescueType: "hint",
    currentQuestion: "How should I answer?",
    level: "A2",
    anxiety: 4
  });
  assert.deepEqual(
    buildReviewPayload({
      sessionTitle: "Travel practice",
      messages,
      expressions,
      appState
    }),
    {
      sessionTitle: "Travel practice",
      messages,
      expressions,
      level: "A2",
      nativeLanguage: "中文",
      targetLanguage: "English"
    }
  );

  const review = {
    talkedAbout: "Finding the station",
    didWell: ["Clear intent"],
    naturalExpressions: [],
    savedExpressions: [],
    nextPractice: "Ask for directions again."
  };
  assert.deepEqual(buildMemoryPayload({ review, expressions, appState }), {
    review,
    expressions,
    rescueUsed: [],
    profile: appState.profile
  });
  assert.deepEqual(buildMemoryPayload({ review, expressions, rescueUsed: ["hint"], appState }).rescueUsed, ["hint"]);
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

test("practice utils build completed review records without changing flow state outside inputs", async () => {
  const {
    buildCompletedPracticeSession,
    buildPracticedCaptures,
    buildPracticedTopic,
    buildPracticeReviewRecord,
    buildSavedPracticeExpressions,
    selectPracticeReviewFragments
  } = await loadTsModule("src/features/practice/practiceUtils.ts");
  const now = () => "2026-05-07T00:00:00.000Z";
  const topic = { id: "topic-1", name: "Travel", captureIds: ["capture-1"], savedExpressionCount: 2 };
  const captures = [{ id: "capture-1", status: "studied", fragments: [{ id: "frag-1" }, { id: "frag-2" }] }];
  const session = { id: "session-1", selectedFragmentIds: ["frag-2"], answers: [], status: "active" };
  const reviewOutput = {
    talkedAbout: "Travel plans",
    didWell: ["Clear idea"],
    naturalExpressions: [{ original: "I go", improved: "I am going" }],
    savedExpressions: [
      {
        original: "I am going",
        meaning: "future plan",
        keywords: ["plan"],
        pattern: "I am going to...",
        scene: "travel",
        practiceStem: "I am going to..."
      }
    ],
    nextPractice: "Talk about the next trip"
  };

  assert.deepEqual(selectPracticeReviewFragments(captures, session.selectedFragmentIds).map((fragment) => fragment.id), ["frag-2"]);

  const savedExpressions = buildSavedPracticeExpressions({
    reviewOutput,
    topic,
    createId: () => "expression-1",
    now
  });
  assert.equal(savedExpressions[0].sourceContentId, "capture-1");
  assert.equal(savedExpressions[0].category, "need-practice");

  const review = buildPracticeReviewRecord({
    reviewOutput,
    session,
    savedExpressions,
    createId: () => "review-1",
    now
  });
  assert.deepEqual(review.savedExpressionIds, ["expression-1"]);

  const completedSession = buildCompletedPracticeSession({
    session,
    answers: [{ id: "answer-1" }],
    review,
    now
  });
  assert.equal(completedSession.status, "completed");
  assert.equal(completedSession.reviewId, "review-1");

  assert.equal(buildPracticedCaptures(captures)[0].status, "practiced");
  assert.equal(buildPracticedTopic({ topic, savedExpressionCount: savedExpressions.length, now }).savedExpressionCount, 3);
});
