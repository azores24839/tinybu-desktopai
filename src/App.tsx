import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Brain,
  Home,
  Inbox,
  NotebookTabs,
  Settings,
  Wand2
} from "lucide-react";
import { demoContents } from "./data/demoContent";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { TinyBuOrb } from "./components/TinyBuOrb";
import { ToastContainer } from "./components/ToastContainer";
import { clearLearningData, db, loadAppState, saveAppState } from "./lib/db";
import { clearUserApiKey, loadUserApiKey, saveUserApiKey } from "./lib/secureKey";
import { showToast } from "./lib/toast";
import { invokeTauri, listenTauri, type CaptureBridgeState } from "./lib/tauriBridge";
import { defaultAppState, nowIso } from "./lib/defaults";
import { uiCopy } from "./lib/uiCopy";
import {
  captureText,
} from "./features/captures/captureUtils";
import { InboxPage } from "./features/captures/InboxPage";
import { OrganizePage } from "./features/captures/OrganizePage";
import { useCaptures } from "./features/captures/useCaptures";
import { saveExpressionFromCapture } from "./features/captures/saveExpression";
import { topicCaptures, topicExpressions } from "./features/topics/topicUtils";
import { useTopics } from "./features/topics/useTopics";
import { TopicsPage } from "./features/topics/TopicsPage";
import { TopicDetailPage } from "./features/topics/TopicDetailPage";
import { StudyRoomPage } from "./features/topics/StudyRoomPage";
import { NotebookPage } from "./features/notebook/NotebookPage";
import { MemoryPage } from "./features/memory/MemoryPage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { HomePage } from "./features/home/HomePage";
import { PracticeReviewPage } from "./features/practice/PracticeReviewPage";
import { PracticePreparingPage } from "./features/practice/PracticePreparingPage";
import { PracticeChatPage } from "./features/practice/PracticeChatPage";
import { usePracticeChat } from "./features/practice/usePracticeChat";
import { WelcomePage } from "./features/setup/WelcomePage";
import { OnboardingPage } from "./features/setup/OnboardingPage";
import { CompanionSetupPage } from "./features/setup/CompanionSetupPage";
import { useScreenshotCaptureFlow } from "./features/screenshots/useScreenshotCaptureFlow";
import type {
  AppStateRecord,
  CaptureItem,
  CompanionProfile,
  ExpressionRecord,
  ExternalCaptureKind,
  ExternalCapturePayload,
  MemoryItem,
  CompanionState,
  Screen,
  ScreenshotCapturePayload,
  TopicItem,
  UserProfile
} from "./types";

const CAPTURE_QUERY_PARAM = "tinybuCapture";
const CAPTURE_MESSAGE_TYPE = "TINYBU_CAPTURE";

