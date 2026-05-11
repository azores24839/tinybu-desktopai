import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Brain,
  ChevronLeft,
  Home,
  Inbox,
  KeyRound,
  NotebookTabs,
  Plus,
  RotateCcw,
  Settings,
  Wand2
} from "lucide-react";
import { demoContents } from "./data/demoContent";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { TinyBuOrb } from "./components/TinyBuOrb";
import { ToastContainer } from "./components/ToastContainer";
import { clearLearningData, db, loadAppState, saveAppState } from "./lib/db";
import { clearUserApiKey, loadUserApiKey, saveUserApiKey } from "./lib/secureKey";
import { invokeTauri, listenTauri, type CaptureBridgeState } from "./lib/tauriBridge";
import { defaultAppState, nowIso, uid } from "./lib/defaults";
import { uiCopy } from "./lib/uiCopy";
import {
  captureText,
  splitCaptureText
} from "./features/captures/captureUtils";
import { InboxPage } from "./features/captures/InboxPage";
import { OrganizePage } from "./features/captures/OrganizePage";
import { topicCaptures, topicExpressions } from "./features/topics/topicUtils";
import { useTopics } from "./features/topics/useTopics";
import { TopicsPage } from "./features/topics/TopicsPage";
import { TopicDetailPage } from "./features/topics/TopicDetailPage";
import { StudyRoomPage } from "./features/topics/StudyRoomPage";
import { NotebookPage } from "./features/notebook/NotebookPage";
import { MemoryPage } from "./features/memory/MemoryPage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { HomePage } from "./features/home/HomePage";
import { PracticePage } from "./features/practice/PracticePage";
import { PracticeReviewPage } from "./features/practice/PracticeReviewPage";
import { PracticePreparingPage } from "./features/practice/PracticePreparingPage";
import { PracticeChatPage } from "./features/practice/PracticeChatPage";
import { usePracticeChat } from "./features/practice/usePracticeChat";
import {
  buildPracticeAnswer,
  buildPracticeQuestionWithTip,
  buildPracticeQuestions,
  buildPracticeSession,
  buildCompletedPracticeSession,
  buildPracticedCaptures,
  buildPracticedTopic,
  buildPracticeReviewRecord,
  buildSavedPracticeExpressions,
  selectPracticeFragments,
  selectPracticeReviewFragments
} from "./features/practice/practiceUtils";
import { WelcomePage } from "./features/setup/WelcomePage";
import { OnboardingPage } from "./features/setup/OnboardingPage";
import { CompanionSetupPage } from "./features/setup/CompanionSetupPage";
import { useScreenshotCaptureFlow } from "./features/screenshots/useScreenshotCaptureFlow";
import {
  generatePracticeTip,
  generatePracticeTurn,
  generateReview,
  recommendFragments,
  understandContent,
  updateMemory
} from "./ai/provider";
import type {
  AppStateRecord,
  CaptureFragment,
  CaptureItem,
  CaptureStatus,
  CompanionProfile,
  ExpressionRecord,
  ExternalCaptureKind,
  ExternalCapturePayload,
  MemoryItem,
  CompanionState,
  PracticeAnswer,
  PracticeSession,
  ReviewRecord,
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

function weekStart() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - date.getDay());
  return date;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("welcome");
  const [appState, setAppState] = useState<AppStateRecord>(defaultAppState);
  const [captures, setCaptures] = useState<CaptureItem[]>([]);
  const { topics, setTopics, updateTopic, createTopicFromCaptures, addCapturesToTopic, openTopic, markTopicStudied } = useTopics({
    captures,
    setCaptures,
    persistState,
    navigate,
    appState
  });
  const [practiceSessions, setPracticeSessions] = useState<PracticeSession[]>([]);
  const [reviews, setReviews] = useState<ReviewRecord[]>([]);
  const [expressions, setExpressions] = useState<ExpressionRecord[]>([]);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [companionState, setCompanionState] = useState<CompanionState>("idle");
  const [practiceInput, setPracticeInput] = useState("");
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
  const activeSession = useMemo(
    () =>
      practiceSessions.find((session) => session.id === appState.activePracticeSessionId) ??
      practiceSessions.find((session) => session.topicId === activeTopic?.id && session.status === "active") ??
      practiceSessions[0],
    [activeTopic?.id, appState.activePracticeSessionId, practiceSessions]
  );
  const activeReview = useMemo(
    () => reviews.find((review) => review.id === activeSession?.reviewId) ?? reviews[0],
    [activeSession?.reviewId, reviews]
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

  const { practiceChatFirstQuestion, startPracticeForTopic, handlePreparingReady, handlePracticeChatReply, endPracticeChat } = usePracticeChat({
    captures,
    activeTopic,
    appState,
    persistState,
    navigate
  });

  useEffect(() => {
    async function boot() {
      const [state, storedCaptures, storedTopics, storedSessions, storedReviews, storedExpressions, storedMemories] =
        await Promise.all([
          loadAppState(),
          db.captures.orderBy("capturedAt").reverse().toArray(),
          db.topics.orderBy("updatedAt").reverse().toArray(),
          db.practiceSessions.orderBy("updatedAt").reverse().toArray(),
          db.reviews.orderBy("createdAt").reverse().toArray(),
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
      setPracticeSessions(storedSessions);
      setReviews(storedReviews);
      setExpressions(storedExpressions);
      setMemories(storedMemories);
      setScreen(bootState.onboarded ? (bootState.companionReady ? "home" : "companion") : "welcome");
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
  }, [appState]);

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
  }, [appState]);

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
        appState
      });
      await db.captures.put(capture);
      setCaptures((items) => [capture, ...items]);
      await persistState({
        ...appState,
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
  }, [appState]);

  useEffect(() => {
    let unlisten = () => {};
    listenTauri<ScreenshotCapturePayload>("tinybu-screenshot-captured", (event) => {
      void importScreenshotCapture(event.payload);
    }).then((cleanup) => {
      unlisten = cleanup;
    });
    return () => unlisten();
  }, [appState]);

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
            appState
          })
        );
      }
      if (importedCaptures.length) {
        await db.captures.bulkPut(importedCaptures);
        setCaptures((items) => [...importedCaptures, ...items]);
        await persistState({
          ...appState,
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

  async function createCaptureRecord(args: {
    title: string;
    sourceUrl: string;
    sourceKind: ExternalCaptureKind;
    text: string;
    capturedAt?: string;
    appState: AppStateRecord;
    screenshot?: CaptureItem["screenshot"];
  }): Promise<CaptureItem> {
    const pieces = splitCaptureText(args.text);
    const subtitleContent = args.sourceKind === "youtube" || args.sourceKind === "video";
    const shortContent = subtitleContent || pieces.length <= 6;
    const contentForUnderstanding = {
      id: uid("content"),
      title: args.title || "Untitled Capture",
      topic: "",
      sourceType: "external" as const,
      sourceUrl: args.sourceUrl,
      sourceKind: args.sourceKind,
      transcript: pieces.map((text, index) => ({ id: uid(`line-${index}`), text })),
      summary: "",
      keywords: [],
      questions: []
    };
    const understanding = await understandContent(contentForUnderstanding, args.appState);
    let fragments: CaptureFragment[] = pieces.map((text, index) => ({
      id: uid("fragment"),
      text,
      selected: shortContent,
      recommended: shortContent,
      sourceIndex: index
    }));

    if (!shortContent) {
      const recommendation = await recommendFragments(fragments, args.appState);
      const recommendedIds = new Set(recommendation.recommendedFragmentIds.slice(0, 6));
      fragments = fragments.map((fragment) => ({
        ...fragment,
        selected: recommendedIds.has(fragment.id),
        recommended: recommendedIds.has(fragment.id)
      }));
    }

    return {
      id: uid("capture"),
      title: args.title || "Untitled Capture",
      sourceUrl: args.sourceUrl,
      sourceKind: args.sourceKind,
      sourceText: args.text,
      screenshot: args.screenshot,
      topic: understanding.topic,
      summary: understanding.summary,
      keywords: understanding.keywords,
      questions: understanding.questions,
      suggestedExpressions: understanding.suggestedExpressions,
      capturedAt: args.capturedAt ?? nowIso(),
      fragments,
      status: understanding.topic ? "suggested" : "unsorted"
    };
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

  async function updateCapture(nextCapture: CaptureItem) {
    await db.captures.put(nextCapture);
    setCaptures((items) => items.map((item) => (item.id === nextCapture.id ? nextCapture : item)));
  }

  async function openCapture(capture: CaptureItem) {
    await updateState((state) => ({ ...state, activeCaptureId: capture.id }));
  }

  async function archiveCapture(capture: CaptureItem) {
    await updateCapture({ ...capture, status: "archived" });
  }

  async function deleteCapture(id: string) {
    await db.captures.delete(id);
    setCaptures((items) => items.filter((item) => item.id !== id));
  }

  async function updatePracticeSession(session: PracticeSession) {
    await db.practiceSessions.put(session);
    setPracticeSessions((items) => items.map((item) => (item.id === session.id ? session : item)));
  }

  async function requestTip(session: PracticeSession) {
    const question = session.questions[session.currentQuestionIndex];
    if (!question || question.tipLevel >= 2) return;
    const nextLevel = question.tipLevel + 1;
    setCompanionState("thinking");
    const tip = await generatePracticeTip({
      question: question.question,
      tipLevel: nextLevel,
      outline: question.tipOutline,
      example: question.tipExample,
      appState
    });
    const updatedQuestion = buildPracticeQuestionWithTip({ question, tip, nextLevel });
    await updatePracticeSession({
      ...session,
      questions: session.questions.map((item) => (item.id === question.id ? updatedQuestion : item)),
      updatedAt: nowIso()
    });
    setCompanionState("encouraging");
  }

  async function submitPracticeAnswer(session: PracticeSession) {
    const answer = practiceInput.trim();
    const question = session.questions[session.currentQuestionIndex];
    if (!answer || !question) return;
    setPracticeInput("");
    setCompanionState("thinking");
    const turn = await generatePracticeTurn({
      answer,
      question: question.question,
      questionIndex: session.currentQuestionIndex,
      appState
    });
    const practiceAnswer = buildPracticeAnswer({
      question,
      answer,
      turn,
      createId: () => uid("answer"),
      now: nowIso
    });
    const answers = [...session.answers, practiceAnswer];
    if (session.currentQuestionIndex >= session.questions.length - 1) {
      await finishPractice(session, answers);
      return;
    }
    await updatePracticeSession({
      ...session,
      answers,
      currentQuestionIndex: session.currentQuestionIndex + 1,
      updatedAt: nowIso()
    });
    setCompanionState("listening");
  }

  async function finishPractice(session: PracticeSession, answers: PracticeAnswer[]) {
    const topic = topics.find((item) => item.id === session.topicId);
    const capturesForTopic = topicCaptures(topic, captures);
    const selectedFragments = selectPracticeReviewFragments(capturesForTopic, session.selectedFragmentIds);
    if (!topic || !selectedFragments.length) return;

    setBusyLabel("Generating Practice Review");
    const reviewOutput = await generateReview({
      title: topic.name,
      fragments: selectedFragments,
      answers,
      appState
    });
    const savedExpressions = buildSavedPracticeExpressions({
      reviewOutput,
      topic,
      createId: () => uid("expression"),
      now: nowIso
    });
    const review = buildPracticeReviewRecord({
      reviewOutput,
      session,
      savedExpressions,
      createId: () => uid("review"),
      now: nowIso
    });
    const completedSession = buildCompletedPracticeSession({
      session,
      answers,
      review,
      now: nowIso
    });
    const updatedCaptures = buildPracticedCaptures(capturesForTopic);
    const nextTopic = buildPracticedTopic({ topic, savedExpressionCount: savedExpressions.length, now: nowIso });
    const memoryUpdate = await updateMemory({
      review: reviewOutput,
      expressions: savedExpressions,
      appState
    });

    await Promise.all([
      db.reviews.put(review),
      db.expressions.bulkPut(savedExpressions),
      db.memories.bulkPut(memoryUpdate.memories),
      db.practiceSessions.put(completedSession),
      db.captures.bulkPut(updatedCaptures),
      db.topics.put(nextTopic)
    ]);
    setReviews((items) => [review, ...items]);
    setExpressions((items) => [...savedExpressions, ...items]);
    setMemories((items) => [...memoryUpdate.memories, ...items]);
    setPracticeSessions((items) => items.map((item) => (item.id === session.id ? completedSession : item)));
    setCaptures((items) => items.map((item) => updatedCaptures.find((capture) => capture.id === item.id) ?? item));
    setTopics((items) => items.map((item) => (item.id === topic.id ? nextTopic : item)));
    setBusyLabel("");
    setCompanionState("celebrating");
    navigate("practice-review");
  }

  async function saveExpressionFromCapture(capture: CaptureItem, expression: string) {
    const record: ExpressionRecord = {
      id: uid("expression"),
      original: expression,
      meaning: capture.summary || "Saved from Study Room",
      keywords: capture.keywords ?? [],
      pattern: expression,
      scene: capture.topic || "Study Room",
      practiceStem: expression,
      sourceTitle: capture.title,
      sourceContentId: capture.id,
      capturedAt: nowIso(),
      saved: true,
      useLater: true,
      usedInTalk: false,
      userSentence: "",
      practiceCount: 0,
      learned: false,
      category: "captured"
    };
    await db.expressions.put(record);
    setExpressions((items) => [record, ...items]);
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
    setPracticeSessions([]);
    setReviews([]);
    setExpressions([]);
    setMemories([]);
    await persistState({ ...appState, activeCaptureId: "", activeTopicId: "", activePracticeSessionId: "" });
  }

  async function updateExpression(record: ExpressionRecord) {
    await db.expressions.put(record);
    setExpressions((items) => items.map((item) => (item.id === record.id ? record : item)));
  }

  async function deleteExpression(id: string) {
    await db.expressions.delete(id);
    setExpressions((items) => items.filter((item) => item.id !== id));
  }

  const shellScreens: Screen[] = [
    "home",
    "inbox",
    "organize",
    "topics",
    "topic-detail",
    "study-room",
    "practice-preparing",
    "practice-chat",
    "practice",
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

      {shellScreens.includes(screen) ? (
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
                className={["topics", "topic-detail", "study-room", "practice-preparing", "practice-chat", "practice", "practice-review"].includes(screen) ? "active" : ""}
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
                sessions={practiceSessions}
                memories={memories}
                openInbox={() => navigate("inbox")}
                openTopic={openTopic}
                continuePractice={async (session) => {
                  const topic = topics.find((item) => item.id === session.topicId);
                  await persistState({
                    ...appState,
                    activeTopicId: topic?.id ?? appState.activeTopicId,
                    activePracticeSessionId: session.id
                  });
                  navigate("practice");
                }}
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
                deleteCapture={deleteCapture}
                createTopicFromCaptures={createTopicFromCaptures}
                addCapturesToTopic={addCapturesToTopic}
                saveExpressionFromCapture={saveExpressionFromCapture}
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
                saveExpression={saveExpressionFromCapture}
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
            {screen === "practice-chat" && activeTopic && practiceChatFirstQuestion && (
              <PracticeChatPage
                topic={activeTopic}
                opening={copy.practiceChat.opening}
                firstQuestion={practiceChatFirstQuestion}
                onChatReply={handlePracticeChatReply}
                onEnd={endPracticeChat}
                interfaceLanguage={appState.profile.interfaceLanguage}
              />
            )}
            {screen === "practice" && activeTopic && activeSession && (
              <PracticePage
                topic={activeTopic}
                captures={topicCaptures(activeTopic, captures)}
                session={activeSession}
                input={practiceInput}
                setInput={setPracticeInput}
                requestTip={requestTip}
                submitAnswer={submitPracticeAnswer}
                endPractice={() => navigate("practice-review")}
              />
            )}
            {screen === "practice-review" && activeTopic && activeReview && (
              <PracticeReviewPage
                topic={activeTopic}
                review={activeReview}
                session={activeSession}
                expressions={expressions}
                backToTopics={() => navigate("topics")}
                openNotebook={() => navigate("notebook")}
                continuePractice={() => startPracticeForTopic(activeTopic)}
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
