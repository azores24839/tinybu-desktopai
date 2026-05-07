import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
