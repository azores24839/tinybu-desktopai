import { useEffect, useRef, useState } from "react";
import type { CallBuState } from "../useCallBu";
import { avatarVideoSources, type AvatarVideoMood } from "./avatarVideos";
import {
  createAvatarPlaybackState,
  reduceAvatarPlayback,
  type AvatarPlaybackEvent,
  type AvatarPlaybackState
} from "./avatarPlaybackState";
import { useAvatarVideoController } from "./useAvatarVideoController";

type SlotMetadata = {
  generation: number;
  mood: AvatarVideoMood | null;
  ready: boolean;
};

export function AvatarVideoPlayer({
  callState,
  buText,
  userText
}: {
  callState: CallBuState;
  buText: string;
  userText: string;
}) {
  const videoRefs = useRef<Array<HTMLVideoElement | null>>([null, null]);
  const slotMetadataRef = useRef<[SlotMetadata, SlotMetadata]>([
    { generation: 0, mood: "idle", ready: false },
    { generation: 0, mood: null, ready: false }
  ]);
  const playbackRef = useRef<AvatarPlaybackState>(createAvatarPlaybackState());
  const [playback, setPlayback] = useState<AvatarPlaybackState>(playbackRef.current);
  const activeSlotRef = useRef(0);
  const [visibleSlot, setVisibleSlot] = useState(0);
  const loadGenerationRef = useRef(0);
  const transitionGenerationRef = useRef(0);
  const startingLoadRef = useRef(0);
  const mountedRef = useRef(false);
  const { moodRequest } = useAvatarVideoController({ callState, buText, userText });

  function applyPlaybackEvent(event: AvatarPlaybackEvent) {
    const current = playbackRef.current;
    const next = reduceAvatarPlayback(current, event);
    if (next !== current) {
      playbackRef.current = next;
      setPlayback(next);
    }
    return next;
  }

  function isCurrentLoad(slot: number, generation: number, mood: AvatarVideoMood) {
    const metadata = slotMetadataRef.current[slot];
    const video = videoRefs.current[slot];
    const currentSource = video?.currentSrc || video?.src || "";
    return metadata.generation === generation
      && metadata.mood === mood
      && currentSource.endsWith(avatarVideoSources[mood]);
  }

  function handleLoadFailure(slot: number, generation: number, mood: AvatarVideoMood) {
    if (!mountedRef.current || !isCurrentLoad(slot, generation, mood)) return;
    if (startingLoadRef.current === generation) startingLoadRef.current = 0;
    transitionGenerationRef.current += 1;
    const next = applyPlaybackEvent({ type: "load-failed", mood });
    if (next.phase === "waiting-for-frame" && next.lockedMood === "idle" && mood !== "idle") {
      prepareStandby("idle");
    }
  }

  function promoteStandby(slot: number, generation: number, mood: AvatarVideoMood, transition: number) {
    if (!mountedRef.current || transition !== transitionGenerationRef.current) return;
    if (!isCurrentLoad(slot, generation, mood)) return;
    const current = playbackRef.current;
    if (current.phase !== "waiting-for-frame" || current.lockedMood !== mood) return;

    activeSlotRef.current = slot;
    startingLoadRef.current = 0;
    setVisibleSlot(slot);
    const next = applyPlaybackEvent({ type: "promoted", mood });
    if (next.pendingMood && next.pendingMood !== mood) prepareStandby(next.pendingMood);
  }

  function startPreparedStandby(slot: number, generation: number, mood: AvatarVideoMood) {
    if (!mountedRef.current || startingLoadRef.current === generation) return;
    if (!isCurrentLoad(slot, generation, mood)) return;
    const current = playbackRef.current;
    if (current.phase !== "waiting-for-frame" || current.lockedMood !== mood) return;

    const video = videoRefs.current[slot];
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    startingLoadRef.current = generation;
    const transition = ++transitionGenerationRef.current;
    video.currentTime = 0;

    void video.play().then(() => {
      if (!mountedRef.current || transition !== transitionGenerationRef.current) return;
      if (typeof video.requestVideoFrameCallback === "function") {
        video.requestVideoFrameCallback(() => promoteStandby(slot, generation, mood, transition));
        return;
      }
      window.requestAnimationFrame(() => promoteStandby(slot, generation, mood, transition));
    }).catch(() => handleLoadFailure(slot, generation, mood));
  }

  function prepareStandby(mood: AvatarVideoMood) {
    const slot = activeSlotRef.current === 0 ? 1 : 0;
    const video = videoRefs.current[slot];
    if (!video) return;

    const existing = slotMetadataRef.current[slot];
    if (existing.mood === mood) {
      if (existing.ready && playbackRef.current.phase === "waiting-for-frame") {
        startPreparedStandby(slot, existing.generation, mood);
      }
      return;
    }

    transitionGenerationRef.current += 1;
    startingLoadRef.current = 0;
    const generation = ++loadGenerationRef.current;
    slotMetadataRef.current[slot] = { generation, mood, ready: false };
    video.pause();
    video.src = avatarVideoSources[mood];
    video.load();
  }

  function handleLoadedData(slot: number) {
    const metadata = slotMetadataRef.current[slot];
    if (!metadata.mood || !isCurrentLoad(slot, metadata.generation, metadata.mood)) return;
    metadata.ready = true;
    if (slot === activeSlotRef.current) return;
    startPreparedStandby(slot, metadata.generation, metadata.mood);
  }

  function handleVideoError(slot: number) {
    const metadata = slotMetadataRef.current[slot];
    if (!metadata.mood || slot === activeSlotRef.current) return;
    handleLoadFailure(slot, metadata.generation, metadata.mood);
  }

  function handleVideoEnded(slot: number) {
    if (slot !== activeSlotRef.current || playbackRef.current.phase !== "playing") return;
    const next = applyPlaybackEvent({ type: "ended" });
    const activeVideo = videoRefs.current[slot];

    if (next.phase === "playing") {
      if (!activeVideo) return;
      activeVideo.currentTime = 0;
      void activeVideo.play().catch(() => {});
      return;
    }

    if (next.lockedMood) prepareStandby(next.lockedMood);
  }

  useEffect(() => {
    mountedRef.current = true;
    const activeVideo = videoRefs.current[activeSlotRef.current];
    if (activeVideo?.paused) void activeVideo.play().catch(() => {});
    return () => {
      mountedRef.current = false;
      transitionGenerationRef.current += 1;
      startingLoadRef.current = 0;
      videoRefs.current.forEach((video) => video?.pause());
    };
  }, []);

  useEffect(() => {
    if (moodRequest.id === 0) return;
    const next = applyPlaybackEvent({ type: "request", mood: moodRequest.mood });
    if (next.phase === "playing" && next.pendingMood) {
      prepareStandby(next.pendingMood);
    } else if (next.phase === "waiting-for-frame" && next.lockedMood) {
      prepareStandby(next.lockedMood);
    }
  }, [moodRequest.id]);

  return (
    <>
      {[0, 1].map((slot) => (
        <video
          key={slot}
          ref={(video) => { videoRefs.current[slot] = video; }}
          className={`practice-avatar-video ${slot === visibleSlot ? "is-active" : "is-standby"} ${slot === visibleSlot ? playback.activeMood : ""}`}
          src={slot === 0 ? avatarVideoSources.idle : undefined}
          muted
          playsInline
          preload="auto"
          aria-hidden="true"
          onLoadedData={() => handleLoadedData(slot)}
          onEnded={() => handleVideoEnded(slot)}
          onError={() => handleVideoError(slot)}
        />
      ))}
    </>
  );
}
