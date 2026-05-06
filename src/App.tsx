import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  BookOpen,
  Brain,
  Check,
  ChevronLeft,
  ChevronRight,
  Home,
  Inbox,
  KeyRound,
  Lightbulb,
  MessageCircle,
  NotebookTabs,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Save,
  Search,
  Send,
  Settings,
  Sparkles,
  Trash2,
  Wand2
} from "lucide-react";
import { demoContents } from "./data/demoContent";
import { clearLearningData, db, loadAppState, normalizeCapture, saveAppState } from "./lib/db";
import { clearUserApiKey, loadUserApiKey, saveUserApiKey } from "./lib/secureKey";
import { invokeTauri, listenTauri, type CaptureBridgeState } from "./lib/tauriBridge";
import { defaultAppState, nowIso, uid } from "./lib/defaults";
import {
  answerScreenshotQuestion,
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
  ScreenshotQuestionAnswer,
  TopicItem,
  TopicStatus,
  UserProfile
} from "./types";

const goalOptions = ["日常聊天", "旅行交流", "学习 / 留学", "工作沟通", "观点表达", "看视频学表达", "减少开口焦虑"];
const languageOptions = ["中文", "English", "日本語", "Español", "Français", "Deutsch", "한국어", "Other"];
const targetLanguageOptions = ["English", "Japanese", "Spanish", "French", "German", "Chinese", "Korean", "Other"];

const captureStatusLabels: Record<CaptureStatus, string> = {
  unsorted: "Unsorted",
  suggested: "Suggested",
  "in-topic": "In Topic",
  studied: "Studied",
  practiced: "Practiced",
  archived: "Archived"
};

const topicStatusLabels: Record<TopicStatus, string> = {
  ready: "Ready to study",
  "in-progress": "In progress",
  practiced: "Practiced"
};

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
  if (kind === "youtube") return "YouTube transcript";
  if (kind === "video") return "Video transcript";
  if (kind === "article") return "Article";
  if (kind === "selection") return "Web selection";
  if (kind === "screenshot") return "Screenshot";
  return "Pasted text";
}

function normalizeStatus(status: CaptureItem["status"]): CaptureStatus {
  if (status === "new") return "unsorted";
  if (status === "in-practice") return "studied";
  if (status === "completed") return "practiced";
  return status;
}

function captureText(capture: CaptureItem) {
  return capture.sourceText || capture.fragments.map((fragment) => fragment.text).join("\n");
}

function suggestedGroups(captures: CaptureItem[]) {
  const groups = captures
    .filter((capture) => !capture.topicId && normalizeStatus(capture.status) !== "archived")
    .reduce<Record<string, CaptureItem[]>>((acc, capture) => {
      const name = capture.topic || "Fresh Captures";
      acc[name] = [...(acc[name] ?? []), capture];
      return acc;
    }, {});

  return Object.entries(groups).map(([name, items]) => ({
    id: name,
    name,
    captures: items,
    summary: items[0]?.summary || "A suggested topic based on recent captures.",
    practiceGoal: inferPracticeGoal(items)
  }));
}

function inferPracticeGoal(captures: CaptureItem[]) {
  const text = captures.flatMap((capture) => capture.questions ?? []).join(" ");
  if (/compare|different|优缺点|比较/i.test(text)) return "Compare two ideas";
  if (/agree|opinion|观点|think/i.test(text)) return "Express an opinion";
  if (/summarize|main idea|复述|summary/i.test(text)) return "Retell the key idea";
  return "Give a clear personal response";
}

function topicCaptures(topic: TopicItem | undefined, captures: CaptureItem[]) {
  if (!topic) return [];
  const ids = new Set(topic.captureIds);
  return captures.filter((capture) => ids.has(capture.id));
}

