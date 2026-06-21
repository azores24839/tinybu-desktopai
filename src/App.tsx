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
import { defaultAppState, nowIso, uid } from "./lib/defaults";
import { applyDesktopCompanionMode, invokeTauri, listenTauri } from "./lib/tauriBridge";
import {
  captureText,
} from "./features/captures/captureUtils";
import { useCaptures } from "./features/captures/useCaptures";
import { createClipboardCaptureRecord } from "./features/captures/clipboardCaptureRecord";
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
  SwiftNotchCaptureRequest,
  SwiftNotchClipboardSaveRequest,
  SwiftNotchQuestionRequest,
  SwiftNotchTrayOcrRequest,
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
  const [bootstrapped, setBootstrapped] = useState(false);
  const appliedDesktopModeRef = useRef<AppStateRecord["settings"]["desktopCompanionMode"] | null>(null);

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
  const {
    importScreenshotCapture,
    confirmScreenshotText,
    askAboutScreenshot,
    askAboutScreenshotFromNotch
  } = useScreenshotCaptureFlow({
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
  const notchCaptureFlowRef = useRef({ importScreenshotCapture, askAboutScreenshotFromNotch });
  notchCaptureFlowRef.current = { importScreenshotCapture, askAboutScreenshotFromNotch };

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
    setScreen,
    setBootstrapped
  });

  useExternalCaptureImports({
    appState,
    appStateRef,
    createCaptureRecord,
    setCaptures,
    persistState,
    navigate,
    setBusyLabel,
    importScreenshotCapture: async (payload) => {
      await importScreenshotCapture(payload);
    }
  });

  useEffect(() => {
    let active = true;
    let unlistenCapture = () => {};
    let unlistenQuestion = () => {};
    let unlistenClipboardSave = () => {};

    void listenTauri<SwiftNotchCaptureRequest>("tinybu-notch-capture-requested", async (event) => {
      const { jobId, screenshot } = event.payload;
      try {
        const capture = await notchCaptureFlowRef.current.importScreenshotCapture(
          { ...screenshot, capturedAt: screenshot.capturedAt || nowIso() },
          { navigateAfter: false }
        );
        if (!active) return;
        await invokeTauri("complete_swift_notch_capture", {
          payload: {
            jobId,
            captureId: capture.id,
            title: capture.title,
            summary: capture.summary || capture.sourceText || "Screenshot ready",
            ocrText: capture.sourceText || capture.screenshot?.visibleText.join("\n") || "",
            ocrTruncated: capture.screenshot?.ocrTruncated ?? false
          }
        });
      } catch (error) {
        await invokeTauri("fail_swift_notch_job", {
          jobId,
          message: error instanceof Error ? error.message : "Screenshot recognition failed"
        });
      }
    }).then((cleanup) => {
      if (active) unlistenCapture = cleanup;
      else cleanup();
    });

    void listenTauri<SwiftNotchClipboardSaveRequest>("tinybu-notch-clipboard-save-requested", async (event) => {
      const { jobId, text } = event.payload;
      try {
        const capture = createClipboardCaptureRecord(text);
        await db.captures.put(capture);
        setCaptures((items) => [capture, ...items]);
        await persistState({
          ...appStateRef.current,
          onboarded: true,
          companionReady: true,
          activeCaptureId: capture.id
        });
        if (!active) return;
        await invokeTauri("complete_swift_notch_clipboard_save", { payload: { jobId } });
      } catch (error) {
        await invokeTauri("fail_swift_notch_job", {
          jobId,
          message: error instanceof Error ? error.message : "TinyBu could not save this copied text."
        });
      }
    }).then((cleanup) => {
      if (active) unlistenClipboardSave = cleanup;
      else cleanup();
    });

    void listenTauri<SwiftNotchQuestionRequest>("tinybu-notch-question-requested", async (event) => {
      const { jobId, captureId, question } = event.payload;
      try {
        const capture = await db.captures.get(captureId);
        if (!capture) throw new Error("The screenshot is no longer available in Tray.");
        const answer = await notchCaptureFlowRef.current.askAboutScreenshotFromNotch(capture, question);
        if (!answer) throw new Error("TinyBu could not answer this screenshot question.");
        if (!active) return;
        await invokeTauri("complete_swift_notch_question", {
          payload: { jobId, answer: answer.answer }
        });
      } catch (error) {
        await invokeTauri("fail_swift_notch_job", {
          jobId,
          message: error instanceof Error ? error.message : "TinyBu could not answer this question."
        });
      }
    }).then((cleanup) => {
      if (active) unlistenQuestion = cleanup;
      else cleanup();
    });

    return () => {
      active = false;
      unlistenCapture();
      unlistenQuestion();
      unlistenClipboardSave();
    };
  }, []);

  useEffect(() => {
    if (!bootstrapped || appState.settings.desktopCompanionMode !== "swift-notch") return;
    const records = captures
      .filter((capture) => capture.sourceKind === "screenshot" && capture.screenshot?.imageDataUrl)
      .slice(0, 5)
      .map((capture) => {
        const ocrText = capture.sourceText || capture.screenshot?.visibleText.join("\n") || "";
        const legacyCountSummary = /^Recognized \d+ text lines locally\.?$/i.test(capture.summary || "");
        return {
          captureId: capture.id,
          imageDataUrl: capture.screenshot?.imageDataUrl ?? "",
          ocrText,
          summary: legacyCountSummary ? ocrText.replace(/\s+/g, " ").slice(0, 160) : capture.summary || "",
          ocrTruncated: capture.screenshot?.ocrTruncated ?? false
        };
      });
    void invokeTauri("sync_swift_notch_tray", { records });
  }, [appState.settings.desktopCompanionMode, bootstrapped, captures]);

  useEffect(() => {
    if (!bootstrapped) return;
    void loadUserApiKey().catch((error) => {
      console.warn("TinyBu could not migrate the saved key to macOS Keychain.", error);
    });
  }, [bootstrapped]);

  useEffect(() => {
    let active = true;
    let unlistenDelete = () => {};
    let unlistenTrayOcr = () => {};

    void listenTauri<string>("tinybu-notch-tray-delete-requested", (event) => {
      if (!active) return;
      void deleteCaptureAndSyncTopics(event.payload);
    }).then((cleanup) => {
      if (active) unlistenDelete = cleanup;
      else cleanup();
    });

    void listenTauri<SwiftNotchTrayOcrRequest>("tinybu-notch-tray-ocr-requested", async (event) => {
      const { jobId, captureId, text, lines, language, truncated, error } = event.payload;
      try {
        const capture = await db.captures.get(captureId);
        if (!capture?.screenshot) throw new Error("The screenshot is no longer available in Tray.");
        const sourceText = text.trim() || error || "No readable text was found in this screenshot.";
        const updated = {
          ...capture,
          sourceText,
          summary: text.trim() ? text.replace(/\s+/g, " ").slice(0, 160) : sourceText,
          fragments: (lines.length ? lines : [sourceText]).slice(0, 100).map((line, index) => ({
            id: uid("fragment"),
            text: line,
            selected: true,
            recommended: true,
            sourceIndex: index
          })),
          screenshot: {
            ...capture.screenshot,
            language,
            contextNote: "Recognized locally with Apple Vision.",
            visibleText: lines,
            errorMessages: error ? [error] : [],
            ocrTruncated: truncated
          }
        };
        await db.captures.put(updated);
        setCaptures((items) => items.map((item) => (item.id === captureId ? updated : item)));
        if (!active) return;
        await invokeTauri("complete_swift_notch_tray_ocr", { payload: { jobId } });
      } catch (saveError) {
        await invokeTauri("fail_swift_notch_job", {
          jobId,
          message: saveError instanceof Error ? saveError.message : "TinyBu could not save the recognized text."
        });
      }
    }).then((cleanup) => {
      if (active) unlistenTrayOcr = cleanup;
      else cleanup();
    });

    return () => {
      active = false;
      unlistenDelete();
      unlistenTrayOcr();
    };
  }, []);

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
    const previousMode = appStateRef.current.settings.desktopCompanionMode;
    const nextMode = nextState.settings.desktopCompanionMode;
    const modeChanged = nextMode !== previousMode;
    if (modeChanged) {
      if (!(await applyDesktopCompanionMode(nextMode))) {
        setApiKeyStatus("Could not switch desktop companion mode. The previous mode is still active.");
        showToast("Could not switch desktop companion mode. TinyBu kept the previous mode.");
        return false;
      }
      appliedDesktopModeRef.current = nextMode;
    }

    try {
      if (key?.trim()) {
        await saveUserApiKey(key.trim());
        nextState.settings.apiKeySaved = true;
        setApiKeyDraft("");
        setApiKeyStatus("API key saved for this device.");
      } else {
        setApiKeyStatus("Settings saved.");
      }
      await persistState(nextState);
      return true;
    } catch (error) {
      console.error("saveSettings failed", error);
      const modeRestored = !modeChanged || (await applyDesktopCompanionMode(previousMode));
      if (modeRestored) {
        appliedDesktopModeRef.current = previousMode;
      } else {
        appliedDesktopModeRef.current = null;
      }
      setApiKeyStatus(
        modeRestored
          ? "Settings could not be saved. The previous desktop mode is still active."
          : "Settings could not be saved or restored. Restart TinyBu to recover the saved mode."
      );
      showToast("Settings could not be saved. Please try again.");
      return false;
    }
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
      setCaptures((items) => [...items]);
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

  useEffect(() => {
    if (!bootstrapped) return;
    const mode = appState.settings.desktopCompanionMode;
    if (appliedDesktopModeRef.current === mode) return;

    let cancelled = false;
    void applyDesktopCompanionMode(mode).then(async (applied) => {
      if (cancelled) return;
      if (applied) {
        appliedDesktopModeRef.current = mode;
        return;
      }

      const currentState = appStateRef.current;
      const fallbackState = {
        ...currentState,
        settings: { ...currentState.settings, desktopCompanionMode: "pet" as const }
      };
      appliedDesktopModeRef.current = "pet";
      await persistState(fallbackState);
      showToast("Swift notch could not start. TinyBu restored pet mode.");
    });

    return () => {
      cancelled = true;
    };
  }, [bootstrapped, appState.settings.desktopCompanionMode]);

  useEffect(() => {
    let active = true;
    let unlisten = () => {};
    void listenTauri<string>("tinybu-desktop-companion-fallback", async () => {
      const currentState = appStateRef.current;
      if (currentState.settings.desktopCompanionMode === "pet") return;
      appliedDesktopModeRef.current = "pet";
      await persistState({
        ...currentState,
        settings: { ...currentState.settings, desktopCompanionMode: "pet" }
      });
      showToast("Swift notch stopped unexpectedly. TinyBu restored pet mode.");
    }).then((cleanup) => {
      if (active) unlisten = cleanup;
      else cleanup();
    });

    return () => {
      active = false;
      unlisten();
    };
  }, []);

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
        askAboutScreenshot={async (capture, question) => {
          await askAboutScreenshot(capture, question);
        }}
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