function parseIncomingCapture(): ExternalCapturePayload | null {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get(CAPTURE_QUERY_PARAM);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ExternalCapturePayload;
  } catch {
    try {
      return JSON.parse(decodeURIComponent(raw)) as ExternalCapturePayload;
    } catch {
      return null;
    }
  }
}

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
  const lastExternalCaptureSignature = useRef("");
  const bridgeImportingRef = useRef(false);
  const initialBridgeDrainRef = useRef(false);

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
  } = usePracticeChat({
    captures,
    setCaptures,
    setTopics,
    activeTopic,
    appState: appStateRef.current,
    persistState,
    navigate
  });

  useEffect(() => {
    async function boot() {
      try {
      const [state, storedCaptures, storedTopics, storedExpressions, storedMemories] =
        await Promise.all([
          loadAppState(),
          db.captures.orderBy("capturedAt").reverse().toArray(),
          db.topics.orderBy("updatedAt").reverse().toArray(),
          db.expressions.orderBy("capturedAt").reverse().toArray(),
          db.memories.orderBy("updatedAt").reverse().toArray()
        ]);

      const incomingCapture = parseIncomingCapture();
      let bootState = state;
      let nextCaptures = storedCaptures;

      if (incomingCapture?.text) {
        const capture = await createCaptureRecord({
          title: incomingCapture.title || "Imported Web Content",
          sourceUrl: incomingCapture.url || "",
          sourceKind: incomingCapture.kind || "selection",
          text: incomingCapture.text,
          capturedAt: incomingCapture.capturedAt || nowIso(),
          appState: state
        });
        await db.captures.put(capture);
        nextCaptures = [capture, ...nextCaptures];
        bootState = {
          ...state,
          onboarded: true,
          companionReady: true,
          activeCaptureId: capture.id,
          pastedTranscript: incomingCapture.text,
          pastedSourceTitle: capture.title,
          pastedSourceUrl: capture.sourceUrl,
          pastedSourceKind: capture.sourceKind
        };
        await saveAppState(bootState);
        window.history.replaceState({}, document.title, window.location.pathname);
      }

      setAppState(bootState);
      setHomePasteDraft(bootState.pastedTranscript);
      setCaptures(nextCaptures);
      setTopics(storedTopics);
      setExpressions(storedExpressions);
      setMemories(storedMemories);
      setScreen(bootState.onboarded ? (bootState.companionReady ? "home" : "companion") : "welcome");
      } catch (error) {
        console.error("boot() failed, starting with empty state", error);
        setAppState(defaultAppState);
        setScreen("welcome");
      }
    }

    boot();
  }, []);

  useEffect(() => {
    let active = true;
    let unlisten = () => {};

    listenTauri("tinybu-open-captures", () => {
      void importPendingBridgeCaptures();
    }).then((cleanup) => {
      if (active) unlisten = cleanup;
      else cleanup();
    });

    return () => {
      active = false;
      unlisten();
    };
  }, []);

  useEffect(() => {
    if (!appState.onboarded || initialBridgeDrainRef.current) return;
    initialBridgeDrainRef.current = true;

    void invokeTauri<CaptureBridgeState>("get_capture_bridge_state").then((state) => {
      if ((state?.pendingCount ?? 0) > 0) {
        void importPendingBridgeCaptures();
      }
    });
  }, [appState.onboarded]);

  useEffect(() => {
    let active = true;
    let unlisten = () => {};

    listenTauri<CaptureBridgeState>("tinybu-capture-bridge-updated", (event) => {
      if ((event.payload?.pendingCount ?? 0) > 0) {
        void importPendingBridgeCaptures();
      }
    }).then((cleanup) => {
      if (active) unlisten = cleanup;
      else cleanup();
    });

    return () => {
      active = false;
      unlisten();
    };
  }, []);

  useEffect(() => {
    async function handleExtensionCapture(event: MessageEvent) {
      if (event.data?.type !== CAPTURE_MESSAGE_TYPE) return;
      const incomingCapture = event.data.payload as ExternalCapturePayload;
      const text = incomingCapture?.text?.trim();
      if (!text) return;
      const signature = [incomingCapture.kind, incomingCapture.title, incomingCapture.url, text].join("::");
      if (signature === lastExternalCaptureSignature.current) return;
      lastExternalCaptureSignature.current = signature;

      const capture = await createCaptureRecord({
        title: incomingCapture.title || "Browser Capture",
        sourceUrl: incomingCapture.url || "",
        sourceKind: incomingCapture.kind || "selection",
        text,
        capturedAt: incomingCapture.capturedAt || nowIso(),
        appState: appStateRef.current
      });
      await db.captures.put(capture);
      setCaptures((items) => [capture, ...items]);
      await persistState({
        ...appStateRef.current,
        onboarded: true,
        companionReady: true,
        activeCaptureId: capture.id,
        pastedTranscript: text,
        pastedSourceTitle: capture.title,
        pastedSourceUrl: capture.sourceUrl,
        pastedSourceKind: capture.sourceKind
      });
      navigate("inbox");
    }

    window.addEventListener("message", handleExtensionCapture);
    return () => window.removeEventListener("message", handleExtensionCapture);
  }, []);

  useEffect(() => {
    let unlisten = () => {};
    listenTauri<ScreenshotCapturePayload>("tinybu-screenshot-captured", (event) => {
      void importScreenshotCapture(event.payload);
    }).then((cleanup) => {
      unlisten = cleanup;
    });
    return () => unlisten();
  }, []);

  async function importPendingBridgeCaptures() {
    if (bridgeImportingRef.current) return;
    bridgeImportingRef.current = true;
    setBusyLabel("Importing captures");
    try {
      const pendingCaptures = await invokeTauri<ExternalCapturePayload[]>("drain_pending_captures");
      const importedCaptures: CaptureItem[] = [];
      for (const incomingCapture of pendingCaptures ?? []) {
        const text = incomingCapture.text?.trim();
        if (!text) continue;
        importedCaptures.push(
          await createCaptureRecord({
            title: incomingCapture.title || "Desktop Capture",
            sourceUrl: incomingCapture.url || "",
            sourceKind: incomingCapture.kind || "selection",
            text,
            capturedAt: incomingCapture.capturedAt || nowIso(),
            appState: appStateRef.current
          })
        );
      }
      if (importedCaptures.length) {
        await db.captures.bulkPut(importedCaptures);
        setCaptures((items) => [...importedCaptures, ...items]);
        await persistState({
          ...appStateRef.current,
          onboarded: true,
          companionReady: true,
          activeCaptureId: importedCaptures[0].id
        });
        navigate("inbox");
      }
    } finally {
      setBusyLabel("");
      bridgeImportingRef.current = false;
    }
  }

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
    navigate("inbox");
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
    navigate("inbox");
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

  useEffect(() => {
    if (screen === "topic-detail" && activeTopic) {
      loadTopicPracticeChatReviews(activeTopic.id);
    }
  }, [screen, activeTopic?.id]);

  const shellScreens: Screen[] = [
    "home",
    "inbox",
    "organize",
    "topics",
    "topic-detail",
    "study-room",
    "practice-preparing",
    "practice-review",
    "notebook",
    "memory",
    "settings"
  ];
  const copy = uiCopy[appState.profile.interfaceLanguage];

  return (
    <ErrorBoundary>
    <div className="app">
      {busyLabel && (
        <div className="busy-banner">
          <Wand2 size={16} />
          {busyLabel}
        </div>
      )}

      {screen === "practice-chat" && activeTopic && practiceChatFirstQuestion ? (
        <PracticeChatPage
          topic={activeTopic}
          captures={topicCaptures(activeTopic, captures)}
          practicePlan={practicePlan}
          opening={copy.practiceChat.opening}
          firstQuestion={practiceChatFirstQuestion}
          onChatReply={handlePracticeChatReply}
          onEndWithReview={finishPracticeChatWithReview}
          onExit={endPracticeChatWithoutSaving}
          interfaceLanguage={appState.profile.interfaceLanguage}
          targetLanguage={appState.profile.targetLanguage}
          nativeLanguage={appState.profile.nativeLanguage}
        />
      ) : shellScreens.includes(screen) ? (
        <div className="desktop-shell home-shell">
          <aside className="sidebar">
            <button className="brand-button" onClick={() => navigate("home")}>
              <TinyBuOrb state={companionState} />
              <span>TinyBu</span>
            </button>
            <nav>
              <button className={screen === "home" ? "active" : ""} onClick={() => navigate("home")}>
                <Home size={18} /> {copy.nav.home}
              </button>
              <button className={screen === "inbox" || screen === "organize" ? "active" : ""} onClick={() => navigate("inbox")}>
                <Inbox size={18} /> {copy.nav.inbox}
              </button>
              <button
                className={["topics", "topic-detail", "study-room", "practice-preparing", "practice-review", "practice-chat-review"].includes(screen) ? "active" : ""}
                onClick={() => navigate("topics")}
              >
                <BookOpen size={18} /> {copy.nav.topics}
              </button>
              <button className={screen === "notebook" ? "active" : ""} onClick={() => navigate("notebook")}>
                <NotebookTabs size={18} /> {copy.nav.notebook}
              </button>
              <button className={screen === "memory" ? "active" : ""} onClick={() => navigate("memory")}>
                <Brain size={18} /> {copy.nav.memory}
              </button>
              <button className={screen === "settings" ? "active" : ""} onClick={() => navigate("settings")}>
                <Settings size={18} /> {copy.nav.settings}
              </button>
            </nav>
            <button className="settings-link upgrade-link" onClick={() => navigate("settings")}>
              {copy.home.upgrade}
            </button>
          </aside>

          <main className="main-panel">
            {screen === "home" && (
              <HomePage
                appState={appState}
                captures={captures}
                topics={topics}
                memories={memories}
                openInbox={() => navigate("inbox")}
                openTopic={openTopic}
                upgrade={() => navigate("settings")}
                tryDemo={startDemo}
              />
            )}
            {screen === "inbox" && (
              <InboxPage
                captures={captures}
                topics={topics}
                activeCapture={activeCapture}
                openCapture={openCapture}
                updateCapture={updateCapture}
                confirmScreenshotText={confirmScreenshotText}
                archiveCapture={archiveCapture}
                deleteCapture={deleteCaptureAndSyncTopics}
                createTopicFromCaptures={createTopicFromCaptures}
                addCapturesToTopic={addCapturesToTopic}
                saveExpressionFromCapture={(capture, expression) => saveExpressionFromCapture(capture, expression, setExpressions)}
              />
            )}
            {screen === "organize" && (
              <OrganizePage
                captures={captures}
                topics={topics}
                createTopicFromCaptures={createTopicFromCaptures}
                addCapturesToTopic={addCapturesToTopic}
                back={() => navigate("inbox")}
              />
            )}
            {screen === "topics" && (
              <TopicsPage topics={topics} captures={captures} expressions={expressions} openTopic={openTopic} startPractice={startPracticeForTopic} />
            )}
            {screen === "topic-detail" && activeTopic && (
              <TopicDetailPage
                topic={activeTopic}
                captures={topicCaptures(activeTopic, captures)}
                expressions={topicExpressions(activeTopic, expressions)}
                practiceChatReviews={topicPracticeChatReviews}
                updateTopic={updateTopic}
                openStudyRoom={async () => {
                  await markTopicStudied(activeTopic);
                  navigate("study-room");
                }}
                startPractice={() => startPracticeForTopic(activeTopic)}
                back={() => navigate("topics")}
              />
            )}
            {screen === "study-room" && activeTopic && (
              <StudyRoomPage
                topic={activeTopic}
                captures={topicCaptures(activeTopic, captures)}
                expressions={topicExpressions(activeTopic, expressions)}
                activeCapture={activeCapture}
                setActiveCapture={async (capture) => {
                  await persistState({ ...appState, activeCaptureId: capture.id });
                }}
                saveExpression={(capture, expression) => saveExpressionFromCapture(capture, expression, setExpressions)}
                startPractice={() => startPracticeForTopic(activeTopic)}
                back={() => navigate("topic-detail")}
                screenshotQuestionInput={screenshotQuestionInput}
                setScreenshotQuestionInput={setScreenshotQuestionInput}
                askAboutScreenshot={askAboutScreenshot}
                confirmScreenshotText={confirmScreenshotText}
                screenshotQuestionBusy={screenshotQuestionBusy}
              />
            )}
            {screen === "practice-preparing" && (
              <PracticePreparingPage
                interfaceLanguage={appState.profile.interfaceLanguage}
                onReady={handlePreparingReady}
              />
            )}
            {screen === "practice-review" && activeTopic && practiceChatReview && (
              <PracticeReviewPage
                topic={activeTopic}
                review={practiceChatReview}
                onDone={async (review) => {
                  await saveReviewAndGoToTopic(review);
                }}
                onPracticeAgain={async (review) => {
                  await saveReviewAndPracticeAgain(review, activeTopic);
                }}
                interfaceLanguage={appState.profile.interfaceLanguage}
              />
            )}
            {screen === "notebook" && (
              <NotebookPage expressions={expressions} updateExpression={updateExpression} deleteExpression={deleteExpression} />
            )}
            {screen === "memory" && (
              <MemoryPage
                memories={memories}
                topics={topics}
                expressions={expressions}
                updateMemoryItem={async (item) => {
                  await db.memories.put(item);
                  setMemories((items) => items.map((memory) => (memory.id === item.id ? item : memory)));
                }}
                deleteMemory={async (id) => {
                  await db.memories.delete(id);
                  setMemories((items) => items.filter((item) => item.id !== id));
                }}
              />
            )}
            {screen === "settings" && (
              <SettingsPage
                appState={appState}
                apiKeyDraft={apiKeyDraft}
                apiKeyStatus={apiKeyStatus}
                setApiKeyDraft={setApiKeyDraft}
                saveSettings={saveSettings}
                checkUserKey={async () => {
                  const key = await loadUserApiKey();
                  setApiKeyStatus(key ? "API key is readable by TinyBu." : "No API key found on this device.");
                }}
                clearUserKey={async () => {
                  await clearUserApiKey();
                  setApiKeyStatus("API key cleared.");
                  await updateState((state) => ({
                    ...state,
                    settings: { ...state.settings, apiKeySaved: false }
                  }));
                }}
                clearMemory={clearMemoryOnly}
                clearAllData={clearAllData}
                resetOnboarding={resetOnboarding}
              />
            )}
          </main>
        </div>
      ) : (
        <main className="entry-shell">
          {screen === "welcome" && <WelcomePage start={() => navigate("onboarding")} demo={startDemo} />}
          {screen === "onboarding" && (
            <OnboardingPage initialProfile={appState.profile} submit={submitOnboarding} skip={() => submitOnboarding(defaultAppState.profile)} />
          )}
          {screen === "companion" && (
            <CompanionSetupPage
              initialCompanion={appState.companion}
              submit={submitCompanion}
              skip={() => submitCompanion(defaultAppState.companion)}
            />
          )}
        </main>
      )}
    </div>
    <ToastContainer />
    </ErrorBoundary>
  );
}
