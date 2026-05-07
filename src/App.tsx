import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Brain,
  ChevronLeft,
  ChevronRight,
  Crown,
  Home,
  Inbox,
  KeyRound,
  Lightbulb,
  NotebookTabs,
  Plus,
  RotateCcw,
  Send,
  Settings,
  Sparkles,
  Wand2
} from "lucide-react";
import { demoContents } from "./data/demoContent";
import { AppHeader } from "./components/AppHeader";
import { EmptyState } from "./components/EmptyState";
import { NomiOrb } from "./components/NomiOrb";
import { clearLearningData, db, loadAppState, normalizeCapture, saveAppState } from "./lib/db";
import { clearUserApiKey, loadUserApiKey, saveUserApiKey } from "./lib/secureKey";
import { invokeTauri, listenTauri, type CaptureBridgeState } from "./lib/tauriBridge";
import { defaultAppState, nowIso, uid } from "./lib/defaults";
import { formatDate } from "./lib/date";
import { uiCopy } from "./lib/uiCopy";
import {
  captureText,
  inferPracticeGoal,
  normalizeStatus,
  splitCaptureText,
  suggestedGroups
} from "./features/captures/captureUtils";
import { InboxPage } from "./features/captures/InboxPage";
import { OrganizePage } from "./features/captures/OrganizePage";
import { topicCaptures, topicExpressions } from "./features/topics/topicUtils";
import { TopicsPage } from "./features/topics/TopicsPage";
import { TopicDetailPage } from "./features/topics/TopicDetailPage";
import { StudyRoomPage } from "./features/topics/StudyRoomPage";
import { NotebookPage } from "./features/notebook/NotebookPage";
import { MemoryPage } from "./features/memory/MemoryPage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { WelcomePage } from "./features/setup/WelcomePage";
import { OnboardingPage } from "./features/setup/OnboardingPage";
import { CompanionSetupPage } from "./features/setup/CompanionSetupPage";
import { useScreenshotCaptureFlow } from "./features/screenshots/useScreenshotCaptureFlow";
import {
  generatePracticeQuestions,
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
  NomiState,
  PracticeAnswer,
  PracticeQuestion,
  PracticeSession,
  ReviewRecord,
  Screen,
  ScreenshotCapturePayload,
  TopicItem,
  UserProfile
} from "./types";

