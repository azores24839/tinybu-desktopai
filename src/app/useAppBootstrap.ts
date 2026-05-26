import { useEffect } from "react";
import { db, loadAppState, saveAppState } from "../lib/db";
import { defaultAppState, nowIso } from "../lib/defaults";
import type { AppStateRecord, CaptureItem, ExpressionRecord, ExternalCapturePayload, MemoryItem, Screen, TopicItem } from "../types";

const CAPTURE_QUERY_PARAM = "tinybuCapture";

type CreateCaptureRecord = (args: {
  title: string;
  sourceUrl: string;
  sourceKind: ExternalCapturePayload["kind"];
  text: string;
  capturedAt?: string;
  appState: AppStateRecord;
  screenshot?: CaptureItem["screenshot"];
}) => Promise<CaptureItem>;

type UseAppBootstrapArgs = {
  createCaptureRecord: CreateCaptureRecord;
  setAppState: (state: AppStateRecord) => void;
  setCaptures: (captures: CaptureItem[]) => void;
  setTopics: (topics: TopicItem[]) => void;
  setExpressions: (expressions: ExpressionRecord[]) => void;
  setMemories: (memories: MemoryItem[]) => void;
  setHomePasteDraft: (draft: string) => void;
  setScreen: (screen: Screen) => void;
};

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

export function useAppBootstrap({
  createCaptureRecord,
  setAppState,
  setCaptures,
  setTopics,
  setExpressions,
  setMemories,
  setHomePasteDraft,
  setScreen
}: UseAppBootstrapArgs) {
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
}
