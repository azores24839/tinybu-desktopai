import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { understandContent, recommendFragments } from "../../ai/provider";
import { db } from "../../lib/db";
import { nowIso, uid } from "../../lib/defaults";
import { showToast } from "../../lib/toast";
import type { AppStateRecord, CaptureFragment, CaptureItem, ExternalCaptureKind } from "../../types";
import { splitCaptureText } from "../captures/captureUtils";

type UseCapturesArgs = {
  appState: AppStateRecord;
  persistState: (nextState: AppStateRecord) => Promise<void>;
};

type UseCapturesResult = {
  captures: CaptureItem[];
  setCaptures: Dispatch<SetStateAction<CaptureItem[]>>;
  createCaptureRecord: (args: {
    title: string;
    sourceUrl: string;
    sourceKind: ExternalCaptureKind;
    text: string;
    capturedAt?: string;
    appState: AppStateRecord;
    screenshot?: CaptureItem["screenshot"];
  }) => Promise<CaptureItem>;
  updateCapture: (capture: CaptureItem) => Promise<void>;
  openCapture: (capture: CaptureItem) => Promise<void>;
  archiveCapture: (capture: CaptureItem) => Promise<void>;
  deleteCapture: (id: string) => Promise<void>;
};

export function useCaptures({ appState, persistState }: UseCapturesArgs): UseCapturesResult {
  const [captures, setCaptures] = useState<CaptureItem[]>([]);

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
      try {
        const recommendation = await recommendFragments(fragments, args.appState);
        const recommendedIds = new Set(recommendation.recommendedFragmentIds.slice(0, 6));
        fragments = fragments.map((fragment) => ({
          ...fragment,
          selected: recommendedIds.has(fragment.id),
          recommended: recommendedIds.has(fragment.id)
        }));
      } catch (error) {
        console.warn("recommendFragments failed, using short-content mode fallback", error);
      }
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

  async function updateCapture(nextCapture: CaptureItem) {
    try {
      await db.captures.put(nextCapture);
      setCaptures((items) => items.map((item) => (item.id === nextCapture.id ? nextCapture : item)));
    } catch (error) {
      console.error("updateCapture failed", error);
      showToast("Failed to update capture. Please try again.");
    }
  }

  async function openCapture(capture: CaptureItem) {
    await persistState({ ...appState, activeCaptureId: capture.id });
  }

  async function archiveCapture(capture: CaptureItem) {
    await updateCapture({ ...capture, status: "archived" });
  }

  async function deleteCapture(id: string) {
    try {
      await db.captures.delete(id);
      setCaptures((items) => items.filter((item) => item.id !== id));
    } catch (error) {
      console.error("deleteCapture failed", error);
      showToast("Failed to delete capture. Please try again.");
    }
  }

  return { captures, setCaptures, createCaptureRecord, updateCapture, openCapture, archiveCapture, deleteCapture };
}
