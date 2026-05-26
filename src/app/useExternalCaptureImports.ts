import { useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import { db } from "../lib/db";
import { nowIso } from "../lib/defaults";
import { invokeTauri, listenTauri, type CaptureBridgeState } from "../lib/tauriBridge";
import type {
  AppStateRecord,
  CaptureItem,
  ExternalCapturePayload,
  Screen,
  ScreenshotCapturePayload
} from "../types";

const CAPTURE_MESSAGE_TYPE = "TINYBU_CAPTURE";

type CreateCaptureRecord = (args: {
  title: string;
  sourceUrl: string;
  sourceKind: ExternalCapturePayload["kind"];
  text: string;
  capturedAt?: string;
  appState: AppStateRecord;
  screenshot?: CaptureItem["screenshot"];
}) => Promise<CaptureItem>;

type UseExternalCaptureImportsArgs = {
  appState: AppStateRecord;
  appStateRef: { current: AppStateRecord };
  createCaptureRecord: CreateCaptureRecord;
  setCaptures: Dispatch<SetStateAction<CaptureItem[]>>;
  persistState: (nextState: AppStateRecord) => Promise<void>;
  navigate: (next: Screen) => void;
  setBusyLabel: (label: string) => void;
  importScreenshotCapture: (payload: ScreenshotCapturePayload) => Promise<void>;
};

export function useExternalCaptureImports({
  appState,
  appStateRef,
  createCaptureRecord,
  setCaptures,
  persistState,
  navigate,
  setBusyLabel,
  importScreenshotCapture
}: UseExternalCaptureImportsArgs) {
  const lastExternalCaptureSignature = useRef("");
  const bridgeImportingRef = useRef(false);
  const initialBridgeDrainRef = useRef(false);

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
        navigate("home");
      }
    } finally {
      setBusyLabel("");
      bridgeImportingRef.current = false;
    }
  }

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
      navigate("home");
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
}
