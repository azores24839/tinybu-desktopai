import { useRef, useState } from "react";
import { generatePracticeChat, generatePracticeQuestions } from "../../ai/provider";
import { uiCopy } from "../../lib/uiCopy";
import type { AppStateRecord, CaptureItem, Screen, TopicItem } from "../../types";
import { selectPracticeFragments } from "./practiceUtils";
import { topicCaptures } from "../topics/topicUtils";

type UsePracticeChatArgs = {
  captures: CaptureItem[];
  activeTopic: TopicItem | undefined;
  appState: AppStateRecord;
  persistState: (nextState: AppStateRecord) => Promise<void>;
  navigate: (next: Screen) => void;
};

type UsePracticeChatResult = {
  practiceChatFirstQuestion: string;
  startPracticeForTopic: (topic: TopicItem) => Promise<void>;
  handlePreparingReady: () => void;
  handlePracticeChatReply: (userAnswer: string, chatHistory: Array<{ role: string; text: string }>) => Promise<string>;
  endPracticeChat: () => void;
};

export function usePracticeChat({
  captures,
  activeTopic,
  appState,
  persistState,
  navigate
}: UsePracticeChatArgs): UsePracticeChatResult {
  const [practiceChatFirstQuestion, setPracticeChatFirstQuestion] = useState("");
  const practiceAiDone = useRef(false);
  const preparingBarDone = useRef(false);

  function checkPracticeChatReady() {
    if (practiceAiDone.current && preparingBarDone.current) {
      preparingBarDone.current = false;
      practiceAiDone.current = false;
      navigate("practice-chat");
    }
  }

  async function startPracticeForTopic(topic: TopicItem) {
    const capturesForTopic = topicCaptures(topic, captures);
    const fragments = selectPracticeFragments(capturesForTopic);
    if (!fragments.length) return;

    practiceAiDone.current = false;
    preparingBarDone.current = false;
    setPracticeChatFirstQuestion("");
    await persistState({ ...appState, activeTopicId: topic.id });
    navigate("practice-preparing");

    const copy = uiCopy[appState.profile.interfaceLanguage].practiceChat as Record<string, string>;
    try {
      const output = await generatePracticeQuestions({ fragments, appState });
      setPracticeChatFirstQuestion(output.questions[0]?.question || copy.firstQuestion);
    } catch {
      setPracticeChatFirstQuestion(copy.firstQuestion);
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

  function endPracticeChat() {
    setPracticeChatFirstQuestion("");
    navigate("topic-detail");
  }

  return {
    practiceChatFirstQuestion,
    startPracticeForTopic,
    handlePreparingReady,
    handlePracticeChatReply,
    endPracticeChat
  };
}