function topicExpressions(topic: TopicItem | undefined, expressions: ExpressionRecord[]) {
  if (!topic) return [];
  return expressions.filter((expression) => topic.captureIds.includes(expression.sourceContentId));
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
    <div className={`nomi-orb ${state}`} aria-label={`TinyBu ${label[state]}`}>
      <div className="nomi-face">
        <span className="eye left" />
        <span className="eye right" />
        <span className="mouth" />
      </div>
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

  async function importScreenshotCapture(payload: ScreenshotCapturePayload) {
    const previewCapture = createScreenshotPreviewCapture(payload);
    if (!appState.settings.screenshotRecognitionEnabled) {
      await db.captures.put(previewCapture);
      setCaptures((items) => [previewCapture, ...items]);
      await persistState({
        ...appState,
        onboarded: true,
        companionReady: true,
        activeCaptureId: previewCapture.id
      });
      navigate("inbox");
      return;
    }

    setBusyLabel("Recognizing screenshot");
    setNomiState("thinking");
    try {
      const recognition = await recognizeScreenshotCapture({
        imageDataUrl: payload.imageDataUrl,
        width: payload.width,
        height: payload.height,
        appState
      });
      const text = String(recognition.text ?? "").trim();
      const capture = await createCaptureRecord({
        title: recognition.title || "Screenshot Capture",
        sourceUrl: "",
        sourceKind: "screenshot",
        text: text || recognition.visibleText.join("\n") || "Screenshot capture",
        capturedAt: payload.capturedAt,
        appState,
        screenshot: {
          imageDataUrl: payload.imageDataUrl,
          width: payload.width,
          height: payload.height,
          language: recognition.language,
          screenType: recognition.screenType,
          contextNote: recognition.contextNote,
          visibleText: recognition.visibleText,
          errorMessages: recognition.errorMessages,
          interactiveElements: recognition.interactiveElements,
          questionAnswers: []
        }
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
    } catch (error) {
      const diagnosticCapture = createScreenshotDiagnosticCapture(
        payload,
        error instanceof Error ? error.message : "Screenshot recognition failed"
      );
      await db.captures.put(diagnosticCapture);
      setCaptures((items) => [diagnosticCapture, ...items]);
      navigate("inbox");
    } finally {
      setBusyLabel("");
      setNomiState("idle");
    }
  }

  function createScreenshotPreviewCapture(payload: ScreenshotCapturePayload): CaptureItem {
    const area = payload.captureArea;
    const areaNote = area ? `Captured area: x=${area.x}, y=${area.y}, ${area.width}x${area.height}.` : "";
    const previewText = `Screenshot preview mode. AI recognition is disabled. ${areaNote}`;
    return {
      id: uid("capture"),
      title: "Screenshot Preview",
      sourceUrl: "",
      sourceKind: "screenshot",
      sourceText: previewText,
      screenshot: {
        imageDataUrl: payload.imageDataUrl,
        width: payload.width,
        height: payload.height,
        language: "Unknown",
        screenType: "Screenshot",
        contextNote: previewText,
        visibleText: [],
        errorMessages: [],
        interactiveElements: [],
        questionAnswers: []
      },
      topic: "Screenshot Notes",
      summary: previewText,
      keywords: ["screenshot"],
      questions: ["What do you want to understand from this screenshot?"],
      suggestedExpressions: [],
      capturedAt: payload.capturedAt,
      fragments: [
        {
          id: uid("fragment"),
          text: previewText,
          selected: true,
          recommended: true,
          sourceIndex: 0
        }
      ],
      status: "unsorted"
    };
  }

  function createScreenshotDiagnosticCapture(payload: ScreenshotCapturePayload, message: string): CaptureItem {
    const diagnosticText = `Screenshot was captured, but OCR did not return text. ${message}`;
    return {
      ...createScreenshotPreviewCapture(payload),
      id: uid("capture"),
      title: "Screenshot OCR Diagnostic",
      sourceText: diagnosticText,
      summary: diagnosticText,
      fragments: [{ id: uid("fragment"), text: diagnosticText, selected: true, recommended: true, sourceIndex: 0 }]
    };
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

  async function askAboutScreenshot(capture: CaptureItem, question: string) {
    const text = question.trim();
    if (!text || screenshotQuestionBusy || !capture.screenshot) return;
    setScreenshotQuestionInput("");
    setScreenshotQuestionBusy(true);
    setNomiState("thinking");
    try {
      const output = await answerScreenshotQuestion({
        question: text,
        screenshot: {
          imageDataUrl: capture.screenshot.imageDataUrl,
          title: capture.title,
          sourceText: captureText(capture),
          summary: capture.summary,
          screenType: capture.screenshot.screenType,
          visibleText: capture.screenshot.visibleText,
          errorMessages: capture.screenshot.errorMessages,
          interactiveElements: capture.screenshot.interactiveElements
        },
        appState
      });
      const answer: ScreenshotQuestionAnswer = {
        id: uid("screenshot-answer"),
        question: text,
        answer: output.answer,
        quotedText: output.quotedText,
        nextAction: output.nextAction,
        createdAt: nowIso()
      };
      await updateCapture({
        ...capture,
        screenshot: {
          ...capture.screenshot,
          questionAnswers: [answer, ...(capture.screenshot.questionAnswers ?? [])]
        }
      });
      setNomiState("encouraging");
    } finally {
      setScreenshotQuestionBusy(false);
    }
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
              <button className={screen === "inbox" || screen === "organize" ? "active" : ""} onClick={() => navigate("inbox")}>
                <Inbox size={18} /> Inbox
              </button>
              <button
                className={["topics", "topic-detail", "study-room", "practice", "practice-review"].includes(screen) ? "active" : ""}
                onClick={() => navigate("topics")}
              >
                <BookOpen size={18} /> Topics
              </button>
              <button className={screen === "notebook" ? "active" : ""} onClick={() => navigate("notebook")}>
                <NotebookTabs size={18} /> Notebook
              </button>
              <button className={screen === "memory" ? "active" : ""} onClick={() => navigate("memory")}>
                <Brain size={18} /> Bu&apos;s Memory
              </button>
            </nav>
            <button className={screen === "settings" ? "settings-link active" : "settings-link"} onClick={() => navigate("settings")}>
              <Settings size={18} /> Settings
            </button>
          </aside>

          <main className="main-panel">
            {screen === "home" && (
              <HomePage
                appState={appState}
                captures={captures}
                topics={topics}
                sessions={practiceSessions}
                expressions={expressions}
                memories={memories}
                pasteDraft={homePasteDraft}
                setPasteDraft={setHomePasteDraft}
                createManualCapture={() =>
                  createAndStoreCapture({
                    title: "Pasted Text",
                    sourceUrl: "",
                    sourceKind: "manual",
                    text: homePasteDraft
                  })
                }
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

function AppHeader({
  title,
  description,
  children
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="app-header">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      <div className="header-actions">{children}</div>
    </header>
  );
}

function WelcomePage({ start, demo }: { start: () => void; demo: () => void }) {
  return (
    <section className="welcome-layout">
      <div className="hero-copy">
        <div className="brand-mark">
          <NomiOrb state="speaking" />
          <span>TinyBu</span>
        </div>
        <h1>Turn real captures into language practice.</h1>
        <p>把网页、视频、文章和截图里的零散外语内容，整理成可以理解、练习和沉淀的学习工作台。</p>
        <div className="hero-actions">
          <button className="primary" onClick={start}>
            Start with TinyBu <ChevronRight size={18} />
          </button>
          <button className="secondary" onClick={demo}>
            Try Demo
          </button>
        </div>
      </div>
      <div className="preview-window">
        <div className="preview-toolbar">
          <span />
          <span />
          <span />
        </div>
        <div className="preview-content">
          <div className="preview-sidebar" />
          <div className="preview-card wide" />
          <div className="preview-card" />
          <div className="preview-card" />
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
    setProfile((current) => ({
      ...current,
      goals: current.goals.includes(goal) ? current.goals.filter((item) => item !== goal) : [...current.goals, goal]
    }));
  };

  return (
    <section className="setup-card">
      <div className="setup-header">
        <NomiOrb state="encouraging" />
        <div>
          <p className="eyebrow">TinyBu setup</p>
          <h1>先告诉 TinyBu 你想怎么学。</h1>
        </div>
      </div>
      <div className="form-grid">
        <label>
          Native language
          <select value={profile.nativeLanguage} onChange={(event) => setProfile({ ...profile, nativeLanguage: event.target.value })}>
            {languageOptions.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          Target language
          <select value={profile.targetLanguage} onChange={(event) => setProfile({ ...profile, targetLanguage: event.target.value })}>
            {targetLanguageOptions.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          Level
          <select value={profile.level} onChange={(event) => setProfile({ ...profile, level: event.target.value as UserProfile["level"] })}>
            <option>A1</option>
            <option>A2</option>
            <option>B1</option>
            <option>B2</option>
          </select>
        </label>
        <label>
          Support style
          <select
            value={profile.supportPreference}
            onChange={(event) => setProfile({ ...profile, supportPreference: event.target.value as UserProfile["supportPreference"] })}
          >
            <option>Gentle</option>
            <option>Balanced</option>
            <option>Direct</option>
          </select>
        </label>
      </div>
      <div className="chip-field">
        {goalOptions.map((goal) => (
          <button key={goal} className={profile.goals.includes(goal) ? "chip selected" : "chip"} onClick={() => toggleGoal(goal)}>
            {goal}
          </button>
        ))}
      </div>
      <label>
        Speaking pressure: {profile.anxiety}
        <input
          type="range"
          min="1"
          max="5"
          value={profile.anxiety}
          onChange={(event) => setProfile({ ...profile, anxiety: Number(event.target.value) })}
        />
      </label>
      <div className="bottom-actions">
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
    <section className="setup-card">
      <div className="setup-header">
        <NomiOrb state="speaking" />
        <div>
          <p className="eyebrow">Companion</p>
          <h1>选择 TinyBu 的陪伴方式。</h1>
        </div>
      </div>
      <div className="form-grid">
        <label>
          Name
          <input value={companion.name} onChange={(event) => setCompanion({ ...companion, name: event.target.value })} />
        </label>
        <label>
          Style
          <select
            value={companion.style}
            onChange={(event) => setCompanion({ ...companion, style: event.target.value as CompanionProfile["style"] })}
          >
            <option>Warm Friend</option>
            <option>Gentle Coach</option>
            <option>Native Buddy</option>
            <option>Calm Listener</option>
          </select>
        </label>
        <label>
          Feedback timing
          <select
            value={companion.feedbackTiming}
            onChange={(event) => setCompanion({ ...companion, feedbackTiming: event.target.value as CompanionProfile["feedbackTiming"] })}
          >
            <option value="after-talk">After I talk</option>
            <option value="when-stuck">When I get stuck</option>
            <option value="light-live">Light live support</option>
            <option value="direct-natural">Direct natural rewrite</option>
          </select>
        </label>
        <label>
          Speaking pace
          <select
            value={companion.speakingPace}
            onChange={(event) => setCompanion({ ...companion, speakingPace: event.target.value as CompanionProfile["speakingPace"] })}
          >
            <option>slow</option>
            <option>normal</option>
            <option>fast</option>
          </select>
        </label>
      </div>
      <div className="bottom-actions">
        <button className="secondary" onClick={skip}>
          Skip
        </button>
        <button className="primary" onClick={() => submit(companion)}>
          Enter TinyBu
        </button>
      </div>
    </section>
  );
}

function HomePage({
  appState,
  captures,
  topics,
  sessions,
  expressions,
  memories,
  pasteDraft,
  setPasteDraft,
  createManualCapture,
  openInbox,
  openTopic,
  continuePractice,
  tryDemo
}: {
  appState: AppStateRecord;
  captures: CaptureItem[];
  topics: TopicItem[];
  sessions: PracticeSession[];
  expressions: ExpressionRecord[];
  memories: MemoryItem[];
  pasteDraft: string;
  setPasteDraft: (value: string) => void;
  createManualCapture: () => void;
  openInbox: () => void;
  openTopic: (topic: TopicItem, next?: Screen) => void;
  continuePractice: (session: PracticeSession) => void;
  tryDemo: () => void;
}) {
  const today = new Date().toDateString();
  const todaysCaptures = captures.filter((capture) => new Date(capture.capturedAt).toDateString() === today);
  const suggested = suggestedGroups(captures).slice(0, 3);
  const activeSessions = sessions.filter((session) => session.status === "active");
  const recentTopic = topics[0];
  const recentExpressions = expressions.filter((item) => item.saved).slice(0, 5);
  const startOfWeek = weekStart();
  const completedThisWeek = sessions.filter((session) => session.completedAt && new Date(session.completedAt) >= startOfWeek).length;

  return (
    <section className="page">
      <AppHeader
        title="Home"
        description={`${appState.profile.targetLanguage} · ${appState.profile.level} · ${appState.profile.supportPreference}`}
      >
        <button className="secondary" onClick={openInbox}>
          Open Inbox
        </button>
      </AppHeader>

      <div className="home-layout">
        <main className="home-main">
          <section className="panel welcome-panel">
            <div>
              <p className="eyebrow">Welcome back</p>
              <h2>You saved {todaysCaptures.length} new captures today.</h2>
              <p>Bu found {suggested.length} suggested topics. Pick one to organize, understand, and practice.</p>
            </div>
            <div className="button-row">
              <button className="primary" onClick={openInbox}>
                Open Inbox
              </button>
              {recentTopic && (
                <button className="secondary" onClick={() => openTopic(recentTopic, "study-room")}>
                  Continue Last Topic
                </button>
              )}
            </div>
          </section>

          <section className="panel">
            <div className="section-title">
              <Sparkles size={18} />
              Suggested Topics
            </div>
            {suggested.length ? (
              <div className="card-list">
                {suggested.map((group) => (
                  <article className="topic-card" key={group.id}>
                    <div>
                      <h3>{group.name}</h3>
                      <p>{group.summary}</p>
                    </div>
                    <div className="meta-row">
                      <span>{group.captures.length} captures</span>
                      <span className="status-pill">Suggested</span>
                    </div>
                    <button className="primary" onClick={() => openInbox()}>
                      Open Topic
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState title="No suggested topics yet" body="Capture or paste something, then TinyBu will suggest topics here." />
            )}
          </section>

          <section className="panel">
            <div className="section-title">
              <MessageCircle size={18} />
              Continue Learning
            </div>
            {activeSessions.length ? (
              <div className="compact-list">
                {activeSessions.map((session) => {
                  const topic = topics.find((item) => item.id === session.topicId);
                  return (
                    <button className="list-row" key={session.id} onClick={() => continuePractice(session)}>
                      <div>
                        <strong>{topic?.name ?? "Active Practice"}</strong>
                        <span>
                          Practice · {session.answers.length}/{session.questions.length} answered
                        </span>
                      </div>
                      <ChevronRight size={18} />
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="stats-grid">
                <div>
                  <span>This week</span>
                  <strong>{completedThisWeek} practices</strong>
                </div>
                <div>
                  <span>Topics</span>
                  <strong>{topics.length}</strong>
                </div>
                <div>
                  <span>Notebook</span>
                  <strong>{recentExpressions.length} recent</strong>
                </div>
              </div>
            )}
          </section>
        </main>

        <aside className="home-side">
          <section className="panel">
            <div className="section-title">New Captures</div>
            <p>{captures.filter((capture) => normalizeStatus(capture.status) !== "archived" && !capture.topicId).length} waiting in Inbox.</p>
            <textarea value={pasteDraft} onChange={(event) => setPasteDraft(event.target.value)} placeholder="Paste text, article excerpt, or subtitles here..." />
            <div className="button-row">
              <button className="primary" onClick={createManualCapture}>
                Create Capture
              </button>
              <button className="secondary" onClick={tryDemo}>
                Try Demo
              </button>
            </div>
          </section>
          <section className="panel">
            <div className="section-title">Notebook Preview</div>
            {recentExpressions.length ? (
              <div className="mini-list">
                {recentExpressions.map((expression) => (
                  <span key={expression.id}>{expression.pattern}</span>
                ))}
              </div>
            ) : (
              <p>Saved expressions will appear after Study Room or Practice Review.</p>
            )}
          </section>
          <section className="panel">
            <div className="section-title">Bu&apos;s Memory</div>
            {memories.length ? (
              <div className="mini-list">
                {memories.slice(0, 3).map((memory) => (
                  <span key={memory.id}>{memory.title}</span>
                ))}
              </div>
            ) : (
              <p>Bu will remember interests, stuck points, and next steps after practice.</p>
            )}
          </section>
        </aside>
      </div>
    </section>
  );
}

function InboxPage({
  captures,
  topics,
  activeCapture,
  openCapture,
  updateCapture,
  archiveCapture,
  deleteCapture,
  createTopicFromCaptures,
  addCapturesToTopic,
  organize
}: {
  captures: CaptureItem[];
  topics: TopicItem[];
  activeCapture?: CaptureItem;
  openCapture: (capture: CaptureItem) => void;
  updateCapture: (capture: CaptureItem) => void;
  archiveCapture: (capture: CaptureItem) => void;
  deleteCapture: (id: string) => void;
  createTopicFromCaptures: (captureIds: string[], name?: string) => void;
  addCapturesToTopic: (captureIds: string[], topic: TopicItem) => void;
  organize: () => void;
}) {
  const [status, setStatus] = useState<"all" | CaptureStatus>("all");
  const [source, setSource] = useState<"all" | ExternalCaptureKind>("all");
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const visible = captures.filter((capture) => {
    const normalized = normalizeStatus(capture.status);
    if (status !== "all" && normalized !== status) return false;
    if (source !== "all" && capture.sourceKind !== source) return false;
    const haystack = `${capture.title} ${capture.summary} ${captureText(capture)}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  });
  const selectedCapture = activeCapture && visible.some((capture) => capture.id === activeCapture.id) ? activeCapture : visible[0];

  const toggleSelected = (id: string) => {
    setSelectedIds((items) => (items.includes(id) ? items.filter((item) => item !== id) : [...items, id]));
  };

  return (
    <section className="page">
      <AppHeader title="Inbox" description="Review, filter, and prepare raw captures before organizing them into topics.">
        <button className="secondary" onClick={organize}>
          Organize with Bu
        </button>
        <button className="primary" onClick={() => createTopicFromCaptures(selectedIds.length ? selectedIds : selectedCapture ? [selectedCapture.id] : [])}>
          New Topic
        </button>
      </AppHeader>

      <div className="inbox-layout">
        <aside className="filter-panel">
          <label className="search-box">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search captures" />
          </label>
          <div>
            <h3>Status</h3>
            {(["all", "unsorted", "suggested", "in-topic", "archived"] as const).map((item) => (
              <button key={item} className={status === item ? "filter active" : "filter"} onClick={() => setStatus(item)}>
                {item === "all" ? "All" : captureStatusLabels[item]}
              </button>
            ))}
          </div>
          <div>
            <h3>Source</h3>
            {(["all", "selection", "article", "youtube", "screenshot", "manual"] as const).map((item) => (
              <button key={item} className={source === item ? "filter active" : "filter"} onClick={() => setSource(item)}>
                {item === "all" ? "All" : sourceLabel(item)}
              </button>
            ))}
          </div>
        </aside>

        <main className="capture-column">
          {visible.length ? (
            visible.map((capture) => (
              <article
                key={capture.id}
                className={selectedCapture?.id === capture.id ? "capture-card active" : "capture-card"}
                onClick={() => openCapture(capture)}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(capture.id)}
                  onChange={(event) => {
                    event.stopPropagation();
                    toggleSelected(capture.id);
                  }}
                  onClick={(event) => event.stopPropagation()}
                />
                <div>
                  <h3>{capture.title}</h3>
                  <p>{capture.summary || capture.fragments[0]?.text}</p>
                  <div className="meta-row">
                    <span>{sourceLabel(capture.sourceKind)}</span>
                    <span>{formatDate(capture.capturedAt)}</span>
                    <span className="status-pill">{captureStatusLabels[normalizeStatus(capture.status)]}</span>
                  </div>
                </div>
                <div className="quick-actions">
                  <button onClick={(event) => { event.stopPropagation(); archiveCapture(capture); }} title="Archive">
                    <Archive size={16} />
                  </button>
                  <button onClick={(event) => { event.stopPropagation(); deleteCapture(capture.id); }} title="Delete">
                    <Trash2 size={16} />
                  </button>
                </div>
              </article>
            ))
          ) : (
            <EmptyState title="Inbox is empty" body="New browser captures, screenshots, or pasted text will arrive here." />
          )}
        </main>

        <aside className="detail-panel">
          {selectedCapture ? (
            <>
              <div>
                <p className="eyebrow">{sourceLabel(selectedCapture.sourceKind)}</p>
                <h2>{selectedCapture.title}</h2>
                <p>{selectedCapture.summary || "No AI summary yet."}</p>
              </div>
              {selectedCapture.screenshot && (
                <img className="screenshot-preview-image" src={selectedCapture.screenshot.imageDataUrl} alt="Captured screenshot preview" />
              )}
              <div className="source-preview">
                {selectedCapture.fragments.slice(0, 8).map((fragment) => (
                  <p key={fragment.id}>{fragment.text}</p>
                ))}
              </div>
              <div>
                <h3>Suggested Topic</h3>
                <span className="topic-suggestion">{selectedCapture.topic || "Fresh Captures"}</span>
              </div>
              <div className="stack-actions">
                <button className="primary" onClick={() => createTopicFromCaptures([selectedCapture.id], selectedCapture.topic)}>
                  Add to Topic
                </button>
                <button className="secondary" onClick={() => createTopicFromCaptures([selectedCapture.id])}>
                  Create New Topic
                </button>
                {!!topics.length && (
                  <button className="secondary" onClick={() => addCapturesToTopic([selectedCapture.id], topics[0])}>
                    Move to {topics[0].name}
                  </button>
                )}
                <button className="secondary" onClick={organize}>
                  Organize
                </button>
                <button className="danger" onClick={() => archiveCapture(selectedCapture)}>
                  Archive
                </button>
              </div>
              <label>
                Capture status
                <select
                  value={normalizeStatus(selectedCapture.status)}
                  onChange={(event) => updateCapture({ ...selectedCapture, status: event.target.value as CaptureStatus })}
                >
                  {Object.entries(captureStatusLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : (
            <EmptyState title="No capture selected" body="Choose a capture to preview source text and quick actions." />
          )}
        </aside>
      </div>
    </section>
  );
}

function OrganizePage({
  captures,
  topics,
  createTopicFromCaptures,
  addCapturesToTopic,
  back
}: {
  captures: CaptureItem[];
  topics: TopicItem[];
  createTopicFromCaptures: (captureIds: string[], name?: string) => void;
  addCapturesToTopic: (captureIds: string[], topic: TopicItem) => void;
  back: () => void;
}) {
  const groups = suggestedGroups(captures);
  const [selectedCaptureIds, setSelectedCaptureIds] = useState<string[]>([]);
  const [selectedGroupName, setSelectedGroupName] = useState(groups[0]?.name ?? "");
  const [topicName, setTopicName] = useState(groups[0]?.name ?? "New Topic");
  const selectedGroup = groups.find((group) => group.name === selectedGroupName) ?? groups[0];
  const unsorted = captures.filter((capture) => !capture.topicId && normalizeStatus(capture.status) !== "archived");

  useEffect(() => {
    if (selectedGroup) {
      setSelectedGroupName(selectedGroup.name);
      setTopicName(selectedGroup.name);
      setSelectedCaptureIds(selectedGroup.captures.map((capture) => capture.id));
    }
  }, [selectedGroup?.name]);

  const toggleCapture = (id: string) => {
    setSelectedCaptureIds((items) => (items.includes(id) ? items.filter((item) => item !== id) : [...items, id]));
  };

  return (
    <section className="page">
      <AppHeader title="Organize" description="Turn loose captures into durable topics.">
        <button className="secondary" onClick={back}>
          <ChevronLeft size={18} /> Inbox
        </button>
        <button className="primary" onClick={() => createTopicFromCaptures(selectedCaptureIds, topicName)}>
          Confirm Topic
        </button>
      </AppHeader>

      <div className="organize-layout">
        <aside className="panel overflow-panel">
          <div className="section-title">Unsorted Captures</div>
          {unsorted.map((capture) => (
            <label key={capture.id} className={selectedCaptureIds.includes(capture.id) ? "select-row selected" : "select-row"}>
              <input type="checkbox" checked={selectedCaptureIds.includes(capture.id)} onChange={() => toggleCapture(capture.id)} />
              <div>
                <strong>{capture.title}</strong>
                <span>{sourceLabel(capture.sourceKind)}</span>
              </div>
            </label>
          ))}
        </aside>

        <main className="panel overflow-panel">
          <div className="section-title">Suggested Topics</div>
          {groups.map((group) => (
            <button
              key={group.name}
              className={selectedGroupName === group.name ? "suggested-topic active" : "suggested-topic"}
              onClick={() => {
                setSelectedGroupName(group.name);
                setTopicName(group.name);
                setSelectedCaptureIds(group.captures.map((capture) => capture.id));
              }}
            >
              <div>
                <h3>{group.name}</h3>
                <p>{group.summary}</p>
              </div>
              <div className="meta-row">
                <span>{group.captures.length} captures</span>
                <span>{group.practiceGoal}</span>
              </div>
            </button>
          ))}
          {!groups.length && <EmptyState title="Nothing to organize" body="Inbox captures with AI topics will show up here." />}
        </main>

        <aside className="panel topic-editor">
          <div className="section-title">Topic Editor</div>
          <label>
            Topic name
            <input value={topicName} onChange={(event) => setTopicName(event.target.value)} />
          </label>
          <div>
            <h3>Included captures</h3>
            <div className="mini-list">
              {selectedCaptureIds.map((id) => (
                <span key={id}>{captures.find((capture) => capture.id === id)?.title ?? id}</span>
              ))}
            </div>
          </div>
          {!!topics.length && (
            <label>
              Merge with another topic
              <select
                onChange={(event) => {
                  const topic = topics.find((item) => item.id === event.target.value);
                  if (topic) addCapturesToTopic(selectedCaptureIds, topic);
                }}
                defaultValue=""
              >
                <option value="" disabled>
                  Choose topic
                </option>
                {topics.map((topic) => (
                  <option key={topic.id} value={topic.id}>
                    {topic.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button className="primary" onClick={() => createTopicFromCaptures(selectedCaptureIds, topicName)}>
            Confirm Topic
          </button>
          <button className="secondary" onClick={() => setSelectedCaptureIds([])}>
            Discard suggestion
          </button>
        </aside>
      </div>
    </section>
  );
}

function TopicsPage({
  topics,
  captures,
  expressions,
  openTopic,
  startPractice
}: {
  topics: TopicItem[];
  captures: CaptureItem[];
  expressions: ExpressionRecord[];
  openTopic: (topic: TopicItem, next?: Screen) => void;
  startPractice: (topic: TopicItem) => void;
}) {
  const [selectedTopicId, setSelectedTopicId] = useState(topics[0]?.id ?? "");
  const selectedTopic = topics.find((topic) => topic.id === selectedTopicId) ?? topics[0];
  const sources = topicCaptures(selectedTopic, captures);
  const savedExpressions = topicExpressions(selectedTopic, expressions);

  useEffect(() => {
    if (!selectedTopicId && topics[0]) setSelectedTopicId(topics[0].id);
  }, [selectedTopicId, topics]);

  return (
    <section className="page">
      <AppHeader title="Topics" description="Choose a topic, inspect sources, then study or practice." />
      <div className="topics-layout">
        <main className="topic-list">
          {topics.length ? (
            topics.map((topic) => (
              <button
                key={topic.id}
                className={selectedTopic?.id === topic.id ? "topic-list-card active" : "topic-list-card"}
                onClick={() => setSelectedTopicId(topic.id)}
              >
                <div>
                  <h3>{topic.name}</h3>
                  <p>{topic.summary}</p>
                </div>
                <div className="meta-row">
                  <span>{topic.captureIds.length} sources</span>
                  <span>{topic.savedExpressionCount} saved</span>
                  <span>{formatDate(topic.updatedAt)}</span>
                  <span className="status-pill">{topicStatusLabels[topic.status]}</span>
                </div>
              </button>
            ))
          ) : (
            <EmptyState title="No topics yet" body="Open Inbox and use Organize with Bu to create your first topic." />
          )}
        </main>
        <aside className="topic-detail-panel">
          {selectedTopic ? (
            <>
              <p className="eyebrow">Topic Detail</p>
              <h2>{selectedTopic.name}</h2>
              <p>{selectedTopic.summary}</p>
              <div className="stats-grid two">
                <div>
                  <span>Sources</span>
                  <strong>{sources.length}</strong>
                </div>
                <div>
                  <span>Useful Expressions</span>
                  <strong>{savedExpressions.length}</strong>
                </div>
              </div>
              <div>
                <h3>Sources Preview</h3>
                <div className="mini-list">
                  {sources.slice(0, 5).map((capture) => (
                    <span key={capture.id}>{capture.title}</span>
                  ))}
                </div>
              </div>
              <div>
                <h3>Recent Practice</h3>
                <p>{selectedTopic.lastPracticedAt ? formatDate(selectedTopic.lastPracticedAt) : "No practice yet."}</p>
              </div>
              <div className="stack-actions">
                <button className="primary" onClick={() => openTopic(selectedTopic, "study-room")}>
                  Open Study Room
                </button>
                <button className="secondary" onClick={() => startPractice(selectedTopic)}>
                  Start Practice
                </button>
                <button className="secondary" onClick={() => openTopic(selectedTopic)}>
                  Edit Topic
                </button>
              </div>
            </>
          ) : (
            <EmptyState title="Select a topic" body="Topic details will show sources, overview, and practice actions." />
          )}
        </aside>
      </div>
    </section>
  );
}

function TopicDetailPage({
  topic,
  captures,
  expressions,
  updateTopic,
  openStudyRoom,
  startPractice,
  back
}: {
  topic: TopicItem;
  captures: CaptureItem[];
  expressions: ExpressionRecord[];
  updateTopic: (topic: TopicItem) => void;
  openStudyRoom: () => void;
  startPractice: () => void;
  back: () => void;
}) {
  const [name, setName] = useState(topic.name);
  const [summary, setSummary] = useState(topic.summary);

  useEffect(() => {
    setName(topic.name);
    setSummary(topic.summary);
  }, [topic.id, topic.name, topic.summary]);

  return (
    <section className="page">
      <AppHeader title={topic.name} description="Topic Detail">
        <button className="secondary" onClick={back}>
          <ChevronLeft size={18} /> Back to Topics
        </button>
        <button className="secondary" onClick={() => updateTopic({ ...topic, name, summary, updatedAt: nowIso() })}>
          <Save size={18} /> Save
        </button>
        <button className="primary" onClick={openStudyRoom}>
          Open Study Room
        </button>
      </AppHeader>

      <section className="panel topic-hero">
        <div className="form-grid">
          <label>
            Topic name
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            Topic description
            <input value={summary} onChange={(event) => setSummary(event.target.value)} />
          </label>
        </div>
        <div className="meta-row">
          {topic.tags.map((tag) => (
            <span className="tag" key={tag}>{tag}</span>
          ))}
          <span>{captures.length} sources</span>
          <span>{expressions.length} saved expressions</span>
          <span>{topic.lastPracticedAt ? `Last practiced ${formatDate(topic.lastPracticedAt)}` : "Not practiced yet"}</span>
        </div>
      </section>

      <div className="two-column">
        <section className="panel">
          <div className="section-title">Sources</div>
          {captures.map((capture) => (
            <label className="source-row" key={capture.id}>
              <input type="checkbox" defaultChecked />
              <div>
                <strong>{capture.title}</strong>
                <span>{sourceLabel(capture.sourceKind)} · {capture.summary}</span>
              </div>
            </label>
          ))}
        </section>
        <section className="panel">
          <div className="section-title">Learning Overview</div>
          <h3>Key ideas</h3>
          <div className="mini-list">
            {captures.flatMap((capture) => capture.questions ?? []).slice(0, 4).map((question) => (
              <span key={question}>{question}</span>
            ))}
          </div>
          <h3>Recommended expressions</h3>
          <div className="mini-list">
            {captures.flatMap((capture) => capture.suggestedExpressions ?? []).slice(0, 5).map((expression) => (
              <span key={expression}>{expression}</span>
            ))}
          </div>
          <h3>Practice goals</h3>
          <p>{topic.practiceGoal}</p>
          <div className="button-row">
            <button className="primary" onClick={openStudyRoom}>
              Open Study Room
            </button>
            <button className="secondary" onClick={startPractice}>
              Start Practice
            </button>
          </div>
        </section>
      </div>
    </section>
  );
}

function StudyRoomPage({
  topic,
  captures,
  expressions,
  activeCapture,
  setActiveCapture,
  saveExpression,
  startPractice,
  back,
  screenshotQuestionInput,
  setScreenshotQuestionInput,
  askAboutScreenshot,
  screenshotQuestionBusy
}: {
  topic: TopicItem;
  captures: CaptureItem[];
  expressions: ExpressionRecord[];
  activeCapture?: CaptureItem;
  setActiveCapture: (capture: CaptureItem) => void;
  saveExpression: (capture: CaptureItem, expression: string) => void;
  startPractice: () => void;
  back: () => void;
  screenshotQuestionInput: string;
  setScreenshotQuestionInput: (value: string) => void;
  askAboutScreenshot: (capture: CaptureItem, question: string) => void;
  screenshotQuestionBusy: boolean;
}) {
  const current = activeCapture && captures.some((capture) => capture.id === activeCapture.id) ? activeCapture : captures[0];
  const usefulExpressions = current?.suggestedExpressions ?? [];

  return (
    <section className="page">
      <AppHeader title={topic.name} description="Study Room">
        <button className="secondary" onClick={back}>
          <ChevronLeft size={18} /> Topic
        </button>
        <button className="primary" onClick={startPractice}>
          Start Practice
        </button>
      </AppHeader>

      <div className="study-layout">
        <aside className="source-nav">
          <div className="section-title">Source Navigator</div>
          {captures.map((capture) => (
            <button key={capture.id} className={current?.id === capture.id ? "source-nav-row active" : "source-nav-row"} onClick={() => setActiveCapture(capture)}>
              <strong>{capture.title}</strong>
              <span>{sourceLabel(capture.sourceKind)} · {captureStatusLabels[normalizeStatus(capture.status)]}</span>
            </button>
          ))}
        </aside>

        <main className="study-main">
          {current ? (
            <>
              <section className="panel">
                <p className="eyebrow">Original Source</p>
                <h2>{current.title}</h2>
                {current.screenshot && (
                  <img className="screenshot-preview-image" src={current.screenshot.imageDataUrl} alt="Captured screenshot preview" />
                )}
                <div className="source-preview tall">
                  {current.fragments.map((fragment) => (
                    <p key={fragment.id}>{fragment.text}</p>
                  ))}
                </div>
              </section>
              <section className="panel">
                <div className="section-title">AI Summary</div>
                <p>{current.summary || topic.summary}</p>
                <h3>Plain explanation</h3>
                <p>{current.summary || "TinyBu will explain this source after capture understanding finishes."}</p>
                <h3>Key ideas</h3>
                <div className="mini-list">
                  {(current.questions ?? []).slice(0, 5).map((question) => (
                    <span key={question}>{question}</span>
                  ))}
                </div>
              </section>
              {current.screenshot && (
                <section className="panel">
                  <div className="section-title">Ask this screenshot</div>
                  <form
                    className="inline-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      askAboutScreenshot(current, screenshotQuestionInput);
                    }}
                  >
                    <input
                      value={screenshotQuestionInput}
                      onChange={(event) => setScreenshotQuestionInput(event.target.value)}
                      placeholder="Ask about this screenshot..."
                      disabled={screenshotQuestionBusy}
                    />
                    <button className="primary" disabled={!screenshotQuestionInput.trim() || screenshotQuestionBusy}>
                      Ask
                    </button>
                  </form>
                  <div className="mini-list">
                    {(current.screenshot.questionAnswers ?? []).map((item) => (
                      <span key={item.id}>{item.answer}</span>
                    ))}
                  </div>
                </section>
              )}
            </>
          ) : (
            <EmptyState title="No source selected" body="This topic does not have sources yet." />
          )}
        </main>

        <aside className="expression-panel">
          <div className="section-title">Useful Expressions</div>
          {current && usefulExpressions.length ? (
            usefulExpressions.map((expression) => (
              <article className="expression-card" key={expression}>
                <h3>{expression}</h3>
                <p>{current.summary || "Useful expression from this source."}</p>
                <span>When to use: {topic.practiceGoal}</span>
                <button className="secondary" onClick={() => saveExpression(current, expression)}>
                  Save to Notebook
                </button>
              </article>
            ))
          ) : (
            <p>Useful expressions will appear from captured content or Practice Review.</p>
          )}
          {!!expressions.length && (
            <>
              <h3>Saved in this Topic</h3>
              <div className="mini-list">
                {expressions.slice(0, 4).map((expression) => (
                  <span key={expression.id}>{expression.pattern}</span>
                ))}
              </div>
            </>
          )}
          <button className="primary sticky-action" onClick={startPractice}>
            Start Practice
          </button>
        </aside>
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

function NotebookPage({
  expressions,
  updateExpression,
  deleteExpression
}: {
  expressions: ExpressionRecord[];
  updateExpression: (record: ExpressionRecord) => void;
  deleteExpression: (id: string) => void;
}) {
  const [filter, setFilter] = useState<"all" | "topic" | "recent" | "review">("all");
  const [selectedId, setSelectedId] = useState(expressions[0]?.id ?? "");
  const visible = expressions.filter((expression) => {
    if (filter === "recent") return expression.saved;
    if (filter === "review") return expression.useLater || expression.category === "need-practice";
    return true;
  });
  const selected = expressions.find((expression) => expression.id === selectedId) ?? visible[0];

  useEffect(() => {
    if (!selectedId && expressions[0]) setSelectedId(expressions[0].id);
  }, [expressions, selectedId]);

  return (
    <section className="page">
      <AppHeader title="Notebook" description="Saved expressions worth taking with you." />
      <div className="notebook-layout">
        <aside className="filter-panel">
          {[
            ["all", "All Expressions"],
            ["topic", "By Topic"],
            ["recent", "Recently Saved"],
            ["review", "Review Later"]
          ].map(([value, label]) => (
            <button key={value} className={filter === value ? "filter active" : "filter"} onClick={() => setFilter(value as typeof filter)}>
              {label}
            </button>
          ))}
        </aside>
        <main className="expression-list">
          {visible.length ? (
            visible.map((expression) => (
              <button
                key={expression.id}
                className={selected?.id === expression.id ? "expression-row active" : "expression-row"}
                onClick={() => setSelectedId(expression.id)}
              >
                <strong>{expression.pattern}</strong>
                <span>{expression.meaning}</span>
                <div className="meta-row">
                  <span>{expression.sourceTitle}</span>
                  <span>{formatDate(expression.capturedAt)}</span>
                  <span>{expression.learned ? "Learned" : expression.useLater ? "Review Later" : "Saved"}</span>
                </div>
              </button>
            ))
          ) : (
            <EmptyState title="Notebook is empty" body="Save expressions from Study Room or Practice Review." />
          )}
        </main>
        <aside className="detail-panel">
          {selected ? (
            <>
              <p className="eyebrow">Expression Detail</p>
              <h2>{selected.pattern}</h2>
              <p>{selected.meaning}</p>
              <div className="detail-stack">
                <div>
                  <span>When to use</span>
                  <strong>{selected.scene}</strong>
                </div>
                <div>
                  <span>Example sentence</span>
                  <strong>{selected.original}</strong>
                </div>
                <div>
                  <span>Source</span>
                  <strong>{selected.sourceTitle}</strong>
                </div>
                <label>
                  User&apos;s own version
                  <textarea value={selected.userSentence} onChange={(event) => updateExpression({ ...selected, userSentence: event.target.value })} />
                </label>
              </div>
              <div className="stack-actions">
                <button className="secondary" onClick={() => updateExpression({ ...selected, useLater: !selected.useLater })}>
                  Mark review
                </button>
                <button className="secondary" onClick={() => updateExpression({ ...selected, learned: true })}>
                  Mark learned
                </button>
                <button className="danger" onClick={() => deleteExpression(selected.id)}>
                  Delete
                </button>
              </div>
            </>
          ) : (
            <EmptyState title="Select an expression" body="Expression details and editing controls appear here." />
          )}
        </aside>
      </div>
    </section>
  );
}

function MemoryPage({
  memories,
  topics,
  expressions,
  updateMemoryItem,
  deleteMemory
}: {
  memories: MemoryItem[];
  topics: TopicItem[];
  expressions: ExpressionRecord[];
  updateMemoryItem: (item: MemoryItem) => void;
  deleteMemory: (id: string) => void;
}) {
  const interests = memories.filter((memory) => memory.type === "interest");
  const stuck = memories.filter((memory) => memory.type === "support" || memory.type === "anxiety");
  const next = memories.filter((memory) => memory.type === "next");
  const opinionExpressions = expressions.filter((expression) => /think|opinion|reason|compare|request/i.test(expression.pattern));

  return (
    <section className="page">
      <AppHeader title="Bu’s Memory" description="A warm learning profile that remembers interests, patterns, and next steps." />
      <section className="panel memory-summary">
        <div>
          <span>Topics you practice</span>
          <strong>{topics.slice(0, 3).map((topic) => topic.name).join(", ") || "Not enough data yet"}</strong>
        </div>
        <div>
          <span>Current interests</span>
          <strong>{interests[0]?.title || topics[0]?.name || "Fresh captures"}</strong>
        </div>
        <div>
          <span>Common stuck points</span>
          <strong>{stuck[0]?.title || "Giving longer reasons"}</strong>
        </div>
        <div>
          <span>Recent progress</span>
          <strong>{expressions.length} expressions saved</strong>
        </div>
      </section>
      <div className="memory-grid">
        <section className="panel">
          <div className="section-title">Topics You Care About</div>
          <div className="mini-list">
            {topics.slice(0, 8).map((topic) => (
              <span key={topic.id}>{topic.name}</span>
            ))}
          </div>
        </section>
        <section className="panel">
          <div className="section-title">Expressions You&apos;re Building</div>
          <div className="mini-list">
            {(opinionExpressions.length ? opinionExpressions : expressions).slice(0, 8).map((expression) => (
              <span key={expression.id}>{expression.pattern}</span>
            ))}
          </div>
        </section>
        <section className="panel">
          <div className="section-title">Bu&apos;s Suggestions</div>
          <div className="mini-list">
            {(next.length ? next : memories).slice(0, 6).map((memory) => (
              <span key={memory.id}>{memory.title}</span>
            ))}
            {!memories.length && (
              <>
                <span>Continue Topic: {topics[0]?.name || "First Topic"}</span>
                <span>Review expressions from yesterday</span>
                <span>Practice giving longer reasons</span>
              </>
            )}
          </div>
        </section>
      </div>
      {!!memories.length && (
        <section className="panel">
          <div className="section-title">Editable Memory Notes</div>
          <div className="memory-note-list">
            {memories.map((memory) => (
              <article className="memory-note" key={memory.id}>
                <input value={memory.title} onChange={(event) => updateMemoryItem({ ...memory, title: event.target.value, updatedAt: nowIso() })} />
                <textarea value={memory.body} onChange={(event) => updateMemoryItem({ ...memory, body: event.target.value, updatedAt: nowIso() })} />
                <button className="danger" onClick={() => deleteMemory(memory.id)}>
                  Delete
                </button>
              </article>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}

function SettingsPage({
  appState,
  apiKeyDraft,
  apiKeyStatus,
  setApiKeyDraft,
  saveSettings,
  checkUserKey,
  clearUserKey,
  clearMemory,
  clearAllData,
  resetOnboarding
}: {
  appState: AppStateRecord;
  apiKeyDraft: string;
  apiKeyStatus: string;
  setApiKeyDraft: (value: string) => void;
  saveSettings: (state: AppStateRecord, key?: string) => void;
  checkUserKey: () => void;
  clearUserKey: () => void;
  clearMemory: () => void;
  clearAllData: () => void;
  resetOnboarding: () => void;
}) {
  const [draft, setDraft] = useState(appState);

  useEffect(() => setDraft(appState), [appState]);

  return (
    <section className="page">
      <AppHeader title="Settings" description="Language, AI, data, and desktop connection settings." />
      <div className="settings-grid">
        <section className="panel">
          <h2>Language</h2>
          <label>
            Source language
            <select value={draft.profile.nativeLanguage} onChange={(event) => setDraft({ ...draft, profile: { ...draft.profile, nativeLanguage: event.target.value } })}>
              {languageOptions.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            Target language
            <select value={draft.profile.targetLanguage} onChange={(event) => setDraft({ ...draft, profile: { ...draft.profile, targetLanguage: event.target.value } })}>
              {targetLanguageOptions.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            Support strength
            <select
              value={draft.settings.supportStrength}
              onChange={(event) =>
                setDraft({ ...draft, settings: { ...draft.settings, supportStrength: event.target.value as AppStateRecord["settings"]["supportStrength"] } })
              }
            >
              <option>Gentle</option>
              <option>Balanced</option>
              <option>Direct</option>
            </select>
          </label>
        </section>
        <section className="panel">
          <h2>API settings</h2>
          <label>
            Provider mode
            <select
              value={draft.settings.aiProviderMode}
              onChange={(event) =>
                setDraft({ ...draft, settings: { ...draft.settings, aiProviderMode: event.target.value as AppStateRecord["settings"]["aiProviderMode"] } })
              }
            >
              <option value="rules">Rules fallback</option>
              <option value="user-key">User API key</option>
              <option value="cloud-proxy">Cloud proxy</option>
            </select>
          </label>
          <label>
            Chat / learning model
            <input value={draft.settings.aiModel} onChange={(event) => setDraft({ ...draft, settings: { ...draft.settings, aiModel: event.target.value } })} />
          </label>
          <label>
            Screenshot / vision model
            <input value={draft.settings.visionModel} onChange={(event) => setDraft({ ...draft, settings: { ...draft.settings, visionModel: event.target.value } })} />
          </label>
          <label>
            OpenRouter base URL
            <input value={draft.settings.openRouterBaseUrl} onChange={(event) => setDraft({ ...draft, settings: { ...draft.settings, openRouterBaseUrl: event.target.value } })} />
          </label>
          <label>
            Cloud proxy URL
            <input value={draft.settings.cloudProxyUrl} onChange={(event) => setDraft({ ...draft, settings: { ...draft.settings, cloudProxyUrl: event.target.value } })} />
          </label>
          <label>
            API key
            <input type="password" value={apiKeyDraft} onChange={(event) => setApiKeyDraft(event.target.value)} placeholder={draft.settings.apiKeySaved ? "Saved" : "Paste key"} />
          </label>
          {apiKeyStatus && <p className="settings-note">{apiKeyStatus}</p>}
          <div className="button-row">
            <button className="secondary" onClick={checkUserKey}>
              Check saved key
            </button>
            <button className="secondary" onClick={clearUserKey}>
              Clear saved key
            </button>
          </div>
        </section>
        <section className="panel">
          <h2>Data / local storage</h2>
          <button className="secondary" onClick={clearMemory}>
            Clear Bu&apos;s Memory
          </button>
          <button className="danger" onClick={clearAllData}>
            Clear learning data
          </button>
          <button className="secondary" onClick={resetOnboarding}>
            Reset onboarding
          </button>
        </section>
        <section className="panel">
          <h2>Desktop / extension</h2>
          <p>Desktop capture and browser extension captures land in Inbox automatically.</p>
          <label className="check-row">
            <input
              type="checkbox"
              checked={draft.settings.screenshotRecognitionEnabled}
              onChange={(event) =>
                setDraft({ ...draft, settings: { ...draft.settings, screenshotRecognitionEnabled: event.target.checked } })
              }
            />
            Enable screenshot recognition
          </label>
        </section>
      </div>
      <div className="bottom-actions">
        <button className="primary" onClick={() => saveSettings(draft, apiKeyDraft)}>
          Save Settings
        </button>
      </div>
    </section>
  );
}