function parseIncomingCapture(): ExternalCapturePayload | null {
  const raw = new URLSearchParams(window.location.search).get("nomiCapture");
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
  const [topics, setTopics] = useState<TopicItem[]>([]);
  const [practiceSessions, setPracticeSessions] = useState<PracticeSession[]>([]);
  const [reviews, setReviews] = useState<ReviewRecord[]>([]);
  const [expressions, setExpressions] = useState<ExpressionRecord[]>([]);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [nomiState, setNomiState] = useState<NomiState>("idle");
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
    setNomiState,
    setScreenshotQuestionInput,
    setScreenshotQuestionBusy
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
      let nextCaptures = storedCaptures.map(normalizeCapture);

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

    listenTauri("nomi-open-captures", () => {
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

    listenTauri<CaptureBridgeState>("nomi-capture-bridge-updated", (event) => {
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
      if (event.data?.type !== "NOMI_CAPTURE" && event.data?.type !== "TINYBU_CAPTURE") return;
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
    setNomiState("thinking");
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
    setNomiState("idle");
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
    const normalized = normalizeCapture(nextCapture);
    await db.captures.put(normalized);
    setCaptures((items) => items.map((item) => (item.id === normalized.id ? normalized : item)));
  }

  async function updateTopic(nextTopic: TopicItem) {
    await db.topics.put(nextTopic);
    setTopics((items) => items.map((item) => (item.id === nextTopic.id ? nextTopic : item)));
  }

  async function openCapture(capture: CaptureItem) {
    await updateState((state) => ({ ...state, activeCaptureId: capture.id }));
  }

  async function createTopicFromCaptures(captureIds: string[], name?: string) {
    const selectedCaptures = captures.filter((capture) => captureIds.includes(capture.id));
    if (!selectedCaptures.length) return;
    const first = selectedCaptures[0];
    const topic: TopicItem = {
      id: uid("topic"),
      name: name?.trim() || first.topic || "New Topic",
      summary: first.summary || selectedCaptures.map((capture) => capture.title).join(", "),
      captureIds: selectedCaptures.map((capture) => capture.id),
      tags: Array.from(new Set(selectedCaptures.flatMap((capture) => capture.keywords ?? []).slice(0, 4))),
      practiceGoal: inferPracticeGoal(selectedCaptures),
      status: "ready",
      savedExpressionCount: 0,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    const updatedCaptures: CaptureItem[] = selectedCaptures.map((capture) => ({
      ...capture,
      topicId: topic.id,
      topic: topic.name,
      status: "in-topic"
    }));
    await Promise.all([db.topics.put(topic), db.captures.bulkPut(updatedCaptures)]);
    setTopics((items) => [topic, ...items]);
    setCaptures((items) => items.map((item) => updatedCaptures.find((capture) => capture.id === item.id) ?? item));
    await persistState({ ...appState, activeTopicId: topic.id, activeCaptureId: updatedCaptures[0].id });
    navigate("topic-detail");
  }

  async function addCapturesToTopic(captureIds: string[], topic: TopicItem) {
    const selectedCaptures = captures.filter((capture) => captureIds.includes(capture.id));
    if (!selectedCaptures.length) return;
    const nextTopic: TopicItem = {
      ...topic,
      captureIds: Array.from(new Set([...topic.captureIds, ...captureIds])),
      updatedAt: nowIso()
    };
    const updatedCaptures = selectedCaptures.map((capture) => ({
      ...capture,
      topicId: topic.id,
      topic: topic.name,
      status: "in-topic" as const
    }));
    await Promise.all([db.topics.put(nextTopic), db.captures.bulkPut(updatedCaptures)]);
    setTopics((items) => items.map((item) => (item.id === topic.id ? nextTopic : item)));
    setCaptures((items) => items.map((item) => updatedCaptures.find((capture) => capture.id === item.id) ?? item));
  }

  async function archiveCapture(capture: CaptureItem) {
    await updateCapture({ ...capture, status: "archived" });
  }

  async function deleteCapture(id: string) {
    await db.captures.delete(id);
    setCaptures((items) => items.filter((item) => item.id !== id));
  }

  async function openTopic(topic: TopicItem, next: Screen = "topic-detail") {
    const capturesForTopic = topicCaptures(topic, captures);
    await persistState({
      ...appState,
      activeTopicId: topic.id,
      activeCaptureId: capturesForTopic[0]?.id ?? appState.activeCaptureId
    });
    navigate(next);
  }

  async function markTopicStudied(topic: TopicItem) {
    const capturesForTopic = topicCaptures(topic, captures);
    const updatedCaptures: CaptureItem[] = capturesForTopic.map((capture) =>
      normalizeStatus(capture.status) === "practiced" ? capture : { ...capture, status: "studied" }
    );
    const nextTopic: TopicItem = {
      ...topic,
      status: topic.status === "practiced" ? "practiced" : "in-progress",
      lastStudiedAt: nowIso(),
      updatedAt: nowIso()
    };
    await Promise.all([db.topics.put(nextTopic), db.captures.bulkPut(updatedCaptures)]);
    setTopics((items) => items.map((item) => (item.id === topic.id ? nextTopic : item)));
    setCaptures((items) => items.map((item) => updatedCaptures.find((capture) => capture.id === item.id) ?? item));
  }

  async function startPracticeForTopic(topic: TopicItem) {
    const capturesForTopic = topicCaptures(topic, captures);
    const selectedFragments = capturesForTopic.flatMap((capture) =>
      capture.fragments.filter((fragment) => fragment.selected || fragment.recommended)
    );
    const fallbackFragments = capturesForTopic.flatMap((capture) => capture.fragments).slice(0, 6);
    const fragments = selectedFragments.length ? selectedFragments : fallbackFragments;
    if (!fragments.length) return;

    setBusyLabel("Generating practice");
    setNomiState("thinking");
    const output = await generatePracticeQuestions({ fragments, appState });
    const questions: PracticeQuestion[] = output.questions.slice(0, 5).map((question) => ({
      id: uid("question"),
      ...question,
      tipLevel: 0
    }));
    const session: PracticeSession = {
      id: uid("practice"),
      captureId: capturesForTopic[0]?.id ?? "",
      topicId: topic.id,
      selectedFragmentIds: fragments.map((fragment) => fragment.id),
      stage: "answer",
      questions,
      answers: [],
      currentQuestionIndex: 0,
      status: "active",
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    const nextTopic: TopicItem = { ...topic, status: "in-progress", updatedAt: nowIso() };
    await Promise.all([
      db.practiceSessions.put(session),
      db.topics.put(nextTopic),
      saveAppState({ ...appState, activeTopicId: topic.id, activePracticeSessionId: session.id })
    ]);
    setPracticeSessions((items) => [session, ...items]);
    setTopics((items) => items.map((item) => (item.id === topic.id ? nextTopic : item)));
    setAppState((state) => ({ ...state, activeTopicId: topic.id, activePracticeSessionId: session.id }));
    setBusyLabel("");
    setNomiState("listening");
    navigate("practice");
  }

  async function updatePracticeSession(session: PracticeSession) {
    await db.practiceSessions.put(session);
    setPracticeSessions((items) => items.map((item) => (item.id === session.id ? session : item)));
  }

  async function requestTip(session: PracticeSession) {
    const question = session.questions[session.currentQuestionIndex];
    if (!question || question.tipLevel >= 2) return;
    const nextLevel = question.tipLevel + 1;
    setNomiState("thinking");
    const tip = await generatePracticeTip({
      question: question.question,
      tipLevel: nextLevel,
      outline: question.tipOutline,
      example: question.tipExample,
      appState
    });
    const updatedQuestion = {
      ...question,
      tipLevel: nextLevel,
      tipOutline: tip.outline || question.tipOutline,
      tipExample: tip.example || question.tipExample
    };
    await updatePracticeSession({
      ...session,
      questions: session.questions.map((item) => (item.id === question.id ? updatedQuestion : item)),
      updatedAt: nowIso()
    });
    setNomiState("encouraging");
  }

  async function submitPracticeAnswer(session: PracticeSession) {
    const answer = practiceInput.trim();
    const question = session.questions[session.currentQuestionIndex];
    if (!answer || !question) return;
    setPracticeInput("");
    setNomiState("thinking");
    const turn = await generatePracticeTurn({
      answer,
      question: question.question,
      questionIndex: session.currentQuestionIndex,
      appState
    });
    const practiceAnswer: PracticeAnswer = {
      id: uid("answer"),
      questionId: question.id,
      answer,
      nomiReply: `${turn.encouragement} ${turn.response}`,
      createdAt: nowIso()
    };
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
    setNomiState("listening");
  }

  async function finishPractice(session: PracticeSession, answers: PracticeAnswer[]) {
    const topic = topics.find((item) => item.id === session.topicId);
    const capturesForTopic = topicCaptures(topic, captures);
    const selectedFragments = capturesForTopic
      .flatMap((capture) => capture.fragments)
      .filter((fragment) => session.selectedFragmentIds.includes(fragment.id));
    if (!topic || !selectedFragments.length) return;

    setBusyLabel("Generating Practice Review");
    const reviewOutput = await generateReview({
      title: topic.name,
      fragments: selectedFragments,
      answers,
      appState
    });
    const savedExpressions: ExpressionRecord[] = reviewOutput.savedExpressions.map((item) => ({
      id: uid("expression"),
      ...item,
      sourceTitle: topic.name,
      sourceContentId: topic.captureIds[0] ?? topic.id,
      capturedAt: nowIso(),
      saved: true,
      useLater: true,
      usedInTalk: false,
      userSentence: "",
      practiceCount: 1,
      learned: false,
      category: "need-practice"
    }));
    const review: ReviewRecord = {
      id: uid("review"),
      sessionId: session.id,
      talkedAbout: reviewOutput.talkedAbout,
      didWell: reviewOutput.didWell,
      naturalExpressions: reviewOutput.naturalExpressions,
      savedExpressionIds: savedExpressions.map((item) => item.id),
      nextPractice: reviewOutput.nextPractice,
      createdAt: nowIso()
    };
    const completedSession: PracticeSession = {
      ...session,
      answers,
      stage: "review",
      reviewId: review.id,
      status: "completed",
      updatedAt: nowIso(),
      completedAt: nowIso()
    };
    const updatedCaptures = capturesForTopic.map((capture) => ({ ...capture, status: "practiced" as const }));
    const nextTopic: TopicItem = {
      ...topic,
      status: "practiced",
      savedExpressionCount: topic.savedExpressionCount + savedExpressions.length,
      lastPracticedAt: nowIso(),
      updatedAt: nowIso()
    };
    const memoryUpdate = await updateMemory({
      mirror: reviewOutput,
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
    setNomiState("celebrating");
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
    "practice",
    "practice-review",
    "notebook",
    "memory",
    "settings"
  ];
  const copy = uiCopy[appState.profile.interfaceLanguage];

  return (
    <div className="app">
      {busyLabel && (
        <div className="busy-banner">
          <Wand2 size={16} />
          {busyLabel}
        </div>
      )}

      {shellScreens.includes(screen) ? (
        <div className="desktop-shell">
          <aside className="sidebar">
            <button className="brand-button" onClick={() => navigate("home")}>
              <NomiOrb state={nomiState} />
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
                className={["topics", "topic-detail", "study-room", "practice", "practice-review"].includes(screen) ? "active" : ""}
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
            </nav>
            <button className={screen === "settings" ? "settings-link active" : "settings-link"} onClick={() => navigate("settings")}>
              <Settings size={18} /> {copy.nav.settings}
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
                organize={() => navigate("organize")}
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
  );
}

function HomePage({
  appState,
  captures,
  topics,
  sessions,
  memories,
  openInbox,
  openTopic,
  continuePractice,
  upgrade,
  tryDemo
}: {
  appState: AppStateRecord;
  captures: CaptureItem[];
  topics: TopicItem[];
  sessions: PracticeSession[];
  memories: MemoryItem[];
  openInbox: () => void;
  openTopic: (topic: TopicItem, next?: Screen) => void;
  continuePractice: (session: PracticeSession) => void;
  upgrade: () => void;
  tryDemo: () => void;
}) {
  const copy = uiCopy[appState.profile.interfaceLanguage].home;
  const profileSummary = `${appState.profile.targetLanguage} · ${appState.profile.level} · ${appState.profile.supportPreference}`;
  const activeSessions = sessions.filter((session) => session.status === "active");
  const suggested = suggestedGroups(captures);
  const waitingCaptures = captures.filter((capture) => normalizeStatus(capture.status) !== "archived" && !capture.topicId);
  const readyTopics = topics.filter((topic) => topic.status === "ready");
  const practiceTopics = topics.filter((topic) => topic.status === "in-progress");
  const latestMemory = [...memories].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
  const activeSessionTopic = activeSessions[0] ? topics.find((topic) => topic.id === activeSessions[0].topicId) : undefined;
  const suggestedTopic = suggested[0];

  const suggestion = (() => {
    if (latestMemory) {
      return {
        source: "memory",
        observation: latestMemory.body || latestMemory.title,
        prompt: copy.memoryPrompt,
        actionLabel: activeSessions[0] ? copy.continuePractice : copy.startPractice,
        action: () => {
          if (activeSessions[0]) {
            continuePractice(activeSessions[0]);
            return;
          }
          const topic = practiceTopics[0] ?? readyTopics[0] ?? topics[0];
          if (topic) openTopic(topic, topic.status === "ready" ? "study-room" : "topic-detail");
          else tryDemo();
        }
      };
    }
    if (activeSessions[0]) {
      const topicName = activeSessionTopic?.name ?? "your topic";
      return {
        source: "active",
        observation: `${copy.activePrefix} ${topicName}${copy.activeSuffix}`,
        prompt: copy.activePrompt,
        actionLabel: copy.continuePractice,
        action: () => continuePractice(activeSessions[0])
      };
    }
    if (suggestedTopic) {
      return {
        source: "capture",
        observation: `${copy.topicPrefix} ${suggestedTopic.name}`,
        prompt: suggestedTopic.practiceGoal || copy.topicPrompt,
        actionLabel: copy.organizeNow,
        action: openInbox
      };
    }
    return {
      source: "featured",
      observation: copy.defaultObservation,
      prompt: copy.defaultPrompt,
      actionLabel: copy.tryFeatured,
      action: tryDemo
    };
  })();

  const queueItems = [
    { label: copy.organize, count: waitingCaptures.length, action: openInbox },
    {
      label: copy.study,
      count: readyTopics.length,
      action: () => (readyTopics[0] ? openTopic(readyTopics[0], "study-room") : openInbox())
    },
    {
      label: copy.practice,
      count: activeSessions.length + practiceTopics.length,
      action: () => (activeSessions[0] ? continuePractice(activeSessions[0]) : practiceTopics[0] ? openTopic(practiceTopics[0]) : openInbox())
    }
  ];

  const dayMs = 24 * 60 * 60 * 1000;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const activity = new Map<string, number>();
  const dateKey = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const addActivity = (value: string | undefined, weight: number) => {
    if (!value) return;
    const date = new Date(value);
    date.setHours(0, 0, 0, 0);
    const key = dateKey(date);
    activity.set(key, Math.min(4, (activity.get(key) ?? 0) + weight));
  };
  topics.forEach((topic) => {
    addActivity(topic.createdAt, 1);
    addActivity(topic.lastStudiedAt, 2);
  });
  sessions.forEach((session) => addActivity(session.completedAt, 3));
  const rhythmDays = Array.from({ length: 70 }, (_, index) => {
    const date = new Date(todayStart.getTime() - (69 - index) * dayMs);
    const key = dateKey(date);
    return { key, level: activity.get(key) ?? 0 };
  });

  return (
    <section className="page">
      <AppHeader title={copy.title} description={profileSummary}>
        <button className="secondary upgrade-button" onClick={upgrade}>
          <Crown size={16} />
          {copy.upgrade}
        </button>
      </AppHeader>

      <div className="home-focus-layout">
        <section className={`panel suggestion-panel ${suggestion.source}`}>
          <div>
            <p className="eyebrow">{copy.suggestion}</p>
            <h2>{suggestion.observation}</h2>
            <p>{suggestion.prompt}</p>
          </div>
          <button className="primary icon-action" onClick={suggestion.action} aria-label={suggestion.actionLabel}>
            <span>{suggestion.actionLabel}</span>
            <ChevronRight size={20} />
          </button>
        </section>

        <section className="queue-grid" aria-label={copy.queueTitle}>
          {queueItems.map((item) => (
            <button className="queue-card" key={item.label} onClick={item.action}>
              <span>{item.label}</span>
              <strong>{item.count}</strong>
            </button>
          ))}
        </section>

        <section className="panel rhythm-panel">
          <div className="section-title">
            <Sparkles size={18} />
            {copy.rhythm}
          </div>
          <div className="rhythm-grid" aria-label={copy.rhythm}>
            {rhythmDays.map((day) => (
              <span className={`rhythm-cell level-${day.level}`} key={day.key} title={`${day.key}: ${day.level}`} />
            ))}
          </div>
          <div className="rhythm-legend">
            <span>Less</span>
            <i className="rhythm-cell level-0" />
            <i className="rhythm-cell level-1" />
            <i className="rhythm-cell level-2" />
            <i className="rhythm-cell level-3" />
            <i className="rhythm-cell level-4" />
            <span>More</span>
          </div>
        </section>
      </div>
    </section>
  );
}

function PracticePage({
  topic,
  captures,
  session,
  input,
  setInput,
  requestTip,
  submitAnswer,
  endPractice
}: {
  topic: TopicItem;
  captures: CaptureItem[];
  session: PracticeSession;
  input: string;
  setInput: (value: string) => void;
  requestTip: (session: PracticeSession) => void;
  submitAnswer: (session: PracticeSession) => void;
  endPractice: () => void;
}) {
  const question = session.questions[session.currentQuestionIndex];
  const selectedFragments = captures
    .flatMap((capture) => capture.fragments.map((fragment) => ({ ...fragment, captureTitle: capture.title })))
    .filter((fragment) => session.selectedFragmentIds.includes(fragment.id));
  const relatedIds = new Set(question?.relatedFragmentIds ?? []);
  const lastAnswer = session.answers[session.answers.length - 1];

  if (!question) {
    return <EmptyState title="No practice question" body="Start Practice again from a topic." />;
  }

  return (
    <section className="page">
      <AppHeader title="Practice" description={topic.name}>
        <button className="secondary" onClick={endPractice}>
          End Practice
        </button>
      </AppHeader>

      <div className="practice-layout">
        <main className="practice-main">
          <section className="panel question-card">
            <span>
              Question {session.currentQuestionIndex + 1} / {session.questions.length}
            </span>
            <h2>{question.question}</h2>
            <p>Small goal: {topic.practiceGoal}</p>
          </section>

          <section className="panel chat-panel">
            {session.answers.map((answer) => (
              <div className="practice-message" key={answer.id}>
                <div className="user-answer">
                  <strong>You</strong>
                  <p>{answer.answer}</p>
                </div>
                <div className="bu-feedback">
                  <strong>TinyBu</strong>
                  <p>{answer.nomiReply}</p>
                  <button className="secondary">Save expression</button>
                </div>
              </div>
            ))}
            {lastAnswer && (
              <div className="tiny-note">
                <span>More natural</span>
                <p>{lastAnswer.nomiReply}</p>
              </div>
            )}
          </section>

          <section className="answer-box">
            <textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="Type your answer in the target language..." />
            <div className="bottom-actions">
              <button className="secondary" disabled={question.tipLevel >= 2} onClick={() => requestTip(session)}>
                <Lightbulb size={18} />
                Tips
              </button>
              <button className="primary" onClick={() => submitAnswer(session)}>
                <Send size={18} />
                Send
              </button>
              <button className="danger" onClick={endPractice}>
                End Practice
              </button>
            </div>
          </section>
        </main>

        <aside className="practice-support">
          <section className="panel">
            <div className="section-title">Topic</div>
            <h3>{topic.name}</h3>
            <p>{topic.summary}</p>
          </section>
          <section className="panel">
            <div className="section-title">Progress</div>
            <strong>{session.answers.length} completed</strong>
          </section>
          <section className="panel">
            <div className="section-title">Tips</div>
            {question.tipLevel === 0 && <p>Click Tips for a direction. Click once more for a complete reference sentence.</p>}
            {question.tipLevel === 1 && <p>{question.tipOutline}</p>}
            {question.tipLevel >= 2 && <p>{question.tipExample}</p>}
          </section>
          <section className="panel">
            <div className="section-title">Source Summary</div>
            <div className="mini-list">
              {selectedFragments.slice(0, 5).map((fragment) => (
                <span className={relatedIds.has(fragment.id) ? "active" : ""} key={fragment.id}>
                  {fragment.text}
                </span>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}

function PracticeReviewPage({
  topic,
  review,
  session,
  expressions,
  backToTopics,
  openNotebook,
  continuePractice
}: {
  topic: TopicItem;
  review: ReviewRecord;
  session?: PracticeSession;
  expressions: ExpressionRecord[];
  backToTopics: () => void;
  openNotebook: () => void;
  continuePractice: () => void;
}) {
  const saved = expressions.filter((expression) => review.savedExpressionIds.includes(expression.id));
  return (
    <section className="page">
      <AppHeader title="Practice Review" description={topic.name}>
        <button className="secondary" onClick={backToTopics}>
          Back to Topics
        </button>
        <button className="primary" onClick={openNotebook}>
          Save to Notebook
        </button>
      </AppHeader>

      <section className="panel review-summary">
        <div>
          <p className="eyebrow">Completed {formatDate(review.createdAt)}</p>
          <h2>{review.talkedAbout}</h2>
          <p>{session?.answers.length ?? 0} questions completed.</p>
        </div>
      </section>

      <div className="review-grid">
        <section className="panel">
          <div className="section-title">What You Practiced</div>
          <p>{review.talkedAbout}</p>
          <div className="mini-list">
            {review.didWell.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </section>
        <section className="panel">
          <div className="section-title">Better Expressions</div>
          {review.naturalExpressions.map((item) => (
            <article className="natural-pair" key={`${item.original}-${item.improved}`}>
              <span>User original</span>
              <p>{item.original}</p>
              <span>More natural</span>
              <strong>{item.improved}</strong>
              <button className="secondary">Save</button>
            </article>
          ))}
        </section>
      </div>

      <div className="two-column">
        <section className="panel">
          <div className="section-title">Saved Suggestions</div>
          <div className="mini-list">
            {saved.slice(0, 5).map((expression) => (
              <span key={expression.id}>{expression.pattern}</span>
            ))}
          </div>
        </section>
        <section className="panel">
          <div className="section-title">Next Step</div>
          <p>{review.nextPractice}</p>
          <div className="button-row">
            <button className="primary" onClick={openNotebook}>
              Review in Notebook
            </button>
            <button className="secondary" onClick={continuePractice}>
              Continue Practice
            </button>
            <button className="secondary" onClick={backToTopics}>
              Start another Topic
            </button>
          </div>
        </section>
      </div>
    </section>
  );
}
