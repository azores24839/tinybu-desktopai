import { useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { generatePracticeChat, generatePracticeChatReview, generatePracticeQuestions } from "../../ai/provider";
import { practiceChatReviewRules, practiceQuestionsRules } from "../../ai/rules";
import { db } from "../../lib/db";
import { showToast } from "../../lib/toast";
import { uiCopy } from "../../lib/uiCopy";
import { uid, nowIso } from "../../lib/defaults";
import type { AppStateRecord, CaptureItem, ChatMessage, MemoryItem, PracticeChatReview, PracticePlan, PracticeTask, Screen, TopicItem } from "../../types";
import { buildPracticeChatCompletion, selectPracticeFragments } from "./practiceUtils";
import { practiceTaskToFragments } from "./practiceTasks";
import { topicCaptures } from "../topics/topicUtils";

const PRACTICE_AI_TIMEOUT_MS = 8000;

type UsePracticeChatArgs = {
  captures: CaptureItem[];
  setCaptures: Dispatch<SetStateAction<CaptureItem[]>>;
  setTopics: Dispatch<SetStateAction<TopicItem[]>>;
  setMemories: Dispatch<SetStateAction<MemoryItem[]>>;
  activeTopic: TopicItem | undefined;
  appState: AppStateRecord;
  persistState: (nextState: AppStateRecord) => Promise<void>;
  navigate: (next: Screen) => void;
};

export type PracticeSource =
  | { kind: "topic"; title: string; summary: string; practiceGoal: string; topic: TopicItem; captures: CaptureItem[] }
  | { kind: "task"; title: string; summary: string; practiceGoal: string; task: PracticeTask; captures: CaptureItem[] };

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function isMockPracticeEnabled(appState: AppStateRecord) {
  if (appState.settings.aiProviderMode === "rules") return true;
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem("tinybu:mockPractice") === "1";
}

function readableAiError(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "AI request did not finish in time";
}

function timeoutAfter(ms: number) {
  return new Promise<never>((_, reject) => {
    window.setTimeout(() => reject(new Error(`AI request timed out after ${Math.round(ms / 1000)}s`)), ms);
  });
}

export type UsePracticeChatResult = {
  practicePlan: PracticePlan | null;
  activePracticeSource: PracticeSource | null;
  practiceChatFirstQuestion: string;
  practiceChatReview: PracticeChatReview | null;
  topicPracticeChatReviews: PracticeChatReview[];
  startPracticeForTopic: (topic: TopicItem) => Promise<void>;
  startPracticeForTask: (task: PracticeTask) => Promise<void>;
  handlePreparingReady: () => void;
  handlePracticeChatReply: (userAnswer: string, chatHistory: Array<{ role: string; text: string }>) => Promise<string>;
  finishPracticeChatWithReview: (messages: ChatMessage[], whatToCover: string[]) => Promise<void>;
  endPracticeChatWithoutSaving: () => void;
  saveReviewAndGoToTopic: (review: PracticeChatReview) => Promise<void>;
  saveReviewAndPracticeAgain: (review: PracticeChatReview, topic?: TopicItem) => Promise<void>;
  loadTopicPracticeChatReviews: (topicId: string) => Promise<void>;
};

export function usePracticeChat({
  captures,
  setCaptures,
  setTopics,
  setMemories,
  activeTopic,
  appState,
  persistState,
  navigate
}: UsePracticeChatArgs): UsePracticeChatResult {
  const [practicePlan, setPracticePlan] = useState<PracticePlan | null>(null);
  const [activePracticeSource, setActivePracticeSource] = useState<PracticeSource | null>(null);
  const [practiceChatFirstQuestion, setPracticeChatFirstQuestion] = useState("");
  const [practiceChatReview, setPracticeChatReview] = useState<PracticeChatReview | null>(null);
  const [topicPracticeChatReviews, setTopicPracticeChatReviews] = useState<PracticeChatReview[]>([]);
  const practiceAiDone = useRef(false);
  const preparingBarDone = useRef(false);
  const startingPractice = useRef(false);
  const reviewGenerating = useRef(false);

  function checkPracticeChatReady() {
    if (practiceAiDone.current && preparingBarDone.current) {
      preparingBarDone.current = false;
      practiceAiDone.current = false;
      startingPractice.current = false;
      navigate("practice-chat");
    }
  }

  async function preparePracticePlan(args: {
    fragments: ReturnType<typeof selectPracticeFragments>;
    task?: PracticeTask;
  }) {
    const fallback = () => practiceQuestionsRules({ fragments: args.fragments, appState, task: args.task });
    if (isMockPracticeEnabled(appState)) {
      showToast("Mock practice mode is on. Using local practice content without API.", "info");
      return fallback();
    }

    try {
      return await Promise.race([
        generatePracticeQuestions({ fragments: args.fragments, appState, task: args.task }),
        timeoutAfter(PRACTICE_AI_TIMEOUT_MS)
      ]);
    } catch (error) {
      const message =
        appState.profile.interfaceLanguage === "中文"
          ? `AI 暂时不可用：${readableAiError(error)}。已切换到 mock 内容继续测试。`
          : `AI is unavailable: ${readableAiError(error)}. TinyBu switched to mock content for testing.`;
      showToast(message);
      return fallback();
    }
  }

  async function startPracticeForTopic(topic: TopicItem) {
    if (startingPractice.current) return;
    startingPractice.current = true;

    const capturesForTopic = topicCaptures(topic, captures);
    const fragments = selectPracticeFragments(capturesForTopic);
    if (!fragments.length) {
      startingPractice.current = false;
      showToast("This topic has no source material yet. Add a capture before practicing.", "info");
      return;
    }

    practiceAiDone.current = false;
    preparingBarDone.current = false;
    setPracticePlan(null);
    setActivePracticeSource({
      kind: "topic",
      title: topic.name,
      summary: topic.summary,
      practiceGoal: topic.practiceGoal,
      topic,
      captures: capturesForTopic
    });
    setPracticeChatFirstQuestion("");
    await persistState({ ...appState, activeTopicId: topic.id });
    navigate("practice-preparing");

    const copy = uiCopy[appState.profile.interfaceLanguage].practiceChat as Record<string, string>;
    const output = await preparePracticePlan({ fragments });
    setPracticePlan(output);
    setPracticeChatFirstQuestion(output.questions[0]?.question || copy.firstQuestion);
    practiceAiDone.current = true;
    checkPracticeChatReady();
  }

  async function startPracticeForTask(task: PracticeTask) {
    if (startingPractice.current) return;
    if (task.taskType === "find-material") {
      showToast("Capture or paste one small thing first, then TinyBu will turn it into a practice.", "info");
      navigate("home");
      return;
    }
    startingPractice.current = true;

    const sourceCapture = task.sourceCaptureId ? captures.find((capture) => capture.id === task.sourceCaptureId) : undefined;
    const sourceCaptures = sourceCapture ? [sourceCapture] : [];
    const fragments = sourceCapture ? selectPracticeFragments(sourceCaptures) : practiceTaskToFragments(task);
    if (!fragments.length) {
      startingPractice.current = false;
      showToast("This task needs a little more source material before practicing.", "info");
      return;
    }

    practiceAiDone.current = false;
    preparingBarDone.current = false;
    setPracticePlan(null);
    setActivePracticeSource({
      kind: "task",
      title: task.title,
      summary: task.description,
      practiceGoal: task.targetGoal,
      task,
      captures: sourceCaptures
    });
    setPracticeChatFirstQuestion(task.starterQuestion);
    navigate("practice-preparing");

    const output = await preparePracticePlan({ fragments, task });
    setPracticePlan(output);
    setPracticeChatFirstQuestion(output.questions[0]?.question || task.starterQuestion);
    practiceAiDone.current = true;
    checkPracticeChatReady();
  }

  function handlePreparingReady() {
    preparingBarDone.current = true;
    checkPracticeChatReady();
  }

  async function handlePracticeChatReply(
    userAnswer: string,
    chatHistory: Array<{ role: string; text: string }>
  ): Promise<string> {
    return generatePracticeChat({
      userAnswer,
      topicName: activePracticeSource?.title ?? activeTopic?.name ?? "",
      practiceGoal: activePracticeSource?.practiceGoal,
      chatHistory,
      appState
    });
  }

  function computeFocusItems(whatToCover: string[], messages: ChatMessage[]): PracticeChatReview["focusItems"] {
    const userTexts = messages.filter((m) => m.role === "user").map((m) => m.text);
    const all = userTexts.join(" ").toLowerCase();
    return whatToCover.map((item, i) => {
      const kws = extractKeywords(item);
      const completed = kws.length > 0 && kws.some((kw) => all.includes(kw));
      return { id: `focus-${i}`, label: item, completed };
    });
  }

  async function finishPracticeChatWithReview(messages: ChatMessage[], whatToCover: string[]) {
    if (reviewGenerating.current) return;
    reviewGenerating.current = true;

    const source = activePracticeSource;
    if (!source) {
      reviewGenerating.current = false;
      return;
    }

    navigate("practice-preparing");

    try {
      const focusItems = computeFocusItems(whatToCover, messages);
      const completedFocusItemIds = focusItems.filter((f) => f.completed).map((f) => f.id);
      const userMessages = messages.filter((m) => m.role === "user");

      const reviewArgs = {
        topicName: source.title,
        practiceGoal: practicePlan?.practiceGoal ?? source.practiceGoal,
        whatToCover,
        chatMessages: messages,
        targetLanguage: appState.profile.targetLanguage,
        nativeLanguage: appState.profile.nativeLanguage,
        appState
      };
      const output = isMockPracticeEnabled(appState)
        ? practiceChatReviewRules(reviewArgs)
        : await Promise.race([
            generatePracticeChatReview(reviewArgs),
            timeoutAfter(PRACTICE_AI_TIMEOUT_MS)
          ]).catch((error) => {
            const message =
              appState.profile.interfaceLanguage === "中文"
                ? `Review 生成失败：${readableAiError(error)}。已使用 mock 复盘。`
                : `Review generation failed: ${readableAiError(error)}. TinyBu used a mock review.`;
            showToast(message);
            return practiceChatReviewRules(reviewArgs);
          });

      const review: PracticeChatReview = {
        id: uid("pcr"),
        topicId: source.kind === "topic" ? source.topic.id : undefined,
        taskId: source.kind === "task" ? source.task.id : undefined,
        createdAt: nowIso(),
        diarySummary: output.diarySummary,
        completedFocusItemIds,
        focusItems,
        betterExpressions: output.betterExpressions,
        savedWordsOrChunks: output.savedWordsOrChunks,
        nextStep: output.nextStep,
        messageCount: messages.length,
        userMessageCount: userMessages.length
      };

      const memory: MemoryItem = {
        id: uid("memory"),
        type: "next",
        title: output.savedWordsOrChunks[0] || source.title,
        body: output.nextStep || output.diarySummary,
        editable: true,
        updatedAt: review.createdAt
      };

      const nextTask = source.kind === "task" ? { ...source.task, status: "used" as const, usedAt: review.createdAt } : null;
      const completion =
        source.kind === "topic"
          ? buildPracticeChatCompletion({
              topic: source.topic,
              capturesForTopic: topicCaptures(source.topic, captures),
              practicedAt: review.createdAt
            })
          : null;

      await db.transaction("rw", [db.practiceChatReviews, db.topics, db.captures, db.memories, db.practiceTasks], async () => {
        await db.practiceChatReviews.put(review);
        await db.memories.put(memory);
        if (nextTask) await db.practiceTasks.put(nextTask);
        if (completion) {
          await db.topics.put(completion.nextTopic);
          if (completion.updatedCaptures.length) await db.captures.bulkPut(completion.updatedCaptures);
        }
      });
      setPracticeChatReview(review);
      setMemories((items) => [memory, ...items.filter((item) => item.id !== memory.id)]);
      if (completion) {
        setTopicPracticeChatReviews((items) => [review, ...items.filter((item) => item.id !== review.id)]);
        setTopics((items) => items.map((item) => (item.id === completion.nextTopic.id ? completion.nextTopic : item)));
        setCaptures((items) => items.map((item) => completion.updatedCaptures.find((capture) => capture.id === item.id) ?? item));
      }

      startingPractice.current = false;
      setPracticePlan(null);
      setPracticeChatFirstQuestion("");
      navigate("practice-review");
    } catch (error) {
      console.error("finishPracticeChatWithReview failed", error);
      showToast("Failed to generate review.");
      navigate(source.kind === "topic" ? "topic-detail" : "home");
    } finally {
      reviewGenerating.current = false;
    }
  }

  function endPracticeChatWithoutSaving() {
    startingPractice.current = false;
    setPracticePlan(null);
    setActivePracticeSource(null);
    setPracticeChatFirstQuestion("");
    navigate(activePracticeSource?.kind === "topic" ? "topic-detail" : "home");
  }

  async function saveReviewAndGoToTopic(review: PracticeChatReview) {
    await db.practiceChatReviews.put(review);
    setPracticeChatReview(null);
    setActivePracticeSource(null);
    if (review.topicId) {
      await loadTopicPracticeChatReviews(review.topicId);
      navigate("topic-detail");
    } else {
      navigate("home");
    }
  }

  async function saveReviewAndPracticeAgain(review: PracticeChatReview, topic?: TopicItem) {
    await db.practiceChatReviews.put(review);
    setPracticeChatReview(null);
    const currentSource = activePracticeSource;
    if (currentSource?.kind === "task") await startPracticeForTask(currentSource.task);
    else if (topic) await startPracticeForTopic(topic);
  }

  async function loadTopicPracticeChatReviews(topicId: string) {
    const reviews = await db.practiceChatReviews
      .where("topicId")
      .equals(topicId)
      .reverse()
      .sortBy("createdAt");
    setTopicPracticeChatReviews(reviews);
  }

  return {
    practicePlan,
    activePracticeSource,
    practiceChatFirstQuestion,
    practiceChatReview,
    topicPracticeChatReviews,
    startPracticeForTopic,
    startPracticeForTask,
    handlePreparingReady,
    handlePracticeChatReply,
    finishPracticeChatWithReview,
    endPracticeChatWithoutSaving,
    saveReviewAndGoToTopic,
    saveReviewAndPracticeAgain,
    loadTopicPracticeChatReviews
  };
}
