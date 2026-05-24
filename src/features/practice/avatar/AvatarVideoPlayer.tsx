import { useEffect, useRef } from "react";
import type { CallBuState } from "../useCallBu";
import { avatarVideoSources } from "./avatarVideos";
import { useAvatarVideoController } from "./useAvatarVideoController";

export function AvatarVideoPlayer({
  callState,
  buText,
  userText
}: {
  callState: CallBuState;
  buText: string;
  userText: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const { currentMood, handleVideoEnded } = useAvatarVideoController({ callState, buText, userText });

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = 0;
    void video.play().catch(() => {});
  }, [currentMood]);

  return (
    <video
      ref={videoRef}
      className={`practice-avatar-video ${currentMood}`}
      src={avatarVideoSources[currentMood]}
      autoPlay
      muted
      playsInline
      preload="auto"
      aria-hidden="true"
      onEnded={(event) => {
        const switched = handleVideoEnded();
        if (!switched) {
          event.currentTarget.currentTime = 0;
          void event.currentTarget.play().catch(() => {});
        }
      }}
    />
  );
}
