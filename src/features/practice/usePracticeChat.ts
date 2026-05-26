import { useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { generatePracticeChat, generatePracticeQuestions } from "../../ai/provider";
import { practiceQuestionsRules } from "../../ai/rules";
import { db } from "../../lib/db";
import { showToast } from "../../lib/toast";
import { uiCopy } from "../../lib/uiCopy";
import type { AppStateRecord, CaptureFragment, CaptureItem, ChatMessage, ExpressionRecord, MemoryItem, PracticeChatReview, PracticePlan, PracticeTask, Screen, TopicItem } from "../../types";
import { extractPracticeReviewFeatures } from "./practiceReviewDiagnostics";
import { buildPracticeReviewRecord } from "./practiceReviewBuilder";
import { buildPracticeReviewCompletionArtifacts, savePracticeReviewCompletion } from "./practiceReviewCompletion";
import { buildPracticeReviewGenerationArgs, generatePracticeReviewOutput } from "./practiceReviewGeneration";
import {
  computeFocusItems,
  savePracticeReviewArtifacts
} from "./practiceReviewPersistence";
import { buildTaskPracticeSession, buildTopicPracticeSession } from "./practiceSessionBuilder";
import type { PracticeSource } from "./practiceSessionTypes";

const PRACTICE_AI_TIMEOUT_MS = 8000;

type UsePracticeChatArgs = {
  captures: CaptureItem[];
  setCaptures: Dispatch<SetStateAction<CaptureItem[]>>;
  setTopics: Dispatch<SetStateAction<TopicItem[]>>;
  setMemories: Dispatch<SetStateAction<MemoryItem[]>>;
  setExpressions: Dispatch<SetStateAction<ExpressionRecord[]>>;
  activeTopic: TopicItem | undefined;
  appState: AppStateRecord;
  persistState: (nextState: AppStateRecord) => Promise<void>;
  navigate: (next: Screen) => void;
};

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
  isReviewGenerating: boolean;
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
  setExpressions,
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
  const [isReviewGenerating, setIsReviewGenerating] = useState(false);
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

  function beginPracticePlanLoad(args: {
    fragments: CaptureFragment[];
    task?: PracticeTask;
    fallbackQuestion: string;
  }) {
    const fallback = () => practiceQuestionsRules({ fragments: args.fragments, appState, task: args.task });
    const fallbackOutput = fallback();
    setPracticePlan(fallbackOutput);
    setPracticeChatFirstQuestion(fallbackOutput.questions[0]?.question || args.fallbackQuestion);
    practiceAiDone.current = true;
    checkPracticeChatReady();

    if (isMockPracticeEnabled(appState)) {
      showToast("Mock practice mode is on. Using local practice content without API.", "info");
      return;
    }

    void Promise.race([
        generatePracticeQuestions({ fragments: args.fragments, appState, task: args.task }),
        timeoutAfter(PRACTICE_AI_TIMEOUT_MS)
    ])
      .then((output) => {
        setPracticePlan(output);
        setPracticeChatFirstQuestion(output.questions[0]?.question || args.fallbackQuestion);
      })
      .catch((error) => {
        const message =
          appState.profile.interfaceLanguage === "中文"
            ? `AI 暂时不可用：${readableAiError(error)}。已使用 mock 内容继续测试。`
            : `AI is unavailable: ${readableAiError(error)}. TinyBu is using mock content for testing.`;
        showToast(message);
      });
  }

  async function startPracticeForTopic(topic: TopicItem) {
    if (startingPractice.current) return;
    startingPractice.current = true;

    const copy = uiCopy[appState.profile.interfaceLanguage].practiceChat as Record<string, string>;
    const session = buildTopicPracticeSession({ captures, fallbackQuestion: copy.firstQuestion, topic });
    if (!session) {
      startingPractice.current = false;
      showToast("This topic has no source material yet. Add a capture before practicing.", "info");
      return;
    }

    practiceAiDone.current = false;
    preparingBarDone.current = false;
    setPracticePlan(null);
    setActivePracticeSource(session.source);
    setPracticeChatFirstQuestion("");
    await persistState({ ...appState, activeTopicId: topic.id });
    navigate("practice-preparing");

    beginPracticePlanLoad({ fragments: session.fragments, fallbackQuestion: session.firstQuestion });
  }

  async function startPracticeForTask(task: PracticeTask) {
    if (startingPractice.current) return;
    if (task.taskType === "find-material") {
      showToast("Capture or paste one small thing first, then TinyBu will turn it into a practice.", "info");
      navigate("home");
      return;
    }
    startingPractice.current = true;

    const session = buildTaskPracticeSession({ captures, task });
    if (!session) {
      startingPractice.current = false;
      showToast("This task needs a little more source material before practicing.", "info");
      return;
    }

    practiceAiDone.current = false;
    preparingBarDone.current = false;
    setPracticePlan(null);
    setActivePracticeSource(session.source);
    setPracticeChatFirstQuestion(session.firstQuestion);
    navigate("practice-preparing");

    beginPracticePlanLoad({ fragments: session.fragments, task, fallbackQuestion: session.firstQuestion });
  }

  function handlePreparingReady() {
    preparingBarDone.current = true;
    if (activePracticeSource) {
      const copy = uiCopy[appState.profile.interfaceLanguage].practiceChat as Record<string, string>;
      setPracticeChatFirstQuestion((question) => question || activePracticeSource.practiceGoal || copy.firstQuestion);
      preparingBarDone.current = false;
      practiceAiDone.current = false;
      startingPractice.current = false;
      window.setTimeout(() => navigate("practice-chat"), 0);
      return;
    }
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

  async function finishPracticeChatWithReview(messages: ChatMessage[], whatToCover: string[]) {
    if (reviewGenerating.current) return;
    reviewGenerating.current = true;
    setIsReviewGenerating(true);

    const source = activePracticeSource;
    if (!source) {
      reviewGenerating.current = false;
      return;
    }

    navigate("practice-preparing");

    try {
      const focusItems = computeFocusItems(whatToCover, messages);
      const completedFocusItemIds = focusItems.filter((f) => f.completed).map((f) => f.id);
      const bookmarkedLines = messages
        .filter((message) => message.saved)
        .map((message) => message.text.trim())
        .filter(Boolean);
      const reviewFeatures = extractPracticeReviewFeatures({
        messages,
        whatToCover,
        completedFocusItemIds,
        targetChunks: practicePlan?.languageBank.usefulChunks ?? [],
        interfaceLanguage: appState.profile.interfaceLanguage
      });

      const reviewArgs = buildPracticeReviewGenerationArgs({
        appState,
        messages,
        practicePlan,
        reviewFeatures,
        source,
        whatToCover
      });
      const output = await generatePracticeReviewOutput({
        mockPracticeEnabled: isMockPracticeEnabled(appState),
        reviewArgs,
        timeoutAfter: timeoutAfter(PRACTICE_AI_TIMEOUT_MS),
        onFallback: (error) => {
          const message =
            appState.profile.interfaceLanguage === "中文"
              ? `Review 生成失败：${readableAiError(error)}。已使用 mock 复盘。`
              : `Review generation failed: ${readableAiError(error)}. TinyBu used a mock review.`;
          showToast(message);
        }
      });

      const review = buildPracticeReviewRecord({
        bookmarkedLines,
        completedFocusItemIds,
        focusItems,
        interfaceLanguage: appState.profile.interfaceLanguage,
        messages,
        output,
        reviewFeatures,
        source
      });

      const completionArtifacts = buildPracticeReviewCompletionArtifacts({
        captures,
        review,
        source
      });
      await savePracticeReviewCompletion({ db, review, artifacts: completionArtifacts });
      setPracticeChatReview(review);
      if (completionArtifacts.completion) {
        const { completion } = completionArtifacts;
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
      setIsReviewGenerating(false);
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
    const { memory, expressionRecords } = await savePracticeReviewArtifacts({
      db,
      review,
      sourceTitle: activePracticeSource?.title ?? activeTopic?.name ?? "Practice Review"
    });
    if (memory) setMemories((items) => [memory, ...items.filter((item) => item.id !== memory.id)]);
    if (expressionRecords.length) setExpressions((items) => [...expressionRecords, ...items.filter((item) => !expressionRecords.some((record) => record.id === item.id))]);
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
    const { memory, expressionRecords } = await savePracticeReviewArtifacts({
      db,
      review,
      sourceTitle: activePracticeSource?.title ?? topic?.name ?? "Practice Review"
    });
    if (memory) setMemories((items) => [memory, ...items.filter((item) => item.id !== memory.id)]);
    if (expressionRecords.length) setExpressions((items) => [...expressionRecords, ...items.filter((item) => !expressionRecords.some((record) => record.id === item.id))]);
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
    isReviewGenerating,
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
