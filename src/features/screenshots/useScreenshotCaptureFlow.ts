import type { Dispatch, SetStateAction } from "react";
import { answerScreenshotQuestion, recognizeScreenshotCapture } from "../../ai/provider";
import { db } from "../../lib/db";
import { nowIso, uid } from "../../lib/defaults";
import type {
  AppStateRecord,
  CaptureItem,
  ExternalCaptureKind,
  CompanionState,
  Screen,
  ScreenshotCapturePayload
} from "../../types";
import { createScreenshotDiagnosticCapture, createScreenshotPreviewCapture } from "./screenshotCaptureRecords";
import { canConfirmScreenshotText } from "./screenshotUtils";

type CreateCaptureRecord = (args: {
  title: string;
  sourceUrl: string;
  sourceKind: ExternalCaptureKind;
  text: string;
  capturedAt?: string;
  appState: AppStateRecord;
  screenshot?: CaptureItem["screenshot"];
}) => Promise<CaptureItem>;

type ScreenshotCaptureFlowArgs = {
  appState: AppStateRecord;
  screenshotQuestionBusy: boolean;
  createCaptureRecord: CreateCaptureRecord;
  updateCapture: (capture: CaptureItem) => Promise<void>;
  persistState: (nextState: AppStateRecord) => Promise<void>;
  navigate: (next: Screen) => void;
  getCaptureText: (capture: CaptureItem) => string;
  setCaptures: Dispatch<SetStateAction<CaptureItem[]>>;
  setBusyLabel: (label: string) => void;
  setCompanionState: (state: CompanionState) => void;
  setScreenshotQuestionInput: (value: string) => void;
  setScreenshotQuestionBusy: (busy: boolean) => void;
};

export function useScreenshotCaptureFlow({
  appState,
  screenshotQuestionBusy,
  createCaptureRecord,
  updateCapture,
  persistState,
  navigate,
  getCaptureText,
  setCaptures,
  setBusyLabel,
  setCompanionState,
  setScreenshotQuestionInput,
  setScreenshotQuestionBusy
}: ScreenshotCaptureFlowArgs) {
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
    setCompanionState("thinking");
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
      await persistState({
        ...appState,
        onboarded: true,
        companionReady: true,
        activeCaptureId: diagnosticCapture.id
      });
      navigate("inbox");
    } finally {
      setBusyLabel("");
      setCompanionState("idle");
    }
  }

  async function confirmScreenshotText(capture: CaptureItem) {
    if (!canConfirmScreenshotText(capture) || !capture.screenshot) return;
    const { imageDataUrl, ...screenshotWithoutImage } = capture.screenshot;
    await updateCapture({
      ...capture,
      screenshot: screenshotWithoutImage
    });
  }

  async function askAboutScreenshot(capture: CaptureItem, question: string) {
    const text = question.trim();
    if (!text || screenshotQuestionBusy || !capture.screenshot) return;
    setScreenshotQuestionInput("");
    setScreenshotQuestionBusy(true);
    setCompanionState("thinking");
    try {
      const output = await answerScreenshotQuestion({
        question: text,
        screenshot: {
          imageDataUrl: capture.screenshot.imageDataUrl,
          title: capture.title,
          sourceText: getCaptureText(capture),
          summary: capture.summary,
          screenType: capture.screenshot.screenType,
          visibleText: capture.screenshot.visibleText,
          errorMessages: capture.screenshot.errorMessages,
          interactiveElements: capture.screenshot.interactiveElements
        },
        appState
      });
      const answer = {
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
      setCompanionState("encouraging");
    } finally {
      setScreenshotQuestionBusy(false);
    }
  }

  return {
    importScreenshotCapture,
    confirmScreenshotText,
    askAboutScreenshot
  };
}
