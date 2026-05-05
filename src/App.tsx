import { useEffect, useMemo, useRef, useState } from "react";
import {
  Brain,
  Check,
  ChevronRight,
  Home,
  KeyRound,
  Lightbulb,
  MessageCircle,
  NotebookTabs,
  PanelRightOpen,
  Play,
  RotateCcw,
  Save,
  Send,
  Settings,
  Sparkles,
  Trash2,
  Wand2,
  X
} from "lucide-react";
import { demoContents } from "./data/demoContent";
import { db, loadAppState, saveAppState, clearLearningData } from "./lib/db";
import { clearUserApiKey, saveUserApiKey } from "./lib/secureKey";
import { invokeTauri, listenTauri } from "./lib/tauriBridge";
import { defaultAppState, nowIso, uid } from "./lib/defaults";
import {
  generatePracticeQuestions,
  generatePracticeTip,
  generatePracticeTurn,
  generateReview,
  recommendFragments,
  recognizeScreenshotCapture,
  understandContent,
  updateMemory
} from "./ai/provider";
import type {
  AppStateRecord,
  CaptureFragment,
  CaptureItem,
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
  UserProfile
} from "./types";

const goalOptions = ["日常聊天", "旅行交流", "学习 / 留学", "工作沟通", "观点表达", "看视频学表达", "减少开口焦虑"];
const languageOptions = ["中文", "English", "日本語", "Español", "Français", "Deutsch", "한국어", "Other"];
const targetLanguageOptions = ["English", "Japanese", "Spanish", "French", "German", "Chinese", "Korean", "Other"];
const practiceSteps = [
  { stage: "select", label: "理解内容", en: "Understand" },
  { stage: "answer", label: "主题开聊", en: "Talk" },
  { stage: "review", label: "复盘", en: "Review" }
] as const;

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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function weekStart() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - date.getDay());
  return date;
}

function splitCaptureText(text: string): string[] {
  const lines = text
    .split(/\n+/)
    .map(cleanCapturedLine)
    .filter(Boolean);
  if (lines.length > 1) return lines;

  const sentences = text
    .split(/(?<=[.!?。！？])\s+/)
    .map(cleanCapturedLine)
    .filter(Boolean);
  return sentences.length ? sentences : [cleanCapturedLine(text)].filter(Boolean);
}

