import { useCallback, useEffect, useRef, useState } from "react";
import type { CallBuState } from "../useCallBu";
import { classifySpeechMood, type AvatarVideoMood } from "./avatarVideos";

const YAWN_AFTER_MS = 22000;

export function useAvatarVideoController({
  callState,
  buText,
  userText
}: {
  callState: CallBuState;
  buText: string;
  userText: string;
}) {
  const [moodRequest, setMoodRequest] = useState<{ id: number; mood: AvatarVideoMood }>({ id: 0, mood: "idle" });
  const requestIdRef = useRef(0);
  const speechMoodRequestedRef = useRef(false);
  const useAltTalkingRef = useRef(false);
  const yawnTimerRef = useRef<number>(0);

  const requestMood = useCallback((mood: AvatarVideoMood) => {
    requestIdRef.current += 1;
    setMoodRequest({ id: requestIdRef.current, mood });
  }, []);

  useEffect(() => {
    if (callState === "speaking") {
      const speechCue = buText.trim();
      if (!speechCue || speechMoodRequestedRef.current) return;
      speechMoodRequestedRef.current = true;
      useAltTalkingRef.current = !useAltTalkingRef.current;
      requestMood(classifySpeechMood(speechCue, useAltTalkingRef.current));
      return;
    }

    if (callState === "listening" || callState === "idle" || callState === "ended" || callState === "error") {
      speechMoodRequestedRef.current = false;
    }
  }, [buText, callState, requestMood]);

  useEffect(() => {
    window.clearTimeout(yawnTimerRef.current);
    if (callState !== "listening") return;

    yawnTimerRef.current = window.setTimeout(() => {
      requestMood("yawn");
    }, YAWN_AFTER_MS);

    return () => window.clearTimeout(yawnTimerRef.current);
  }, [buText, callState, requestMood, userText]);

  return { moodRequest };
}
