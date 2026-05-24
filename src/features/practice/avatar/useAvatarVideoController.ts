import { useCallback, useEffect, useRef, useState } from "react";
import type { CallBuState } from "../useCallBu";
import { baselineMoodForCallState, classifySpeechMood, type AvatarVideoMood } from "./avatarVideos";

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
  const [currentMood, setCurrentMood] = useState<AvatarVideoMood>("idle");
  const currentMoodRef = useRef<AvatarVideoMood>("idle");
  const pendingMoodRef = useRef<AvatarVideoMood | null>(null);
  const baselineRef = useRef<AvatarVideoMood>("idle");
  const lastSpeechCueRef = useRef("");
  const useAltTalkingRef = useRef(false);
  const yawnTimerRef = useRef<number>(0);

  const setMood = useCallback((mood: AvatarVideoMood) => {
    currentMoodRef.current = mood;
    setCurrentMood(mood);
  }, []);

  const requestMood = useCallback((mood: AvatarVideoMood) => {
    if (mood === currentMoodRef.current) return;
    if (currentMoodRef.current === "idle") {
      setMood(mood);
      return;
    }

    pendingMoodRef.current = mood;
  }, [setMood]);

  useEffect(() => {
    const nextBaseline = baselineMoodForCallState(callState);
    baselineRef.current = nextBaseline;

    if (callState === "speaking") {
      const speechCue = buText.trim();
      if (speechCue && (!lastSpeechCueRef.current || lastSpeechCueRef.current === "__speaking__")) {
        lastSpeechCueRef.current = speechCue;
        useAltTalkingRef.current = !useAltTalkingRef.current;
        requestMood(classifySpeechMood(speechCue, useAltTalkingRef.current));
      } else if (!speechCue && lastSpeechCueRef.current !== "__speaking__") {
        lastSpeechCueRef.current = "__speaking__";
        useAltTalkingRef.current = !useAltTalkingRef.current;
        requestMood(useAltTalkingRef.current ? "talkingAlt" : "talking");
      }
      return;
    }

    if (callState === "listening" || callState === "idle" || callState === "ended" || callState === "error") {
      lastSpeechCueRef.current = "";
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

  const handleVideoEnded = useCallback(() => {
    const nextMood = pendingMoodRef.current;
    if (nextMood) {
      pendingMoodRef.current = null;
      setMood(nextMood);
      return true;
    }

    if (currentMoodRef.current !== baselineRef.current) {
      setMood(baselineRef.current);
      return true;
    }

    return false;
  }, [setMood]);

  return { currentMood, handleVideoEnded };
}
