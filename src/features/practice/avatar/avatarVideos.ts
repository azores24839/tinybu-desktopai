import type { CallBuState } from "../useCallBu";

export type AvatarVideoMood =
  | "idle"
  | "talking"
  | "talkingAlt"
  | "excited"
  | "shock"
  | "sad"
  | "yawn";

export const avatarVideoSources: Record<AvatarVideoMood, string> = {
  idle: "/media/avatar-idle.mp4",
  talking: "/media/avatar-talking.mp4",
  talkingAlt: "/media/avatar-talking-alt.mp4",
  excited: "/media/avatar-excited.mp4",
  shock: "/media/avatar-shock.mp4",
  sad: "/media/avatar-sad.mp4",
  yawn: "/media/avatar-yawn.mp4"
};

const shockPattern = /(\bwow\b|\breally\b|\bsurpris|\bunexpected|\bcan't believe\b|真的吗|真的啊|没想到|居然|哇|天哪|竟然)/i;
const sadPattern = /(\bsorry\b|\bhard\b|\bdifficult\b|\btough\b|\bsad\b|\bstruggl|\bno worries\b|没关系|别担心|难|遗憾|抱歉|辛苦|卡住|不容易)/i;
const excitedPattern = /(\bgreat\b|\bnice\b|\bamazing\b|\bexcellent\b|\bwell done\b|\bgood job\b|\bperfect\b|\blove\b|太棒|真棒|很好|不错|漂亮|厉害|做得好|太好了)/i;

export function avatarStatusLabel(state: CallBuState, isChinese: boolean) {
  switch (state) {
    case "connecting":
      return isChinese ? "连接中" : "Connecting";
    case "listening":
      return isChinese ? "正在听" : "Listening";
    case "thinking":
      return isChinese ? "思考中" : "Thinking";
    case "speaking":
      return isChinese ? "Bu 正在说" : "Bu is speaking";
    case "ended":
      return isChinese ? "通话已结束" : "Call ended";
    case "error":
      return isChinese ? "通话出错" : "Call error";
    default:
      return isChinese ? "待机中" : "Idle";
  }
}

export function classifySpeechMood(text: string, useAltTalking: boolean): AvatarVideoMood {
  if (shockPattern.test(text)) return "shock";
  if (sadPattern.test(text)) return "sad";
  if (excitedPattern.test(text)) return "excited";
  return useAltTalking ? "talkingAlt" : "talking";
}

export function baselineMoodForCallState(_state: CallBuState): AvatarVideoMood {
  return "idle";
}
