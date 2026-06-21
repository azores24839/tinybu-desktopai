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
import { quickPetChatPrompt, schemaFor, taskPrompts as apiTaskPrompts } from "../apps/api/taskSchemas.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const retiredProductNamePattern = /\b(?:NOMI|Nomi|nomi|NORI|Nori|nori|Mirror|mirror)[A-Za-z0-9_-]*/g;
const ignoredRetiredNameDirs = new Set([
  ".git",
  "dist",
  "node_modules",
  "src-tauri/bin",
  "src-tauri/swift-build",
  "src-tauri/target",
  "src-tauri/target-check"
]);
const tsModuleUrlCache = new Map();

async function resolveTsImport(fromFile, specifier) {
  const basePath = resolve(dirname(fromFile), specifier);
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.js`,
    `${basePath}.mjs`,
    resolve(basePath, "index.ts"),
    resolve(basePath, "index.tsx")
  ];

  for (const candidate of candidates) {
    try {
      await readFile(candidate, "utf8");
      return candidate;
    } catch {
      // Keep checking extension fallbacks.
    }
  }

  throw new Error(`Unable to resolve ${specifier} from ${fromFile}`);
}

async function tsModuleUrl(filePath) {
  if (tsModuleUrlCache.has(filePath)) return tsModuleUrlCache.get(filePath);

  const moduleUrlPromise = (async () => {
    const source = await readFile(filePath, "utf8");
    let output = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ES2022,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX
      },
      fileName: filePath
    }).outputText;

    const specifiers = new Set();
    for (const match of output.matchAll(/(?:from\s*["']([^"']+)["'])|(?:import\s*\(\s*["']([^"']+)["']\s*\))/g)) {
      const specifier = match[1] || match[2];
      if (specifier?.startsWith(".")) specifiers.add(specifier);
    }

    for (const specifier of specifiers) {
      const dependencyPath = await resolveTsImport(filePath, specifier);
      const dependencyUrl = await tsModuleUrl(dependencyPath);
      output = output
        .replaceAll(`from "${specifier}"`, `from "${dependencyUrl}"`)
        .replaceAll(`from '${specifier}'`, `from '${dependencyUrl}'`)
        .replaceAll(`import("${specifier}")`, `import("${dependencyUrl}")`)
        .replaceAll(`import('${specifier}')`, `import("${dependencyUrl}")`);
    }

    return `data:text/javascript;base64,${Buffer.from(`${output}\n//# sourceURL=${pathToFileURL(filePath).href}`).toString("base64")}`;
  })();

  tsModuleUrlCache.set(filePath, moduleUrlPromise);
  return moduleUrlPromise;
}

async function loadTsModule(relativePath) {
  const filePath = resolve(root, relativePath);
  return import(await tsModuleUrl(filePath));
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

test("desktop companion mode defaults to pet and bundles only the native Swift notch sidecar", async () => {
  const { defaultSettings } = await loadTsModule("src/lib/defaults.ts");
  const tauriConfig = JSON.parse(await readFile(resolve(root, "src-tauri/tauri.conf.json"), "utf8"));
  const macConfig = JSON.parse(await readFile(resolve(root, "src-tauri/tauri.macos.conf.json"), "utf8"));
  const settingsSource = await readFile(resolve(root, "src/features/settings/SettingsPage.tsx"), "utf8");

  assert.equal(defaultSettings.desktopCompanionMode, "pet");
  assert.deepEqual(
    tauriConfig.app.windows.map((window) => window.label),
    ["main", "pet"]
  );
  assert.deepEqual(macConfig.bundle.externalBin, ["bin/tinybu-notch"]);
  assert.equal(macConfig.bundle.resources["../native/notch-prototype/Assets/islandpet.png"], "islandpet.png");
  assert.equal(macConfig.bundle.resources["../native/notch-prototype/Assets/loading.gif"], "loading.gif");
  assert.match(settingsSource, /\["pet", "swift-notch"\]/);
  assert.doesNotMatch(settingsSource, /view=notch|NotchApp/);
});

test("Swift notch visual questions use correlated sidecar IPC and native permissions", async () => {
  const swiftSource = await readFile(
    resolve(root, "native/notch-prototype/Sources/TinyBuNotchPrototype/main.swift"),
    "utf8"
  );
  const rustSource = await readFile(resolve(root, "src-tauri/src/lib.rs"), "utf8");
  const appSource = await readFile(resolve(root, "src/App.tsx"), "utf8");
  const captureFlowSource = await readFile(resolve(root, "src/features/screenshots/useScreenshotCaptureFlow.ts"), "utf8");
  const secureKeySource = await readFile(resolve(root, "src/lib/secureKey.ts"), "utf8");
  const infoPlist = await readFile(resolve(root, "src-tauri/Info.plist"), "utf8");
  const entitlements = await readFile(resolve(root, "src-tauri/Entitlements.plist"), "utf8");

  assert.match(swiftSource, /HandlerButton\(title: "TinyBu"/);
  assert.match(swiftSource, /HandlerButton\(title: "Tray"/);
  assert.match(swiftSource, /let detailInset = expanded \? 70\.0 : 30\.0/);
  assert.match(swiftSource, /guard let hitView = super\.hitTest\(point\)/);
  assert.match(swiftSource, /final class PassthroughContainerView: NSView/);
  assert.match(swiftSource, /final class PassthroughStackView: NSStackView/);
  assert.match(swiftSource, /return containsInteractionShape\(point\) \? self : nil/);
  assert.doesNotMatch(swiftSource, /let localPoint = convert\(point, from: superview\)/);
  assert.match(swiftSource, /if !expanded \{\s+onToggle\?\(\)/);
  assert.match(swiftSource, /shapeRect\(expanded: false\)\.insetBy\(dx: -8, dy: -8\)/);
  assert.match(swiftSource, /"captureCurrentDisplay"/);
  assert.match(swiftSource, /"screenshotCaptured"/);
  assert.match(swiftSource, /VNRecognizeTextRequest/);
  assert.match(swiftSource, /"ocrCompleted"/);
  assert.match(swiftSource, /tinyBuOCRScrollView/);
  assert.match(swiftSource, /tinyBuProgress\.style = \.bar/);
  assert.match(swiftSource, /"saveClipboard"/);
  assert.match(swiftSource, /clipboardPromptGeneration/);
  assert.match(swiftSource, /HoverThumbnailView/);
  assert.match(swiftSource, /HandlerButton\(title: "×"/);
  assert.match(swiftSource, /dismissTinyBuResult/);
  assert.match(swiftSource, /islandPetView\.animates = true/);
  assert.match(swiftSource, /showStaticPet\(\)/);
  assert.match(swiftSource, /"askScreenshot"/);
  assert.match(rustSource, /SWIFT_NOTCH_IPC_PREFIX/);
  assert.match(rustSource, /active_jobs: HashSet<String>/);
  assert.match(rustSource, /local_ocr: Option<LocalOcrPayload>/);
  assert.match(rustSource, /sync_swift_notch_tray/);
  assert.match(rustSource, /SWIFT_NOTCH_CLIPBOARD_SAVE_EVENT/);
  assert.match(appSource, /navigateAfter: false/);
  assert.match(captureFlowSource, /createLocalOcrScreenshotCapture/);
  assert.doesNotMatch(secureKeySource, /localStorage\.setItem/);
  assert.match(infoPlist, /NSSpeechRecognitionUsageDescription/);
  assert.match(infoPlist, /NSMicrophoneUsageDescription/);
  assert.match(entitlements, /com\.apple\.security\.device\.audio-input/);
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

test("frontend and proxy keep critical AI task contracts aligned", async () => {
  const { jsonSchemas, taskPrompts } = await loadTsModule("src/ai/prompts.ts");

  assert.equal(apiTaskPrompts.quickPetChat, taskPrompts.quickPetChat);
  assert.equal(quickPetChatPrompt, taskPrompts.quickPetChat);

  for (const task of ["contentUnderstanding", "screenshotCapture", "screenshotQuestion", "quickPetChat"]) {
    assert.deepEqual(schemaFor(task), jsonSchemas[task]);
  }
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

test("local OCR captures expose readable text instead of a line-count status", async () => {
  const { createLocalOcrScreenshotCapture } = await loadTsModule("src/features/screenshots/screenshotCaptureRecords.ts");
  const capture = createLocalOcrScreenshotCapture({
    imageDataUrl: "data:image/jpeg;base64,abc",
    width: 1200,
    height: 800,
    capturedAt: "2026-06-21T00:00:00.000Z",
    localOcr: {
      text: "TinyBu settings\nAPI key is stored in Keychain",
      lines: ["TinyBu settings", "API key is stored in Keychain"],
      language: "en",
      truncated: false
    }
  });

  assert.equal(capture.sourceText, "TinyBu settings\nAPI key is stored in Keychain");
  assert.match(capture.summary, /TinyBu settings/);
  assert.doesNotMatch(capture.summary, /Recognized \d+ text lines/);
  assert.equal(capture.screenshot.ocrTruncated, false);
});

test("each explicit clipboard save creates an independent Inbox capture", async () => {
  const { createClipboardCaptureRecord } = await loadTsModule("src/features/captures/clipboardCaptureRecord.ts");
  const first = createClipboardCaptureRecord("Same copied text");
  const second = createClipboardCaptureRecord("Same copied text");
  const formatted = createClipboardCaptureRecord("\n  Keep this spacing  \n");

  assert.notEqual(first.id, second.id);
  assert.equal(first.sourceKind, "selection");
  assert.equal(first.sourceText, "Same copied text");
  assert.equal(first.fragments[0].text, "Same copied text");
  assert.equal(formatted.sourceText, "\n  Keep this spacing  \n");
  assert.equal(formatted.summary, "Keep this spacing");
});

test("Swift notch clipboard IPC preserves the complete copied text", async () => {
  const rustSource = await readFile(resolve(root, "src-tauri/src/lib.rs"), "utf8");
  const handlerStart = rustSource.indexOf("fn handle_swift_notch_command(");
  const saveStart = rustSource.indexOf("SwiftNotchCommand::SaveClipboard", handlerStart);
  const saveBranch = rustSource.slice(
    saveStart,
    rustSource.indexOf("SwiftNotchCommand::DeleteTrayCapture", saveStart)
  );

  assert.match(saveBranch, /if text\.trim\(\)\.is_empty\(\)/);
  assert.doesNotMatch(saveBranch, /let text = text\.trim\(\)\.to_string\(\)/);
  assert.match(saveBranch, /SwiftNotchClipboardSaveRequest \{ job_id, text \}/);
});

test("extension content bridge loads before the content script", async () => {
  const manifest = JSON.parse(await readFile(resolve(root, "apps/extension/manifest.json"), "utf8"));
  const contentScripts = manifest.content_scripts?.[0]?.js ?? [];
  const backgroundSource = await readFile(resolve(root, "apps/extension/background.js"), "utf8");
  const contentSource = await readFile(resolve(root, "apps/extension/content.js"), "utf8");

  assert.deepEqual(contentScripts, [
    "contentBridge.js",
    "contentExtractors.js",
    "contentMessaging.js",
    "contentSelection.js",
    "contentLayout.js",
    "contentCaptureActions.js",
    "contentRuntime.js",
    "contentViewHelpers.js",
    "contentFloatingStyles.js",
    "content.js"
  ]);
  assert.match(
    backgroundSource,
    /files:\s*\[\s*"contentBridge\.js",\s*"contentExtractors\.js",\s*"contentMessaging\.js",\s*"contentSelection\.js",\s*"contentLayout\.js",\s*"contentCaptureActions\.js",\s*"contentRuntime\.js",\s*"contentViewHelpers\.js",\s*"contentFloatingStyles\.js",\s*"content\.js"\s*\]/
  );
  assert.equal(contentSource.includes("basePayload("), false);
  assert.equal(contentSource.includes("innerHTML"), false);
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
    captureIds: ["capture-1", "capture-2"],
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

test("practice session builder prepares topic and task sources without UI state", async () => {
  const { buildTaskPracticeSession, buildTopicPracticeSession } = await loadTsModule("src/features/practice/practiceSessionBuilder.ts");
  const captures = [
    {
      id: "capture-1",
      title: "Travel note",
      summary: "A note about travel.",
      fragments: [
        { id: "f1", text: "I want to explain why train travel feels calmer.", selected: false, recommended: false },
        { id: "f2", text: "Taking the train gives me time to think before arriving.", selected: true, recommended: false }
      ]
    },
    {
      id: "capture-2",
      title: "Other",
      fragments: [{ id: "f3", text: "Not part of this topic.", selected: true, recommended: true }]
    }
  ];
  const topic = {
    id: "topic-1",
    name: "Travel",
    summary: "Talk about train travel.",
    captureIds: ["capture-1"],
    tags: [],
    practiceGoal: "Explain one travel preference",
    status: "new",
    savedExpressionCount: 0,
    createdAt: "2026-05-24T00:00:00.000Z",
    updatedAt: "2026-05-24T00:00:00.000Z"
  };
  const topicSession = buildTopicPracticeSession({ captures, fallbackQuestion: "What do you prefer?", topic });

  assert.equal(topicSession.source.kind, "topic");
  assert.equal(topicSession.source.title, "Travel");
  assert.deepEqual(topicSession.source.captures.map((capture) => capture.id), ["capture-1"]);
  assert.deepEqual(topicSession.fragments.map((fragment) => fragment.id), ["f2"]);
  assert.equal(buildTopicPracticeSession({ captures, fallbackQuestion: "Start?", topic: { ...topic, captureIds: [] } }), null);

  const taskSession = buildTaskPracticeSession({
    captures,
    task: {
      id: "task-1",
      title: "Capture task",
      description: "Use one saved capture.",
      taskType: "capture-based",
      sourceCaptureId: "capture-1",
      targetGoal: "Explain the saved idea",
      starterQuestion: "What did you notice?",
      status: "new",
      createdAt: "2026-05-24T00:00:00.000Z"
    }
  });

  assert.equal(taskSession.source.kind, "task");
  assert.deepEqual(taskSession.source.captures.map((capture) => capture.id), ["capture-1"]);
  assert.equal(taskSession.firstQuestion, "What did you notice?");
  assert.deepEqual(taskSession.fragments.map((fragment) => fragment.id), ["f2"]);
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

test("practice review record builder clamps scores and preserves review evidence", async () => {
  const { buildPracticeReviewRecord } = await loadTsModule("src/features/practice/practiceReviewBuilder.ts");
  const messages = [
    { id: "b1", role: "bu", text: "How are you?", createdAt: "2026-05-24T00:00:00.000Z" },
    { id: "u1", role: "user", text: "I feel tired because I slept late.", createdAt: "2026-05-24T00:00:01.000Z" },
    { id: "u2", role: "user", text: "I will take a short walk.", createdAt: "2026-05-24T00:00:02.000Z" }
  ];
  const review = buildPracticeReviewRecord({
    bookmarkedLines: ["I feel tired", "short walk"],
    completedFocusItemIds: ["focus-0"],
    focusItems: [{ id: "focus-0", label: "Explain how you feel", completed: true }],
    interfaceLanguage: "中文",
    messages,
    output: {
      diarySummary: "The learner explained tiredness and a next step.",
      taskOutcome: "completed",
      reviewScores: { taskCompletion: 80, clarity: 76, naturalness: 70 },
      betterExpressions: [{ original: "I slept late", improved: "I went to bed late", note: "More natural." }],
      savedWordsOrChunks: ["short walk", "take a short walk"],
      memoryTags: ["prefers gentle practice"],
      nextStep: "Practice one reason sentence.",
      expressionStatus: { score: 104.4, label: "", confidence: "high" },
      strength: { label: "Clear reason", detail: "The reason was easy to follow." },
      nextFocus: { label: "Add detail", practiceMove: "Add one concrete example." },
      why: ["Two user turns gave enough evidence."],
      dimensionSignals: { taskCompletion: 80, clarity: 76, naturalness: 70 }
    },
    reviewFeatures: { confidence: "medium", why: ["short practice"], userTurnCount: 2, totalWordCount: 13 },
    source: {
      kind: "task",
      task: { id: "task-1", title: "Daily check-in" },
      title: "Daily check-in",
      captures: [],
      practiceGoal: "Explain today's state"
    }
  });

  assert.equal(review.taskId, "task-1");
  assert.equal(review.messageCount, 3);
  assert.equal(review.userMessageCount, 2);
  assert.equal(review.expressionStatus.score, 100);
  assert.equal(review.expressionStatus.confidence, "medium");
  assert.equal(review.expressionStatus.label, "很有状态");
  assert.deepEqual(review.savedWordsOrChunks, ["I feel tired", "short walk", "take a short walk"]);
  assert.deepEqual(review.why, ["Two user turns gave enough evidence."]);
});

test("practice review generation args preserve source plan and language context", async () => {
  const { buildPracticeReviewGenerationArgs } = await loadTsModule("src/features/practice/practiceReviewGeneration.ts");
  const appState = {
    profile: {
      targetLanguage: "English",
      nativeLanguage: "中文",
      interfaceLanguage: "中文"
    }
  };
  const messages = [
    { id: "u1", role: "user", text: "I feel tired because I slept late.", createdAt: "2026-05-24T00:00:01.000Z" }
  ];
  const reviewFeatures = {
    userTurnCount: 1,
    totalWordCount: 7,
    averageWordsPerTurn: 7,
    longestTurnWordCount: 7,
    shortReplyRatio: 0,
    completedMoveCount: 1,
    targetMoveCount: 2,
    hasReason: true,
    hasExample: false,
    hasContrast: false,
    hasAction: false,
    usedTargetChunk: false,
    confidence: "low",
    suggestedScore: 56,
    suggestedLabel: "开始接住了",
    dimensionSignals: { taskCompletion: 55, clarity: 60, naturalness: 50 },
    why: [],
    segments: []
  };
  const args = buildPracticeReviewGenerationArgs({
    appState,
    messages,
    practicePlan: { practiceGoal: "Explain your state clearly", questions: [], whatToCover: [], languageBank: { usefulWords: [], usefulChunks: [] } },
    reviewFeatures,
    source: {
      kind: "topic",
      title: "Daily check-in",
      summary: "Talk about today.",
      practiceGoal: "Explain today",
      topic: { id: "topic-1" },
      captures: []
    },
    whatToCover: ["state", "reason"]
  });

  assert.equal(args.topicName, "Daily check-in");
  assert.equal(args.practiceGoal, "Explain your state clearly");
  assert.deepEqual(args.whatToCover, ["state", "reason"]);
  assert.deepEqual(args.chatMessages, messages);
  assert.equal(args.reviewFeatures, reviewFeatures);
  assert.equal(args.targetLanguage, "English");
  assert.equal(args.nativeLanguage, "中文");
});

test("practice review completion saves topic completion and used tasks", async () => {
  const { buildPracticeReviewCompletionArtifacts, savePracticeReviewCompletion } = await loadTsModule("src/features/practice/practiceReviewCompletion.ts");
  const topic = {
    id: "topic-1",
    name: "Travel",
    summary: "Talk about travel.",
    captureIds: ["capture-1", "capture-2"],
    tags: [],
    practiceGoal: "Explain a preference",
    status: "in-progress",
    savedExpressionCount: 0,
    createdAt: "2026-05-24T00:00:00.000Z",
    updatedAt: "2026-05-24T00:00:00.000Z"
  };
  const captures = [
    { id: "capture-1", status: "studied", fragments: [] },
    { id: "capture-2", status: "in-topic", fragments: [] }
  ];
  const review = {
    id: "review-1",
    topicId: "topic-1",
    createdAt: "2026-05-24T00:00:03.000Z",
    diarySummary: "Done.",
    completedFocusItemIds: [],
    focusItems: [],
    betterExpressions: [],
    savedWordsOrChunks: [],
    nextStep: "Try again.",
    messageCount: 2,
    userMessageCount: 1
  };
  const topicArtifacts = buildPracticeReviewCompletionArtifacts({
    captures,
    review,
    source: {
      kind: "topic",
      title: "Travel",
      summary: "Talk about travel.",
      practiceGoal: "Explain a preference",
      topic,
      captures
    }
  });

  assert.equal(topicArtifacts.nextTask, null);
  assert.equal(topicArtifacts.completion.nextTopic.status, "practiced");
  assert.deepEqual(topicArtifacts.completion.updatedCaptures.map((capture) => capture.status), ["practiced", "practiced"]);

  const taskArtifacts = buildPracticeReviewCompletionArtifacts({
    captures: [],
    review: { ...review, taskId: "task-1", topicId: undefined },
    source: {
      kind: "task",
      title: "Task",
      summary: "Task summary",
      practiceGoal: "Explain one idea",
      task: {
        id: "task-1",
        title: "Task",
        description: "Task summary",
        taskType: "open-chat",
        targetGoal: "Explain one idea",
        starterQuestion: "What do you think?",
        status: "new",
        createdAt: "2026-05-24T00:00:00.000Z"
      },
      captures: []
    }
  });
  assert.equal(taskArtifacts.completion, null);
  assert.equal(taskArtifacts.nextTask.status, "used");
  assert.equal(taskArtifacts.nextTask.usedAt, review.createdAt);

  const stored = { reviews: [], topics: [], captures: [], tasks: [], transactionCount: 0 };
  const db = {
    practiceChatReviews: { put: async (record) => stored.reviews.push(record) },
    topics: { put: async (record) => stored.topics.push(record) },
    captures: { bulkPut: async (records) => stored.captures.push(...records) },
    practiceTasks: { put: async (record) => stored.tasks.push(record) },
    transaction: async (_mode, _tables, callback) => {
      stored.transactionCount += 1;
      await callback();
    }
  };

  await savePracticeReviewCompletion({ db, review, artifacts: topicArtifacts });
  await savePracticeReviewCompletion({ db, review: { ...review, id: "review-2" }, artifacts: taskArtifacts });

  assert.equal(stored.transactionCount, 2);
  assert.deepEqual(stored.reviews.map((item) => item.id), ["review-1", "review-2"]);
  assert.deepEqual(stored.topics.map((item) => item.id), ["topic-1"]);
  assert.deepEqual(stored.captures.map((item) => item.id), ["capture-1", "capture-2"]);
  assert.deepEqual(stored.tasks.map((item) => item.id), ["task-1"]);
});

test("practice review persistence saves review expressions and memory atomically", async () => {
  const { computeFocusItems, savePracticeReviewArtifacts } = await loadTsModule("src/features/practice/practiceReviewPersistence.ts");
  const focusItems = computeFocusItems(
    ["Explain your tired state", "Mention a next step"],
    [
      { id: "b1", role: "bu", text: "What happened?", createdAt: "2026-05-24T00:00:00.000Z" },
      { id: "u1", role: "user", text: "I am tired, and my next step is taking a short walk.", createdAt: "2026-05-24T00:00:01.000Z" }
    ]
  );
  const stored = { reviews: [], memories: [], expressions: [], transactionCount: 0 };
  const db = {
    practiceChatReviews: { put: async (record) => stored.reviews.push(record) },
    memories: { put: async (record) => stored.memories.push(record) },
    expressions: { bulkPut: async (records) => stored.expressions.push(...records) },
    transaction: async (_mode, _tables, callback) => {
      stored.transactionCount += 1;
      await callback();
    }
  };
  const review = {
    id: "review-1",
    createdAt: "2026-05-24T00:00:03.000Z",
    diarySummary: "The learner explained a tired state.",
    taskOutcome: "completed",
    reviewScores: { taskCompletion: 80, clarity: 76, naturalness: 70 },
    completedFocusItemIds: ["focus-0", "focus-1"],
    focusItems,
    betterExpressions: [{ original: "I slept late", improved: "I went to bed late", note: "More natural." }],
    savedWordsOrChunks: ["short walk", "take a short walk"],
    memoryTags: ["likes walking breaks"],
    nextStep: "Practice one reason sentence.",
    messageCount: 2,
    userMessageCount: 1,
    expressionStatus: { score: 72, label: "表达变清楚了", confidence: "medium" },
    strength: { label: "Clear reason", detail: "The reason was easy to follow." },
    nextFocus: { label: "Add detail", practiceMove: "Add one concrete example." },
    why: ["The user included a state and next action."],
    dimensionSignals: { taskCompletion: 80, clarity: 76, naturalness: 70 }
  };

  const result = await savePracticeReviewArtifacts({ db, review, sourceTitle: "Daily check-in" });

  assert.deepEqual(focusItems.map((item) => item.completed), [true, true]);
  assert.equal(stored.transactionCount, 1);
  assert.deepEqual(stored.reviews.map((item) => item.id), ["review-1"]);
  assert.equal(stored.memories[0].body.includes("likes walking breaks"), true);
  assert.equal(stored.expressions.length, 2);
  assert.deepEqual(stored.expressions.map((item) => item.sourceContentId), ["review-1", "review-1"]);
  assert.deepEqual(result.expressionRecords.map((item) => item.scene), ["Daily check-in", "Daily check-in"]);
});

test("review page keeps legacy records compatible and labels evidence section as Why", async () => {
  const source = await readFile(resolve(root, "src/features/practice/PracticeReviewPage.tsx"), "utf8");

  assert.match(source, /review\.expressionStatus && review\.strength && review\.nextFocus/);
  assert.match(source, /<h3>Why<\/h3>/);
  assert.doesNotMatch(source, />Evidence</);
});
