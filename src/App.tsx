import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "./app/AppShell";
import { useAppBootstrap } from "./app/useAppBootstrap";
import { useExternalCaptureImports } from "./app/useExternalCaptureImports";
import { demoContents } from "./data/demoContent";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ToastContainer } from "./components/ToastContainer";
import { clearLearningData, db, saveAppState } from "./lib/db";
import { clearUserApiKey, loadUserApiKey, saveUserApiKey } from "./lib/secureKey";
import { showToast } from "./lib/toast";
import { defaultAppState, nowIso } from "./lib/defaults";
import {
  captureText,
} from "./features/captures/captureUtils";
import { useCaptures } from "./features/captures/useCaptures";
import { saveExpressionFromCapture } from "./features/captures/saveExpression";
import { topicCaptures } from "./features/topics/topicUtils";
import { useTopics } from "./features/topics/useTopics";
import { usePracticeChat } from "./features/practice/usePracticeChat";
import { useScreenshotCaptureFlow } from "./features/screenshots/useScreenshotCaptureFlow";
import type {
  AppStateRecord,
  CompanionProfile,
  ExpressionRecord,
  ExternalCaptureKind,
  MemoryItem,
  CompanionState,
  Screen,
  TopicItem,
  UserProfile
} from "./types";

export default function App() {
  const [screen, setScreen] = useState<Screen>("welcome");
  const [appState, setAppState] = useState<AppStateRecord>(defaultAppState);
  const appStateRef = useRef(appState);
  appStateRef.current = appState;
  const { captures, setCaptures, createCaptureRecord, updateCapture, openCapture, archiveCapture } = useCaptures({
    appState: appStateRef.current,
    persistState
  });
  const { topics, setTopics, updateTopic, createTopicFromCaptures, addCapturesToTopic, openTopic, markTopicStudied } = useTopics({
    captures,
    setCaptures,
    persistState,
    navigate,
    appState: appStateRef.current
  });
  const topicsRef = useRef(topics);
  topicsRef.current = topics;
  const [expressions, setExpressions] = useState<ExpressionRecord[]>([]);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [companionState, setCompanionState] = useState<CompanionState>("idle");
  const [screenshotQuestionInput, setScreenshotQuestionInput] = useState("");
  const [screenshotQuestionBusy, setScreenshotQuestionBusy] = useState(false);
  const [homePasteDraft, setHomePasteDraft] = useState("");
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [apiKeyStatus, setApiKeyStatus] = useState("");
  const [busyLabel, setBusyLabel] = useState("");

  const activeTopic = useMemo(
    () => topics.find((topic) => topic.id === appState.activeTopicId) ?? topics[0],
    [appState.activeTopicId, topics]
  );
  const activeCapture = useMemo(
    () =>
      captures.find((capture) => capture.id === appState.activeCaptureId) ??
      topicCaptures(activeTopic, captures)[0] ??
      captures[0],
    [activeTopic, appState.activeCaptureId, captures]
  );
  const { importScreenshotCapture, confirmScreenshotText, askAboutScreenshot } = useScreenshotCaptureFlow({
    appState,
    screenshotQuestionBusy,
    createCaptureRecord,
    updateCapture,
    persistState,
    navigate,
    getCaptureText: captureText,
    setCaptures,
    setBusyLabel,
    setCompanionState,
    setScreenshotQuestionInput,
    setScreenshotQuestionBusy
  });

  const {
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
  } = usePracticeChat({
    captures,
    setCaptures,
    setTopics,
    setMemories,
    setExpressions,
    activeTopic,
    appState: appStateRef.current,
    persistState,
    navigate
  });

  useAppBootstrap({
    createCaptureRecord,
    setAppState,
    setCaptures,
    setTopics,
    setExpressions,
    setMemories,
    setHomePasteDraft,
    setScreen
  });

  useExternalCaptureImports({
    appState,
    appStateRef,
    createCaptureRecord,
    setCaptures,
    persistState,
    navigate,
    setBusyLabel,
    importScreenshotCapture
  });

  async function persistState(nextState: AppStateRecord) {
    await saveAppState(nextState);
    setAppState(nextState);
  }

  async function updateState(mutator: (state: AppStateRecord) => AppStateRecord) {
    const nextState = mutator(appState);
    await persistState(nextState);
  }

  function navigate(next: Screen) {
    setScreen(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function createAndStoreCapture(args: {
    title: string;
    sourceUrl: string;
    sourceKind: ExternalCaptureKind;
    text: string;
  }) {
    const text = args.text.trim();
    if (!text) return;
    setBusyLabel("Organizing capture");
    setCompanionState("thinking");
    const capture = await createCaptureRecord({ ...args, text, appState });
    await db.captures.put(capture);
    setCaptures((items) => [capture, ...items]);
    await persistState({
      ...appState,
      activeCaptureId: capture.id,
      pastedTranscript: text,
      pastedSourceTitle: capture.title,
      pastedSourceUrl: capture.sourceUrl,
      pastedSourceKind: capture.sourceKind
    });
    setHomePasteDraft("");
    setBusyLabel("");
    setCompanionState("idle");
    navigate("home");
  }

  async function startDemo() {
    const demo = demoContents[0];
    const capture = await createCaptureRecord({
      title: demo.title,
      sourceUrl: "",
      sourceKind: "manual",
      text: demo.transcript.map((line) => line.text).join("\n"),
      appState: { ...appState, onboarded: true, companionReady: true }
    });
    await db.captures.put(capture);
    setCaptures((items) => [capture, ...items]);
    await persistState({
      ...appState,
      onboarded: true,
      companionReady: true,
      activeCaptureId: capture.id
    });
    navigate("home");
  }

  async function submitOnboarding(profile: UserProfile) {
    const highAnxiety = profile.anxiety >= 4;
    const nextState = {
      ...appState,
      onboarded: true,
      profile: {
        ...profile,
        supportPreference: highAnxiety ? "Gentle" : profile.supportPreference
      },
      settings: {
        ...appState.settings,
        gentleFeedback: highAnxiety || appState.settings.gentleFeedback,
        supportStrength: highAnxiety ? "Gentle" : profile.supportPreference
      }
    };
    await persistState(nextState);
    navigate("companion");
  }

  async function submitCompanion(companion: CompanionProfile) {
    await updateState((state) => ({ ...state, companionReady: true, companion }));
    navigate("home");
  }

  async function saveSettings(nextState: AppStateRecord, key?: string) {
    setApiKeyStatus("");
    if (key?.trim()) {
      await saveUserApiKey(key.trim());
      nextState.settings.apiKeySaved = true;
      setApiKeyDraft("");
      setApiKeyStatus("API key saved for this device.");
    } else {
      setApiKeyStatus("Settings saved.");
    }
    await persistState(nextState);
  }

  async function resetOnboarding() {
    await persistState({ ...appState, onboarded: false, companionReady: false });
    navigate("welcome");
  }

  async function clearMemoryOnly() {
    await db.memories.clear();
    setMemories([]);
  }

  async function clearAllData() {
    await clearLearningData();
    setCaptures([]);
    setTopics([]);
    setExpressions([]);
    setMemories([]);
    await persistState({ ...appState, activeCaptureId: "", activeTopicId: "" });
  }

  async function deleteCaptureAndSyncTopics(id: string) {
    const relatedTopics = topicsRef.current.filter((topic) => topic.captureIds.includes(id));
    const nextTopics = relatedTopics.map((topic) => ({
      ...topic,
      captureIds: topic.captureIds.filter((captureId) => captureId !== id),
      updatedAt: nowIso()
    }));

    try {
      await db.transaction("rw", db.captures, db.topics, async () => {
        await db.captures.delete(id);
        if (nextTopics.length) await db.topics.bulkPut(nextTopics);
      });
      setCaptures((items) => items.filter((item) => item.id !== id));
      if (nextTopics.length) {
        setTopics((items) => items.map((item) => nextTopics.find((topic) => topic.id === item.id) ?? item));
      }
    } catch (error) {
      console.error("deleteCaptureAndSyncTopics failed", error);
      showToast("Failed to delete capture. Please try again.");
    }
  }

  async function updateExpression(record: ExpressionRecord) {
    await db.expressions.put(record);
    setExpressions((items) => items.map((item) => (item.id === record.id ? record : item)));
  }

  async function deleteExpression(id: string) {
    await db.expressions.delete(id);
    setExpressions((items) => items.filter((item) => item.id !== id));
  }

  async function updateMemoryItem(item: MemoryItem) {
    await db.memories.put(item);
    setMemories((items) => items.map((memory) => (memory.id === item.id ? item : memory)));
  }

  async function deleteMemory(id: string) {
    await db.memories.delete(id);
    setMemories((items) => items.filter((item) => item.id !== id));
  }

  async function checkUserKey() {
    const key = await loadUserApiKey();
    setApiKeyStatus(key ? "API key is readable by TinyBu." : "No API key found on this device.");
  }

  async function clearUserKey() {
    await clearUserApiKey();
    setApiKeyStatus("API key cleared.");
    await updateState((state) => ({
      ...state,
      settings: { ...state.settings, apiKeySaved: false }
    }));
  }

  useEffect(() => {
    if (screen === "topic-detail" && activeTopic) {
      loadTopicPracticeChatReviews(activeTopic.id);
    }
  }, [screen, activeTopic?.id]);

  return (
    <ErrorBoundary>
      <AppShell
        screen={screen}
        appState={appState}
        busyLabel={busyLabel}
        companionState={companionState}
        captures={captures}
        topics={topics}
        expressions={expressions}
        memories={memories}
        activeTopic={activeTopic}
        activeCapture={activeCapture}
        practicePlan={practicePlan}
        activePracticeSource={activePracticeSource}
        practiceChatFirstQuestion={practiceChatFirstQuestion}
        practiceChatReview={practiceChatReview}
        topicPracticeChatReviews={topicPracticeChatReviews}
        isReviewGenerating={isReviewGenerating}
        screenshotQuestionInput={screenshotQuestionInput}
        screenshotQuestionBusy={screenshotQuestionBusy}
        apiKeyDraft={apiKeyDraft}
        apiKeyStatus={apiKeyStatus}
        navigate={navigate}
        startDemo={startDemo}
        startPracticeForTask={startPracticeForTask}
        startPracticeForTopic={startPracticeForTopic}
        handlePreparingReady={handlePreparingReady}
        handlePracticeChatReply={handlePracticeChatReply}
        finishPracticeChatWithReview={finishPracticeChatWithReview}
        endPracticeChatWithoutSaving={endPracticeChatWithoutSaving}
        saveReviewAndGoToTopic={saveReviewAndGoToTopic}
        saveReviewAndPracticeAgain={saveReviewAndPracticeAgain}
        openTopic={openTopic}
        openCapture={openCapture}
        updateCapture={updateCapture}
        archiveCapture={archiveCapture}
        deleteCapture={deleteCaptureAndSyncTopics}
        createTopicFromCaptures={createTopicFromCaptures}
        addCapturesToTopic={addCapturesToTopic}
        updateTopic={updateTopic}
        markTopicStudied={markTopicStudied}
        persistState={persistState}
        confirmScreenshotText={confirmScreenshotText}
        askAboutScreenshot={askAboutScreenshot}
        setScreenshotQuestionInput={setScreenshotQuestionInput}
        saveExpressionFromCapture={(capture, expression) => saveExpressionFromCapture(capture, expression, setExpressions)}
        updateExpression={updateExpression}
        deleteExpression={deleteExpression}
        updateMemoryItem={updateMemoryItem}
        deleteMemory={deleteMemory}
        saveSettings={saveSettings}
        setApiKeyDraft={setApiKeyDraft}
        checkUserKey={checkUserKey}
        clearUserKey={clearUserKey}
        clearMemoryOnly={clearMemoryOnly}
        clearAllData={clearAllData}
        resetOnboarding={resetOnboarding}
        submitOnboarding={submitOnboarding}
        submitCompanion={submitCompanion}
      />
      <ToastContainer />
    </ErrorBoundary>
  );
}
