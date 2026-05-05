import type { AppSettings, AppStateRecord, CompanionProfile, UserProfile } from "../types";

export const defaultProfile: UserProfile = {
  nativeLanguage: "中文",
  targetLanguage: "English",
  interfaceLanguage: "中文",
  level: "A2",
  goals: ["看视频学表达", "减少开口焦虑"],
  customGoal: "",
  anxiety: 3,
  supportPreference: "Balanced"
};

export const defaultCompanion: CompanionProfile = {
  name: "TinyBu",
  style: "Warm Friend",
  feedbackTiming: "after-talk",
  speakingPace: "slow"
};

export const defaultSettings: AppSettings = {
  gentleFeedback: true,
  showNativeAid: true,
  supportStrength: "Balanced",
  aiProviderMode: "cloud-proxy",
  aiModel: "MiniMax-M2.7",
  visionModel: "qwen/qwen3.6-35b-a3b",
  screenshotRecognitionEnabled: false,
  openRouterBaseUrl: "https://openrouter.ai/api/v1",
  cloudProxyUrl: "http://127.0.0.1:8787/v1/nomi/task",
  apiKeySaved: false
};

export const defaultAppState: AppStateRecord = {
  id: "state",
  onboarded: false,
  companionReady: false,
  profile: defaultProfile,
  companion: defaultCompanion,
  settings: defaultSettings,
  activeContentId: "demo-productivity",
  activeCaptureId: "",
  activeTopicId: "",
  activePracticeSessionId: "",
  pastedTranscript: "",
  pastedSourceTitle: "",
  pastedSourceUrl: "",
  pastedSourceKind: "manual"
};

export const uid = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const nowIso = () => new Date().toISOString();