function cleanCapturedLine(line: string) {
  return line
    .replace(/^\s*\d{1,2}:\d{2}(?::\d{2})?\s*\d*\s*(?:分钟)?\d*\s*秒钟\s*/g, "")
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b\s*\d*\s*(?:分钟)?\d*\s*秒钟\s*/g, " ")
    .replace(/^\s*\d+\s*(?:分钟)?\d*\s*秒钟\s*/g, "")
    .replace(/\s+\d+\s*(?:分钟)?\d*\s*秒钟\s*/g, " ")
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, " ")
    .replace(/^\s*\d+\s*(seconds?|secs?)\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sourceLabel(kind: ExternalCaptureKind) {
  if (kind === "youtube") return "YouTube subtitles";
  if (kind === "video") return "Video subtitles";
  if (kind === "article") return "Article";
  if (kind === "selection") return "Selected text";
  if (kind === "screenshot") return "Screenshot";
  return "Manual paste";
}

function NomiOrb({ state }: { state: NomiState }) {
  const label: Record<NomiState, string> = {
    idle: "Idle",
    listening: "Listening",
    speaking: "Speaking",
    thinking: "Thinking",
    encouraging: "Encouraging",
    celebrating: "Celebrating"
  };

  return (
    <div className={`nomi-orb ${state}`}>
      <div className="nomi-face">
        <span className="eye left" />
        <span className="eye right" />
        <span className="mouth" />
      </div>
      <span className="nomi-status">{label[state]}</span>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty-state">
      <Sparkles size={22} />
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("welcome");
  const [appState, setAppState] = useState<AppStateRecord>(defaultAppState);
  const [captures, setCaptures] = useState<CaptureItem[]>([]);
  const [practiceSessions, setPracticeSessions] = useState<PracticeSession[]>([]);
  const [reviews, setReviews] = useState<ReviewRecord[]>([]);
  const [expressions, setExpressions] = useState<ExpressionRecord[]>([]);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [nomiState, setNomiState] = useState<NomiState>("idle");
  const [practiceInput, setPracticeInput] = useState("");
  const [homePasteDraft, setHomePasteDraft] = useState("");
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [busyLabel, setBusyLabel] = useState("");
  const lastExternalCaptureSignature = useRef("");
  const bridgeImportingRef = useRef(false);

  const activeCapture = useMemo(
    () => captures.find((capture) => capture.id === appState.activeCaptureId) ?? captures[0],
    [appState.activeCaptureId, captures]
  );

  const activeSession = useMemo(
    () =>
      practiceSessions.find((session) => session.id === appState.activePracticeSessionId) ??
      practiceSessions.find((session) => session.captureId === activeCapture?.id && session.status === "active") ??
      practiceSessions[0],
    [activeCapture?.id, appState.activePracticeSessionId, practiceSessions]
  );

  const activeReview = useMemo(
    () => reviews.find((review) => review.id === activeSession?.reviewId) ?? reviews[0],
    [activeSession?.reviewId, reviews]
  );

  useEffect(() => {
    async function boot() {
      const [state, storedCaptures, storedSessions, storedReviews, storedExpressions, storedMemories] =
        await Promise.all([
          loadAppState(),
          db.captures.orderBy("capturedAt").reverse().toArray(),
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
        nextCaptures = [capture, ...storedCaptures];
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
    }).then((nextUnlisten) => {
      if (active) {
        unlisten = nextUnlisten;
      } else {
        nextUnlisten();
      }
    });

    return () => {
      active = false;
      unlisten();
    };
  }, [appState, captures.length]);

  async function importPendingBridgeCaptures() {
    if (bridgeImportingRef.current) return;
    bridgeImportingRef.current = true;

    try {
      const pendingCaptures = await invokeTauri<ExternalCapturePayload[]>("drain_pending_captures");

      if (!pendingCaptures?.length) {
        navigate(captures[0] ? "practice" : "home");
        return;
      }

      setBusyLabel("正在整理 TinyBu 记下的内容");
      setNomiState("thinking");

      let nextState = appState;
      const importedCaptures: CaptureItem[] = [];

      for (const incomingCapture of pendingCaptures) {
        const text = incomingCapture.text?.trim();
        if (!text) continue;

        const capture = await createCaptureRecord({
          title: incomingCapture.title || "Imported Web Content",
          sourceUrl: incomingCapture.url || "",
          sourceKind: incomingCapture.kind || "selection",
          text,
          capturedAt: incomingCapture.capturedAt || nowIso(),
          appState: nextState
        });

        await db.captures.put(capture);
        importedCaptures.push(capture);
        nextState = {
          ...nextState,
          onboarded: true,
          companionReady: true,
          activeCaptureId: capture.id,
          activePracticeSessionId: "",
          pastedTranscript: text,
          pastedSourceTitle: capture.title,
          pastedSourceUrl: capture.sourceUrl,
          pastedSourceKind: capture.sourceKind
        };
      }

      if (!importedCaptures.length) {
        navigate(captures[0] ? "practice" : "home");
        return;
      }

      await saveAppState(nextState);
      setAppState(nextState);
      setCaptures((items) => [...importedCaptures.slice().reverse(), ...items]);
      setHomePasteDraft("");
      setPracticeInput("");
      setNomiState("listening");
      setScreen("practice");
    } finally {
      setBusyLabel("");
      bridgeImportingRef.current = false;
    }
  }

  useEffect(() => {
    async function handleExtensionCapture(event: MessageEvent) {
      if (event.source !== window) return;
      if (event.data?.type !== "NOMI_EXTENSION_CAPTURE") return;

      const incomingCapture = event.data.payload as ExternalCapturePayload;
      const text = incomingCapture?.text?.trim();
      if (!text) return;
      const signature = [
        incomingCapture.kind,
        incomingCapture.url,
        incomingCapture.capturedAt,
        text.length,
        text.slice(0, 80)
      ].join("|");
      if (lastExternalCaptureSignature.current === signature) return;
      lastExternalCaptureSignature.current = signature;

      setBusyLabel("正在接收浏览器捕捉内容");
      setNomiState("thinking");
      const capture = await createCaptureRecord({
        title: incomingCapture.title || "Imported Web Content",
        sourceUrl: incomingCapture.url || "",
        sourceKind: incomingCapture.kind || "selection",
        text,
        capturedAt: incomingCapture.capturedAt || nowIso(),
        appState
      });

      await db.captures.put(capture);
      const nextState = {
        ...appState,
        onboarded: true,
        companionReady: true,
        activeCaptureId: capture.id,
        activePracticeSessionId: "",
        pastedTranscript: text,
        pastedSourceTitle: capture.title,
        pastedSourceUrl: capture.sourceUrl,
        pastedSourceKind: capture.sourceKind
      };
      await saveAppState(nextState);
      setAppState(nextState);
      setCaptures((items) => [capture, ...items]);
      setHomePasteDraft("");
      setPracticeInput("");
      setBusyLabel("");
      setNomiState("encouraging");
      navigate("practice");
    }

    window.addEventListener("message", handleExtensionCapture);
    return () => window.removeEventListener("message", handleExtensionCapture);
  }, [appState]);

  useEffect(() => {
    let active = true;
    let unlisten = () => {};

    listenTauri<ScreenshotCapturePayload>("tinybu-screenshot-captured", (event) => {
      void importScreenshotCapture(event.payload);
    }).then((nextUnlisten) => {
      if (active) {
        unlisten = nextUnlisten;
      } else {
        nextUnlisten();
      }
    });

    return () => {
      active = false;
      unlisten();
    };
  }, [appState]);

  async function importScreenshotCapture(payload: ScreenshotCapturePayload) {
    setBusyLabel("正在识别截图内容");
    setNomiState("thinking");

    try {
      const recognition = await recognizeScreenshotCapture({
        imageDataUrl: payload.imageDataUrl,
        width: payload.width,
        height: payload.height,
        appState
      });
      const text = recognition.text.trim();
      if (!text) throw new Error("没有识别到可学习的文字。");

      const capture = await createCaptureRecord({
        title: recognition.title || "Screenshot Capture",
        sourceUrl: "",
        sourceKind: "screenshot",
        text,
        capturedAt: payload.capturedAt || nowIso(),
        appState
      });

      await db.captures.put(capture);
      const nextState = {
        ...appState,
        onboarded: true,
        companionReady: true,
        activeCaptureId: capture.id,
        activePracticeSessionId: "",
        pastedTranscript: text,
        pastedSourceTitle: capture.title,
        pastedSourceUrl: "",
        pastedSourceKind: "screenshot" as const
      };
      await saveAppState(nextState);
      setAppState(nextState);
      setCaptures((items) => [capture, ...items]);
      setHomePasteDraft("");
      setPracticeInput("");
      setBusyLabel("");
      setNomiState("encouraging");
      navigate("practice");
    } catch (error) {
      const message = error instanceof Error ? error.message : "截图识别失败";
      setBusyLabel(message);
      setNomiState("idle");
      window.setTimeout(() => setBusyLabel(""), 2600);
    }
  }

  async function persistState(nextState: AppStateRecord) {
    setAppState(nextState);
    await saveAppState(nextState);
  }

  async function updateState(mutator: (state: AppStateRecord) => AppStateRecord) {
    const nextState = mutator(appState);
    await persistState(nextState);
  }

  function navigate(next: Screen) {
    setNomiState(next === "practice" ? "listening" : "idle");
    setScreen(next);
  }

  async function createCaptureRecord(args: {
    title: string;
    sourceUrl: string;
    sourceKind: ExternalCaptureKind;
    text: string;
    capturedAt?: string;
    appState: AppStateRecord;
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
      topic: understanding.topic,
      summary: understanding.summary,
      keywords: understanding.keywords,
      questions: understanding.questions,
      suggestedExpressions: understanding.suggestedExpressions,
      capturedAt: args.capturedAt ?? nowIso(),
      fragments,
      status: "new"
    };
  }

  async function createAndStoreCapture(args: {
    title: string;
    sourceUrl: string;
    sourceKind: ExternalCaptureKind;
    text: string;
    startImmediately?: boolean;
  }) {
    const text = args.text.trim();
    if (!text) return;
    setBusyLabel("正在整理捕捉内容");
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
    if (args.startImmediately) navigate("practice");
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
    navigate("practice");
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

  async function openCapture(capture: CaptureItem) {
    await updateState((state) => ({ ...state, activeCaptureId: capture.id }));
    navigate("practice");
  }

  async function updateCapture(nextCapture: CaptureItem) {
    await db.captures.put(nextCapture);
    setCaptures((items) => items.map((item) => (item.id === nextCapture.id ? nextCapture : item)));
  }

  async function startPracticeFromSelection(capture: CaptureItem) {
    const selectedFragmentIds = capture.fragments.filter((fragment) => fragment.selected).map((fragment) => fragment.id);
    if (!selectedFragmentIds.length) return;

    setBusyLabel("正在生成练习问题");
    setNomiState("thinking");
    const selectedFragments = capture.fragments.filter((fragment) => selectedFragmentIds.includes(fragment.id));
    const output = await generatePracticeQuestions({ fragments: selectedFragments, appState });
    const questions: PracticeQuestion[] = output.questions.slice(0, 5).map((question) => ({
      id: uid("question"),
      ...question,
      tipLevel: 0
    }));
    const session: PracticeSession = {
      id: uid("practice"),
      captureId: capture.id,
      selectedFragmentIds,
      stage: "answer",
      questions,
      answers: [],
      currentQuestionIndex: 0,
      status: "active",
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    const updatedCapture = { ...capture, status: "in-practice" as const };
    await Promise.all([
      db.practiceSessions.put(session),
      db.captures.put(updatedCapture),
      saveAppState({ ...appState, activeCaptureId: capture.id, activePracticeSessionId: session.id })
    ]);
    setPracticeSessions((items) => [session, ...items]);
    setCaptures((items) => items.map((item) => (item.id === capture.id ? updatedCapture : item)));
    setAppState((state) => ({ ...state, activeCaptureId: capture.id, activePracticeSessionId: session.id }));
    setBusyLabel("");
    setNomiState("listening");
  }

  async function updatePracticeSession(session: PracticeSession) {
    await db.practiceSessions.put(session);
    setPracticeSessions((items) => items.map((item) => (item.id === session.id ? session : item)));
  }

  async function requestTip(session: PracticeSession) {
    const question = session.questions[session.currentQuestionIndex];
    if (!question) return;
    const nextLevel = Math.min(question.tipLevel + 1, 2);
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
    const nextSession = {
      ...session,
      questions: session.questions.map((item) => (item.id === question.id ? updatedQuestion : item)),
      updatedAt: nowIso()
    };
    await updatePracticeSession(nextSession);
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

    const nextSession = {
      ...session,
      answers,
      currentQuestionIndex: session.currentQuestionIndex + 1,
      updatedAt: nowIso()
    };
    await updatePracticeSession(nextSession);
    setNomiState("listening");
  }

  async function finishPractice(session: PracticeSession, answers: PracticeAnswer[]) {
    const capture = captures.find((item) => item.id === session.captureId);
    if (!capture) return;

    setBusyLabel("正在生成 Review");
    const selectedFragments = capture.fragments.filter((fragment) => session.selectedFragmentIds.includes(fragment.id));
    const reviewOutput = await generateReview({
      title: capture.title,
      fragments: selectedFragments,
      answers,
      appState
    });
    const savedExpressions: ExpressionRecord[] = reviewOutput.savedExpressions.map((item) => ({
      id: uid("expression"),
      ...item,
      sourceTitle: capture.title,
      sourceContentId: capture.id,
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
    const completedCapture: CaptureItem = { ...capture, status: "completed" };
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
      db.captures.put(completedCapture)
    ]);
    setReviews((items) => [review, ...items]);
    setExpressions((items) => [...savedExpressions, ...items]);
    setMemories((items) => [...memoryUpdate.memories, ...items]);
    setPracticeSessions((items) => items.map((item) => (item.id === session.id ? completedSession : item)));
    setCaptures((items) => items.map((item) => (item.id === capture.id ? completedCapture : item)));
    setBusyLabel("");
    setNomiState("celebrating");
  }

  async function saveSettings(nextState: AppStateRecord, key?: string) {
    if (key?.trim()) {
      await saveUserApiKey(key.trim());
      nextState.settings.apiKeySaved = true;
      setApiKeyDraft("");
    }
    await persistState(nextState);
  }

  async function resetOnboarding() {
    const nextState = {
      ...appState,
      onboarded: false,
      companionReady: false
    };
    await persistState(nextState);
    navigate("welcome");
  }

  async function clearMemoryOnly() {
    await db.memories.clear();
    setMemories([]);
  }

  async function clearAllData() {
    await clearLearningData();
    const nextState = {
      ...appState,
      activeCaptureId: "",
      activePracticeSessionId: "",
      pastedTranscript: "",
      pastedSourceTitle: "",
      pastedSourceUrl: "",
      pastedSourceKind: "manual" as const
    };
    await saveAppState(nextState);
    setAppState(nextState);
    setCaptures([]);
    setPracticeSessions([]);
    setReviews([]);
    setExpressions([]);
    setMemories([]);
    setHomePasteDraft("");
    setPracticeInput("");
    navigate("home");
  }

  async function updateExpression(record: ExpressionRecord) {
    await db.expressions.put(record);
    setExpressions((items) => items.map((item) => (item.id === record.id ? record : item)));
  }

  async function deleteExpression(id: string) {
    await db.expressions.delete(id);
    setExpressions((items) => items.filter((item) => item.id !== id));
  }

  const shellScreens: Screen[] = ["home", "practice", "notebook", "nomi", "settings"];

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
                <Home size={18} /> Home
              </button>
              <button className={screen === "practice" ? "active" : ""} onClick={() => activeCapture && navigate("practice")}>
                <Play size={18} /> Practice
              </button>
              <button className={screen === "notebook" ? "active" : ""} onClick={() => navigate("notebook")}>
                <NotebookTabs size={18} /> Notebook
              </button>
              <button className={screen === "nomi" ? "active" : ""} onClick={() => navigate("nomi")}>
                <Brain size={18} /> TinyBu
              </button>
              <button className={screen === "settings" ? "active" : ""} onClick={() => navigate("settings")}>
                <Settings size={18} /> Settings
              </button>
            </nav>
          </aside>
          <main className="main-panel">
            {screen === "home" && (
              <HomePage
                appState={appState}
                captures={captures}
                sessions={practiceSessions}
                expressions={expressions}
                pasteDraft={homePasteDraft}
                setPasteDraft={setHomePasteDraft}
                startCapture={openCapture}
                continuePractice={async (session) => {
                  const capture = captures.find((item) => item.id === session.captureId);
                  if (capture) {
                    await persistState({
                      ...appState,
                      activeCaptureId: capture.id,
                      activePracticeSessionId: session.id
                    });
                    navigate("practice");
                  }
                }}
                createManualCapture={() =>
                  createAndStoreCapture({
                    title: "Pasted Transcript",
                    sourceUrl: "",
                    sourceKind: "manual",
                    text: homePasteDraft,
                    startImmediately: true
                  })
                }
                tryDemo={startDemo}
                navigate={navigate}
                clearAllData={clearAllData}
              />
            )}
            {screen === "practice" && (
              <PracticePage
                capture={activeCapture}
                session={activeSession?.captureId === activeCapture?.id ? activeSession : undefined}
                review={activeReview}
                input={practiceInput}
                setInput={setPracticeInput}
                updateCapture={updateCapture}
                startPractice={startPracticeFromSelection}
                requestTip={requestTip}
                submitAnswer={submitPracticeAnswer}
                insertTip={(text) => setPracticeInput(text)}
                navigate={navigate}
                nomiState={nomiState}
              />
            )}
            {screen === "notebook" && (
              <NotebookPage
                captures={captures}
                expressions={expressions}
                updateExpression={updateExpression}
                deleteExpression={deleteExpression}
              />
            )}
            {screen === "nomi" && (
              <NomiMemoryPage
                memories={memories}
                deleteMemory={async (id) => {
                  await db.memories.delete(id);
                  setMemories((items) => items.filter((item) => item.id !== id));
                }}
                updateMemoryItem={async (item) => {
                  await db.memories.put(item);
                  setMemories((items) => items.map((memory) => (memory.id === item.id ? item : memory)));
                }}
              />
            )}
            {screen === "settings" && (
              <SettingsPage
                appState={appState}
                apiKeyDraft={apiKeyDraft}
                setApiKeyDraft={setApiKeyDraft}
                saveSettings={saveSettings}
                clearUserKey={async () => {
                  await clearUserApiKey();
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
            <OnboardingPage
              initialProfile={appState.profile}
              submit={submitOnboarding}
              skip={() => submitOnboarding(defaultAppState.profile)}
            />
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

function WelcomePage({ start, demo }: { start: () => void; demo: () => void }) {
  return (
    <section className="welcome-layout">
      <div className="hero-copy">
        <div className="brand-mark">
          <NomiOrb state="speaking" />
          <span>TinyBu 小布</span>
        </div>
        <h1>Turn browser captures into language practice.</h1>
        <p>把浏览器里收藏的文字、文章片段或字幕，变成一轮低压力表达练习。</p>
        <div className="hero-actions">
          <button className="primary" onClick={start}>
            Start with TinyBu <ChevronRight size={18} />
          </button>
          <button className="secondary" onClick={demo}>
            Try Demo
          </button>
        </div>
      </div>
      <div className="desktop-preview" aria-label="TinyBu desktop preview">
        <div className="preview-window">
          <div className="preview-toolbar">
            <span />
            <span />
            <span />
          </div>
          <div className="preview-content">
            <p>I used to think productivity was about doing more...</p>
            <button>Select for practice</button>
            <div className="mini-card">
              <strong>Select → Answer → Review</strong>
              <small>先选片段，再回答问题，最后复盘并保存表达。</small>
            </div>
          </div>
        </div>
        <div className="floating-companion">
          <NomiOrb state="encouraging" />
          <p>一次只回答一个问题。</p>
        </div>
      </div>
    </section>
  );
}

function OnboardingPage({
  initialProfile,
  submit,
  skip
}: {
  initialProfile: UserProfile;
  submit: (profile: UserProfile) => void;
  skip: () => void;
}) {
  const [profile, setProfile] = useState<UserProfile>(initialProfile);
  const toggleGoal = (goal: string) => {
    setProfile((next) => ({
      ...next,
      goals: next.goals.includes(goal) ? next.goals.filter((item) => item !== goal) : [...next.goals, goal]
    }));
  };

  return (
    <section className="setup-panel">
      <div className="setup-header">
        <NomiOrb state="idle" />
        <div>
          <p className="eyebrow">Onboarding</p>
          <h1>先让 TinyBu 知道怎么扶你一把</h1>
          <p>这些信息只服务于口语支架和反馈语气。</p>
        </div>
      </div>

      <div className="form-grid">
        <label>
          母语
          <select value={profile.nativeLanguage} onChange={(event) => setProfile({ ...profile, nativeLanguage: event.target.value })}>
            {languageOptions.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          目标语言
          <select value={profile.targetLanguage} onChange={(event) => setProfile({ ...profile, targetLanguage: event.target.value })}>
            {targetLanguageOptions.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          系统语言
          <select
            value={profile.interfaceLanguage}
            onChange={(event) =>
              setProfile({ ...profile, interfaceLanguage: event.target.value as UserProfile["interfaceLanguage"] })
            }
          >
            <option>中文</option>
            <option>English</option>
          </select>
        </label>
        <label>
          当前水平
          <select
            value={profile.level}
            onChange={(event) => setProfile({ ...profile, level: event.target.value as UserProfile["level"] })}
          >
            <option value="A1">A1：刚开始</option>
            <option value="A2">A2：能说简单句</option>
            <option value="B1">B1：能表达基本观点</option>
            <option value="B2">B2：能进行较复杂讨论</option>
          </select>
        </label>
      </div>

      <div className="field-block">
        <span className="field-title">学习目标</span>
        <div className="chip-grid">
          {goalOptions.map((goal) => (
            <button className={profile.goals.includes(goal) ? "chip selected" : "chip"} key={goal} onClick={() => toggleGoal(goal)} type="button">
              {goal}
            </button>
          ))}
        </div>
        <input placeholder="自定义目标" value={profile.customGoal} onChange={(event) => setProfile({ ...profile, customGoal: event.target.value })} />
      </div>

      <div className="field-block">
        <span className="field-title">开口压力：{profile.anxiety}</span>
        <input type="range" min="1" max="5" value={profile.anxiety} onChange={(event) => setProfile({ ...profile, anxiety: Number(event.target.value) })} />
      </div>

      <div className="segmented">
        {(["Gentle", "Balanced", "Direct"] as const).map((mode) => (
          <button key={mode} className={profile.supportPreference === mode ? "active" : ""} onClick={() => setProfile({ ...profile, supportPreference: mode })}>
            {mode}
          </button>
        ))}
      </div>

      <div className="setup-actions">
        <button className="secondary" onClick={skip}>
          Skip
        </button>
        <button className="primary" onClick={() => submit(profile)}>
          Continue
        </button>
      </div>
    </section>
  );
}

function CompanionSetupPage({
  initialCompanion,
  submit,
  skip
}: {
  initialCompanion: CompanionProfile;
  submit: (companion: CompanionProfile) => void;
  skip: () => void;
}) {
  const [companion, setCompanion] = useState(initialCompanion);

  return (
    <section className="setup-panel companion-setup">
      <div className="setup-header">
        <NomiOrb state="speaking" />
        <div>
          <p className="eyebrow">Companion Setup</p>
          <h1>创建你的 TinyBu</h1>
          <p>朋友 + 轻教练，先回应内容，再帮你把话说自然一点。</p>
        </div>
      </div>

      <div className="character-sheet">
        <div>
          <span>名字</span>
          <strong>TinyBu</strong>
        </div>
        <div>
          <span>身份</span>
          <strong>AI 外语表达伙伴</strong>
        </div>
        <div>
          <span>性格</span>
          <strong>温和、耐心、轻鼓励</strong>
        </div>
      </div>

      <div className="field-block">
        <span className="field-title">陪伴风格</span>
        <div className="chip-grid">
          {(["Warm Friend", "Gentle Coach", "Native Buddy", "Calm Listener"] as const).map((style) => (
            <button key={style} className={companion.style === style ? "chip selected" : "chip"} onClick={() => setCompanion({ ...companion, style })}>
              {style}
            </button>
          ))}
        </div>
      </div>

      <div className="field-block">
        <span className="field-title">反馈方式</span>
        <select
          value={companion.feedbackTiming}
          onChange={(event) => setCompanion({ ...companion, feedbackTiming: event.target.value as CompanionProfile["feedbackTiming"] })}
        >
          <option value="after-talk">对话后再反馈，不打断我</option>
          <option value="when-stuck">我卡住时再提示</option>
          <option value="light-live">可以适当即时建议</option>
          <option value="direct-natural">直接帮我改自然</option>
        </select>
      </div>

      <div className="segmented">
        {(["slow", "normal", "fast"] as const).map((pace) => (
          <button key={pace} className={companion.speakingPace === pace ? "active" : ""} onClick={() => setCompanion({ ...companion, speakingPace: pace })}>
            {pace === "slow" ? "慢速" : pace === "normal" ? "正常" : "稍快"}
          </button>
        ))}
      </div>

      <div className="setup-actions">
        <button className="secondary" onClick={skip}>
          Use Default TinyBu
        </button>
        <button className="primary" onClick={() => submit(companion)}>
          Create TinyBu
        </button>
      </div>
    </section>
  );
}

function HomePage({
  appState,
  captures,
  sessions,
  expressions,
  pasteDraft,
  setPasteDraft,
  startCapture,
  continuePractice,
  createManualCapture,
  tryDemo,
  navigate,
  clearAllData
}: {
  appState: AppStateRecord;
  captures: CaptureItem[];
  sessions: PracticeSession[];
  expressions: ExpressionRecord[];
  pasteDraft: string;
  setPasteDraft: (value: string) => void;
  startCapture: (capture: CaptureItem) => void;
  continuePractice: (session: PracticeSession) => void;
  createManualCapture: () => void;
  tryDemo: () => void;
  navigate: (screen: Screen) => void;
  clearAllData: () => void;
}) {
  const newCaptures = captures.filter((capture) => capture.status === "new");
  const activeSessions = sessions.filter((session) => session.status === "active");
  const startOfWeek = weekStart();
  const completedThisWeek = sessions.filter((session) => session.completedAt && new Date(session.completedAt) >= startOfWeek).length;
  const savedCount = expressions.filter((item) => item.saved && !item.learned).length;
  const needPracticeCount = expressions.filter((item) => !item.learned && item.category === "need-practice").length;

  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Home</p>
          <h1>今天从哪段内容开始练？</h1>
          <p>
            当前目标：{appState.profile.targetLanguage} · {appState.profile.level} · {appState.profile.supportPreference}
          </p>
        </div>
        <div className="page-actions">
          <button className="icon-text-button" onClick={clearAllData}>
            <RotateCcw size={18} />
            清空内容
          </button>
          <button className="icon-text-button" onClick={() => navigate("settings")}>
            <Settings size={18} />
            设置
          </button>
        </div>
      </div>

      <section className="plain-section">
        <div className="section-title">
          <Sparkles size={18} />
          New Captures
        </div>
        {newCaptures.length ? (
          <div className="capture-list">
            {newCaptures.map((capture) => (
              <article className="capture-row" key={capture.id}>
                <div>
                  <strong>{capture.title}</strong>
                  <span>
                    {sourceLabel(capture.sourceKind)} · {capture.fragments.length} 个片段 · {formatDate(capture.capturedAt)}
                  </span>
                </div>
                <button className="primary" onClick={() => startCapture(capture)}>
                  Start Practice
                </button>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState title="还没有新捕捉" body="从浏览器发送内容，或在下面手动粘贴一段文本。" />
        )}
      </section>

      <div className="two-column">
        <section className="plain-section">
          <div className="section-title">
            <MessageCircle size={18} />
            Continue Practice
          </div>
          {activeSessions.length ? (
            <div className="content-list">
              {activeSessions.map((session) => {
                const capture = captures.find((item) => item.id === session.captureId);
                return (
                  <button key={session.id} className="content-row" onClick={() => continuePractice(session)}>
                    <strong>{capture?.title ?? "Untitled Practice"}</strong>
                    <span>
                      {session.stage} · {session.answers.length}/{session.questions.length || 4} answered
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <EmptyState title="没有未完成练习" body="开始一个 New Capture 后，这里会显示进度。" />
          )}
        </section>

        <section className="plain-section">
          <div className="section-title">
            <PanelRightOpen size={18} />
            Paste Manually
          </div>
          <textarea value={pasteDraft} onChange={(event) => setPasteDraft(event.target.value)} placeholder="Paste text, article excerpt, or subtitles here..." />
          <div className="bottom-actions">
            <button className="primary" onClick={createManualCapture}>
              Create Capture
            </button>
            <button className="secondary" onClick={tryDemo}>
              Try Demo Content
            </button>
          </div>
        </section>
      </div>

      <section className="plain-section">
        <div className="section-title">
          <NotebookTabs size={18} />
          Recent Progress
        </div>
        <div className="recent-grid">
          <div>
            <span>本周完成</span>
            <strong>{completedThisWeek} 次练习</strong>
          </div>
          <div>
            <span>保存表达</span>
            <strong>{savedCount} 条</strong>
          </div>
          <div>
            <span>待复习</span>
            <strong>{needPracticeCount} 条</strong>
          </div>
        </div>
      </section>
    </section>
  );
}

function PracticePage({
  capture,
  session,
  review,
  input,
  setInput,
  updateCapture,
  startPractice,
  requestTip,
  submitAnswer,
  insertTip,
  navigate,
  nomiState
}: {
  capture?: CaptureItem;
  session?: PracticeSession;
  review?: ReviewRecord;
  input: string;
  setInput: (value: string) => void;
  updateCapture: (capture: CaptureItem) => void;
  startPractice: (capture: CaptureItem) => void;
  requestTip: (session: PracticeSession) => void;
  submitAnswer: (session: PracticeSession) => void;
  insertTip: (text: string) => void;
  navigate: (screen: Screen) => void;
  nomiState: NomiState;
}) {
  if (!capture) {
    return <EmptyState title="还没有可练习内容" body="先从 Home 创建或接收一个 New Capture。" />;
  }

  const stage = session?.stage ?? "select";
  const selectedFragments = capture.fragments.filter((fragment) =>
    session ? session.selectedFragmentIds.includes(fragment.id) : fragment.selected
  );
  const currentQuestion = session?.questions[session.currentQuestionIndex];

  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Practice</p>
          <h1>{capture.title}</h1>
          <p>
            {sourceLabel(capture.sourceKind)} · {capture.fragments.length} 个片段 · {formatDate(capture.capturedAt)}
          </p>
          {capture.sourceUrl && (
            <a className="source-link" href={capture.sourceUrl} target="_blank" rel="noreferrer">
              {capture.sourceUrl}
            </a>
          )}
        </div>
        <NomiOrb state={nomiState} />
      </div>

      <div className="practice-steps">
        {practiceSteps.map((step) => (
          <span key={step.stage} className={step.stage === stage ? "active" : ""}>
            {step.en} · {step.label}
          </span>
        ))}
      </div>

      {stage === "select" && (
        <SelectStage capture={capture} updateCapture={updateCapture} startPractice={startPractice} />
      )}

      {stage === "answer" && session && currentQuestion && (
        <AnswerStage
          session={session}
          question={currentQuestion}
          capture={capture}
          selectedFragments={selectedFragments}
          input={input}
          setInput={setInput}
          requestTip={requestTip}
          submitAnswer={submitAnswer}
          insertTip={insertTip}
        />
      )}

      {stage === "review" && review && (
        <ReviewStage review={review} expressionsSaved={review.savedExpressionIds.length} navigate={navigate} />
      )}
    </section>
  );
}

function SelectStage({
  capture,
  updateCapture,
  startPractice
}: {
  capture: CaptureItem;
  updateCapture: (capture: CaptureItem) => void;
  startPractice: (capture: CaptureItem) => void;
}) {
  const selectedCount = capture.fragments.filter((fragment) => fragment.selected).length;
  const isSubtitleCapture = capture.sourceKind === "youtube" || capture.sourceKind === "video";
  const setAll = (selected: boolean) => {
    updateCapture({
      ...capture,
      fragments: capture.fragments.map((fragment) => ({ ...fragment, selected }))
    });
  };

  return (
    <div className="practice-layout">
      <div className="practice-main">
        <section className="plain-section capture-understanding">
          <div className="section-title">
            <Sparkles size={18} />
            Understand first
          </div>
          <h2>{capture.topic || "先理解这段内容"}</h2>
          <p>{capture.summary || "TinyBu 会先帮你抓住主题，再把内容变成可以开口聊的问题。"}</p>
          {!!capture.suggestedExpressions?.length && (
            <div className="expression-chips">
              {capture.suggestedExpressions.slice(0, 4).map((expression) => (
                <span key={expression}>{expression}</span>
              ))}
            </div>
          )}
          {!!capture.questions?.length && (
            <div className="question-preview">
              {capture.questions.slice(0, 3).map((question) => (
                <p key={question}>{question}</p>
              ))}
            </div>
          )}
        </section>
        <section className="plain-section">
          <div className="section-title">
            <Check size={18} />
            选择要开聊的片段
          </div>
          <div className="fragment-list">
            {capture.fragments.map((fragment) => (
              <label className={fragment.selected ? "fragment-row selected" : "fragment-row"} key={fragment.id}>
                <input
                  type="checkbox"
                  checked={fragment.selected}
                  onChange={(event) =>
                    updateCapture({
                      ...capture,
                      fragments: capture.fragments.map((item) =>
                        item.id === fragment.id ? { ...item, selected: event.target.checked } : item
                      )
                    })
                  }
                />
                <span>{String(fragment.sourceIndex + 1).padStart(2, "0")}</span>
                <p>{fragment.text}</p>
                {fragment.recommended && <em>TinyBu 推荐</em>}
              </label>
            ))}
          </div>
        </section>
        <div className="bottom-actions">
          <button className="secondary" onClick={() => setAll(true)}>
            Select all
          </button>
          <button className="secondary" onClick={() => setAll(false)}>
            Clear all
          </button>
          <button className="primary dark" disabled={!selectedCount} onClick={() => startPractice(capture)}>
            围绕主题开聊
          </button>
        </div>
      </div>
      <aside className="companion-panel">
        <NomiOrb state="encouraging" />
        <p>
          {isSubtitleCapture
            ? "字幕 transcript 默认全选。你可以取消不想练的句子。"
            : "保留你真的想练的片段就好。短内容默认全选，长文章 TinyBu 会先推荐 3-6 条。"}
        </p>
        <div className="section-title">Selected</div>
        <strong>{selectedCount} / {capture.fragments.length}</strong>
      </aside>
    </div>
  );
}

function AnswerStage({
  session,
  question,
  capture,
  selectedFragments,
  input,
  setInput,
  requestTip,
  submitAnswer,
  insertTip
}: {
  session: PracticeSession;
  question: PracticeQuestion;
  capture: CaptureItem;
  selectedFragments: CaptureFragment[];
  input: string;
  setInput: (value: string) => void;
  requestTip: (session: PracticeSession) => void;
  submitAnswer: (session: PracticeSession) => void;
  insertTip: (text: string) => void;
}) {
  const relatedIds = new Set(question.relatedFragmentIds);
  const lastAnswer = session.answers[session.answers.length - 1];

  return (
    <div className="practice-layout">
      <div className="practice-main">
        <section className="plain-section question-panel">
          <span>
            Question {session.currentQuestionIndex + 1} / {session.questions.length}
          </span>
          <h2>{question.question}</h2>
          {lastAnswer && (
            <div className="nomi-reply">
              <strong>TinyBu</strong>
              <p>{lastAnswer.nomiReply}</p>
            </div>
          )}
        </section>

        {question.tipLevel > 0 && (
          <section className="tip-panel">
            <div className="section-title">
              <Lightbulb size={18} />
              Tips
            </div>
            <p>{question.tipLevel === 1 ? question.tipOutline : question.tipExample}</p>
            {question.tipLevel >= 2 && (
              <button className="secondary" onClick={() => insertTip(question.tipExample)}>
                填入输入框
              </button>
            )}
          </section>
        )}

        <div className="answer-box">
          <textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="Type your answer in the target language..." />
          <div className="bottom-actions">
            <button className="secondary" onClick={() => requestTip(session)}>
              <Lightbulb size={18} />
              Tips
            </button>
            <button className="primary" onClick={() => submitAnswer(session)}>
              <Send size={18} />
              Send
            </button>
          </div>
        </div>
      </div>

      <aside className="selected-context">
        <div className="section-title">{capture.title}</div>
        {selectedFragments.map((fragment) => (
          <div key={fragment.id} className={relatedIds.has(fragment.id) ? "context-fragment active" : "context-fragment"}>
            <span>{String(fragment.sourceIndex + 1).padStart(2, "0")}</span>
            <p>{fragment.text}</p>
          </div>
        ))}
      </aside>
    </div>
  );
}

function ReviewStage({
  review,
  expressionsSaved,
  navigate
}: {
  review: ReviewRecord;
  expressionsSaved: number;
  navigate: (screen: Screen) => void;
}) {
  return (
    <section className="review-grid">
      <section className="plain-section wide">
        <h2>Review · 本次练习复盘</h2>
        <p>{formatDate(review.createdAt)}</p>
      </section>
      <section className="plain-section wide">
        <h2>What you talked about · 你刚刚聊了什么</h2>
        <p>{review.talkedAbout}</p>
      </section>
      <section className="plain-section">
        <h2>What you did well · 你表达得不错的地方</h2>
        <ul className="clean-list">
          {review.didWell.map((item) => (
            <li key={item}>
              <Check size={16} />
              {item}
            </li>
          ))}
        </ul>
      </section>
      <section className="plain-section">
        <h2>More natural expressions · 可以更自然的说法</h2>
        {review.naturalExpressions.map((item) => (
          <div className="natural-pair" key={`${item.original}-${item.improved}`}>
            <span>Your sentence</span>
            <p>{item.original}</p>
            <span>More natural</span>
            <strong>{item.improved}</strong>
          </div>
        ))}
      </section>
      <section className="plain-section">
        <h2>Saved to Notebook · 已保存到 Notebook</h2>
        <p>{expressionsSaved} 条有价值的表达已经进入 Notebook。</p>
        <button className="primary" onClick={() => navigate("notebook")}>
          Open Notebook
        </button>
      </section>
      <section className="plain-section">
        <h2>Next practice · 下次可以练什么</h2>
        <p>{review.nextPractice}</p>
        <button className="primary dark" onClick={() => navigate("home")}>
          Finish
        </button>
      </section>
    </section>
  );
}

function NotebookPage({
  captures,
  expressions,
  updateExpression,
  deleteExpression
}: {
  captures: CaptureItem[];
  expressions: ExpressionRecord[];
  updateExpression: (record: ExpressionRecord) => void;
  deleteExpression: (id: string) => void;
}) {
  const [tab, setTab] = useState<"need" | "saved" | "learned">("need");
  const recentCaptures = captures.slice(0, 6);
  const visible = expressions.filter((item) => {
    if (tab === "learned") return item.learned;
    if (tab === "saved") return item.saved && !item.learned;
    return !item.learned && (!item.saved || item.category === "need-practice");
  });
  const grouped = visible.reduce<Record<string, ExpressionRecord[]>>((acc, item) => {
    const day = new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(new Date(item.capturedAt));
    const key = `${day} · ${item.sourceTitle}`;
    acc[key] = [...(acc[key] ?? []), item];
    return acc;
  }, {});

  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Notebook</p>
          <h1>材料与表达复习</h1>
          <p>这里保留完整材料、主题、来源链接，以及 Review 自动保存的表达。</p>
        </div>
      </div>
      {!!recentCaptures.length && (
        <section className="plain-section">
          <div className="section-title">学习材料</div>
          <div className="source-note-list">
            {recentCaptures.map((capture) => (
              <article key={capture.id} className="source-note">
                <div>
                  <span className="eyebrow">{sourceLabel(capture.sourceKind)}</span>
                  <h2>{capture.topic || capture.title}</h2>
                  <p>{capture.summary || capture.fragments.slice(0, 2).map((fragment) => fragment.text).join(" ")}</p>
                  {capture.sourceUrl && (
                    <a className="source-link" href={capture.sourceUrl} target="_blank" rel="noreferrer">
                      {capture.sourceUrl}
                    </a>
                  )}
                </div>
                <span>{capture.sourceText?.length ?? capture.fragments.map((fragment) => fragment.text).join(" ").length} chars</span>
              </article>
            ))}
          </div>
        </section>
      )}
      <div className="segmented wrap">
        {[
          ["need", "Need Practice"],
          ["saved", "Saved"],
          ["learned", "Learned"]
        ].map(([value, label]) => (
          <button key={value} className={tab === value ? "active" : ""} onClick={() => setTab(value as typeof tab)}>
            {label}
          </button>
        ))}
      </div>
      {Object.keys(grouped).length ? (
        <div className="notebook-list">
          {Object.entries(grouped).map(([group, records]) => (
            <section className="plain-section" key={group}>
              <div className="section-title">{group}</div>
              {records.map((record) => (
                <article key={record.id} className="expression-record">
                  <div>
                    <span className="eyebrow">{record.scene}</span>
                    <h2>{record.pattern}</h2>
                    <p>{record.original}</p>
                    <small>{record.meaning}</small>
                  </div>
                  <div className="record-meta">
                    <span>练习 {record.practiceCount} 次</span>
                    <span>{record.learned ? "Learned" : record.saved ? "Saved" : "Need Practice"}</span>
                  </div>
                  <div className="record-actions">
                    <button onClick={() => updateExpression({ ...record, practiceCount: record.practiceCount + 1, category: "need-practice" })}>
                      Practice again
                    </button>
                    <button onClick={() => updateExpression({ ...record, saved: true, learned: false })}>Save</button>
                    <button onClick={() => updateExpression({ ...record, learned: true })}>Mark as learned</button>
                    <button className="danger" onClick={() => deleteExpression(record.id)}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </article>
              ))}
            </section>
          ))}
        </div>
      ) : (
        <EmptyState title="Notebook 还是空的" body="完成一次 Practice 后，有价值的表达会自动保存到这里。" />
      )}
    </section>
  );
}

function NomiMemoryPage({
  memories,
  deleteMemory,
  updateMemoryItem
}: {
  memories: MemoryItem[];
  deleteMemory: (id: string) => void;
  updateMemoryItem: (item: MemoryItem) => void;
}) {
  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">TinyBu</p>
          <h1>TinyBu&apos;s Memory</h1>
          <p>TinyBu 记住的是学习偏好和支架方式，不是隐私标签。每条都可以编辑或删除。</p>
        </div>
      </div>
      {memories.length ? (
        <div className="memory-grid">
          {memories.map((memory) => (
            <article className={`memory-item ${memory.type}`} key={memory.id}>
              <span>{memory.type}</span>
              <input value={memory.title} onChange={(event) => updateMemoryItem({ ...memory, title: event.target.value, updatedAt: nowIso() })} />
              <textarea value={memory.body} onChange={(event) => updateMemoryItem({ ...memory, body: event.target.value, updatedAt: nowIso() })} />
              <button className="danger" onClick={() => deleteMemory(memory.id)}>
                <Trash2 size={16} />
                Delete
              </button>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState title="还没有 TinyBu Memory" body="完成一次 Practice 后，TinyBu 会记录可编辑的学习偏好。" />
      )}
    </section>
  );
}

function SettingsPage({
  appState,
  apiKeyDraft,
  setApiKeyDraft,
  saveSettings,
  clearUserKey,
  clearMemory,
  clearAllData,
  resetOnboarding
}: {
  appState: AppStateRecord;
  apiKeyDraft: string;
  setApiKeyDraft: (value: string) => void;
  saveSettings: (state: AppStateRecord, key?: string) => void;
  clearUserKey: () => void;
  clearMemory: () => void;
  clearAllData: () => void;
  resetOnboarding: () => void;
}) {
  const [draft, setDraft] = useState(appState);

  useEffect(() => setDraft(appState), [appState]);

  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Settings</p>
          <h1>调整 TinyBu 的语言、支架和 AI 模式</h1>
        </div>
      </div>

      <div className="settings-grid">
        <section className="plain-section">
          <h2>学习设置</h2>
          <label>
            母语
            <select value={draft.profile.nativeLanguage} onChange={(event) => setDraft({ ...draft, profile: { ...draft.profile, nativeLanguage: event.target.value } })}>
              {languageOptions.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            目标语言
            <select value={draft.profile.targetLanguage} onChange={(event) => setDraft({ ...draft, profile: { ...draft.profile, targetLanguage: event.target.value } })}>
              {targetLanguageOptions.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            当前水平
            <select
              value={draft.profile.level}
              onChange={(event) => setDraft({ ...draft, profile: { ...draft.profile, level: event.target.value as UserProfile["level"] } })}
            >
              <option value="A1">A1</option>
              <option value="A2">A2</option>
              <option value="B1">B1</option>
              <option value="B2">B2</option>
            </select>
          </label>
          <label>
            开口压力：{draft.profile.anxiety}
            <input
              type="range"
              min="1"
              max="5"
              value={draft.profile.anxiety}
              onChange={(event) => setDraft({ ...draft, profile: { ...draft.profile, anxiety: Number(event.target.value) } })}
            />
          </label>
        </section>

        <section className="plain-section">
          <h2>TinyBu 设置</h2>
          <label>
            TinyBu 风格
            <select
              value={draft.companion.style}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  companion: { ...draft.companion, style: event.target.value as CompanionProfile["style"] }
                })
              }
            >
              <option>Warm Friend</option>
              <option>Gentle Coach</option>
              <option>Native Buddy</option>
              <option>Calm Listener</option>
            </select>
          </label>
          <label>
            语速
            <select
              value={draft.companion.speakingPace}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  companion: {
                    ...draft.companion,
                    speakingPace: event.target.value as CompanionProfile["speakingPace"]
                  }
                })
              }
            >
              <option value="slow">慢速</option>
              <option value="normal">正常</option>
              <option value="fast">稍快</option>
            </select>
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={draft.settings.gentleFeedback}
              onChange={(event) => setDraft({ ...draft, settings: { ...draft.settings, gentleFeedback: event.target.checked } })}
            />
            开启温和反馈
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={draft.settings.showNativeAid}
              onChange={(event) => setDraft({ ...draft, settings: { ...draft.settings, showNativeAid: event.target.checked } })}
            />
            显示母语辅助
          </label>
        </section>

        <section className="plain-section">
          <h2>AI 模式</h2>
          <div className="segmented wrap">
            {(["rules", "user-key", "cloud-proxy"] as const).map((mode) => (
              <button key={mode} className={draft.settings.aiProviderMode === mode ? "active" : ""} onClick={() => setDraft({ ...draft, settings: { ...draft.settings, aiProviderMode: mode } })}>
                {mode === "rules" ? "本地规则" : mode === "user-key" ? "用户 Key" : "云端代理"}
              </button>
            ))}
          </div>
          <label>
            模型
            <input value={draft.settings.aiModel} onChange={(event) => setDraft({ ...draft, settings: { ...draft.settings, aiModel: event.target.value } })} />
          </label>
          <label>
            Cloud Proxy URL
            <input value={draft.settings.cloudProxyUrl} onChange={(event) => setDraft({ ...draft, settings: { ...draft.settings, cloudProxyUrl: event.target.value } })} />
          </label>
          <label>
            OpenAI API Key（仅用户 Key 模式）
            <input
              type="password"
              value={apiKeyDraft}
              onChange={(event) => setApiKeyDraft(event.target.value)}
              placeholder={draft.settings.apiKeySaved ? "Key 已保存，可输入新 Key 覆盖" : "sk-..."}
            />
          </label>
          <div className="bottom-actions">
            <button className="secondary" onClick={clearUserKey}>
              <KeyRound size={18} />
              清除 Key
            </button>
          </div>
        </section>

        <section className="plain-section danger-zone">
          <h2>数据</h2>
          <button className="secondary" onClick={clearMemory}>
            清空 TinyBu Memory
          </button>
          <button className="secondary" onClick={resetOnboarding}>
            <RotateCcw size={18} />
            重置 onboarding
          </button>
          <button className="danger" onClick={clearAllData}>
            <Trash2 size={18} />
            清空学习数据
          </button>
        </section>
      </div>

      <div className="sticky-save">
        <button className="primary" onClick={() => saveSettings(draft, apiKeyDraft)}>
          <Save size={18} />
          Save Settings
        </button>
      </div>
    </section>
  );
}
