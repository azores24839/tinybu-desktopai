import { useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { generatePracticeChat, generatePracticeChatReview, generatePracticeQuestions } from "../../ai/provider";
import { db } from "../../lib/db";
import { showToast } from "../../lib/toast";
import { uiCopy } from "../../lib/uiCopy";
import { uid, nowIso } from "../../lib/defaults";
import type { AppStateRecord, CaptureItem, ChatMessage, PracticeChatReview, PracticePlan, Screen, TopicItem } from "../../types";
import { buildPracticeChatCompletion, selectPracticeFragments } from "./practiceUtils";
import { topicCaptures } from "../topics/topicUtils";

type UsePracticeChatArgs = {
  captures: CaptureItem[];
  setCaptures: Dispatch<SetStateAction<CaptureItem[]>>;
  setTopics: Dispatch<SetStateAction<TopicItem[]>>;
  activeTopic: TopicItem | undefined;
  appState: AppStateRecord;
  persistState: (nextState: AppStateRecord) => Promise<void>;
  navigate: (next: Screen) => void;
};

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

export type UsePracticeChatResult = {
  practicePlan: PracticePlan | null;
  practiceChatFirstQuestion: string;
  practiceChatReview: PracticeChatReview | null;
  topicPracticeChatReviews: PracticeChatReview[];
  startPracticeForTopic: (topic: TopicItem) => Promise<void>;
  handlePreparingReady: () => void;
  handlePracticeChatReply: (userAnswer: string, chatHistory: Array<{ role: string; text: string }>) => Promise<string>;
  finishPracticeChatWithReview: (messages: ChatMessage[], whatToCover: string[]) => Promise<void>;
  endPracticeChatWithoutSaving: () => void;
  saveReviewAndGoToTopic: (review: PracticeChatReview) => Promise<void>;
  saveReviewAndPracticeAgain: (review: PracticeChatReview, topic: TopicItem) => Promise<void>;
  loadTopicPracticeChatReviews: (topicId: string) => Promise<void>;
};

export function usePracticeChat({
  captures,
  setCaptures,
  setTopics,
  activeTopic,
  appState,
  persistState,
  navigate
}: UsePracticeChatArgs): UsePracticeChatResult {
  const [practicePlan, setPracticePlan] = useState<PracticePlan | null>(null);
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
    setPracticeChatFirstQuestion("");
    await persistState({ ...appState, activeTopicId: topic.id });
    navigate("practice-preparing");

    const copy = uiCopy[appState.profile.interfaceLanguage].practiceChat as Record<string, string>;
    try {
      const output = await generatePracticeQuestions({ fragments, appState });
      setPracticePlan(output);
      setPracticeChatFirstQuestion(output.questions[0]?.question || copy.firstQuestion);
    } catch {
      setPracticeChatFirstQuestion(copy.firstQuestion);
      showToast("AI is unavailable. Using a default question instead.", "info");
    }
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
      topicName: activeTopic?.name ?? "",
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

    const topic = activeTopic;
    if (!topic) {
      reviewGenerating.current = false;
      return;
    }

    navigate("practice-preparing");

    try {
      const focusItems = computeFocusItems(whatToCover, messages);
      const completedFocusItemIds = focusItems.filter((f) => f.completed).map((f) => f.id);
      const userMessages = messages.filter((m) => m.role === "user");

      const output = await generatePracticeChatReview({
        topicName: topic.name,
        practiceGoal: practicePlan?.practiceGoal ?? topic.practiceGoal,
        whatToCover,
        chatMessages: messages,
        targetLanguage: appState.profile.targetLanguage,
        nativeLanguage: appState.profile.nativeLanguage,
        appState
      });

      const review: PracticeChatReview = {
        id: uid("pcr"),
        topicId: topic.id,
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

      const { nextTopic, updatedCaptures } = buildPracticeChatCompletion({
        topic,
        capturesForTopic: topicCaptures(topic, captures),
        practicedAt: review.createdAt
      });

      await db.transaction("rw", db.practiceChatReviews, db.topics, db.captures, async () => {
        await db.practiceChatReviews.put(review);
        await db.topics.put(nextTopic);
        if (updatedCaptures.length) await db.captures.bulkPut(updatedCaptures);
      });
      setPracticeChatReview(review);
      setTopicPracticeChatReviews((items) => [review, ...items.filter((item) => item.id !== review.id)]);
      setTopics((items) => items.map((item) => (item.id === topic.id ? nextTopic : item)));
      setCaptures((items) => items.map((item) => updatedCaptures.find((capture) => capture.id === item.id) ?? item));

      startingPractice.current = false;
      setPracticePlan(null);
      setPracticeChatFirstQuestion("");
      navigate("practice-review");
    } catch (error) {
      console.error("finishPracticeChatWithReview failed", error);
      showToast("Failed to generate review.");
      navigate("topic-detail");
    } finally {
      reviewGenerating.current = false;
    }
  }

  function endPracticeChatWithoutSaving() {
    startingPractice.current = false;
    setPracticePlan(null);
    setPracticeChatFirstQuestion("");
    navigate("topic-detail");
  }

  async function saveReviewAndGoToTopic(review: PracticeChatReview) {
    await db.practiceChatReviews.put(review);
    setPracticeChatReview(null);
    await loadTopicPracticeChatReviews(review.topicId);
    navigate("topic-detail");
  }

  async function saveReviewAndPracticeAgain(review: PracticeChatReview, topic: TopicItem) {
    await db.practiceChatReviews.put(review);
    setPracticeChatReview(null);
    await startPracticeForTopic(topic);
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
    practiceChatFirstQuestion,
    practiceChatReview,
    topicPracticeChatReviews,
    startPracticeForTopic,
    handlePreparingReady,
    handlePracticeChatReply,
    finishPracticeChatWithReview,
    endPracticeChatWithoutSaving,
    saveReviewAndGoToTopic,
    saveReviewAndPracticeAgain,
    loadTopicPracticeChatReviews
  };
}
