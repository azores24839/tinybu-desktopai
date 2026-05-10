export type Screen =
  | "welcome"
  | "onboarding"
  | "companion"
  | "home"
  | "inbox"
  | "organize"
  | "topics"
  | "topic-detail"
  | "study-room"
  | "practice"
  | "practice-review"
  | "notebook"
  | "memory"
  | "settings";

export type Level = "A1" | "A2" | "B1" | "B2";
export type SupportPreference = "Gentle" | "Balanced" | "Direct";
export type CompanionStyle =
  | "Warm Friend"
  | "Gentle Coach"
  | "Native Buddy"
  | "Calm Listener";
export type FeedbackTiming =
  | "after-talk"
  | "when-stuck"
  | "light-live"
  | "direct-natural";
export type CompanionState =
  | "idle"
  | "listening"
  | "speaking"
  | "thinking"
  | "encouraging"
  | "celebrating";
export type AiProviderMode = "rules" | "user-key" | "cloud-proxy";
export type ExternalCaptureKind = "selection" | "article" | "youtube" | "video" | "screenshot" | "manual";
export type PracticeStage = "select" | "answer" | "review";
export type PracticeQuestionType = "understanding" | "opinion" | "personal" | "expression";
export type CaptureStatus = "unsorted" | "suggested" | "needs_review" | "in-topic" | "studied" | "practiced" | "archived";

export type ReviewIssueType =
  | "ocr_off"
  | "ocr_failed"
  | "recognition_failed"
  | "low_confidence"
  | "text_too_short"
  | "transcript_messy"
  | "extraction_issue"
  | "signin_page"
  | "mixed_language"
  | "empty_capture";
export type TopicStatus = "ready" | "in-progress" | "practiced";
export type RescueType =
  | "start"
  | "continue"
  | "words"
  | "simple"
  | "with-me"
  | "native-first";

export interface UserProfile {
  nativeLanguage: string;
  targetLanguage: string;
  interfaceLanguage: "中文" | "English";
  level: Level;
  goals: string[];
  customGoal: string;
  anxiety: number;
  supportPreference: SupportPreference;
}

export interface CompanionProfile {
  name: string;
  style: CompanionStyle;
  feedbackTiming: FeedbackTiming;
  speakingPace: "slow" | "normal" | "fast";
}

export interface AppSettings {
  gentleFeedback: boolean;
  showNativeAid: boolean;
  supportStrength: SupportPreference;
  aiProviderMode: AiProviderMode;
  aiModel: string;
  visionModel: string;
  screenshotRecognitionEnabled: boolean;
  openRouterBaseUrl: string;
  cloudProxyUrl: string;
  apiKeySaved: boolean;
}

export interface AppStateRecord {
  id: "state";
  onboarded: boolean;
  companionReady: boolean;
  profile: UserProfile;
  companion: CompanionProfile;
  settings: AppSettings;
  activeContentId: string;
  activeCaptureId: string;
  activeTopicId: string;
  activePracticeSessionId: string;
  pastedTranscript: string;
  pastedSourceTitle: string;
  pastedSourceUrl: string;
  pastedSourceKind: ExternalCaptureKind;
}

export interface TranscriptLine {
  id: string;
  text: string;
  note?: string;
}

export interface ContentItem {
  id: string;
  title: string;
  topic: string;
  sourceType: "demo" | "pasted" | "external";
  sourceUrl?: string;
  sourceKind?: ExternalCaptureKind;
  transcript: TranscriptLine[];
  summary: string;
  keywords: string[];
  questions: string[];
}

export interface ExternalCapturePayload {
  kind: ExternalCaptureKind;
  title: string;
  url: string;
  text: string;
  capturedAt: string;
}

export interface CaptureFragment {
  id: string;
  text: string;
  selected: boolean;
  recommended: boolean;
  sourceIndex: number;
  note?: string;
}

export interface CaptureItem {
  id: string;
  title: string;
  sourceUrl: string;
  sourceKind: ExternalCaptureKind;
  sourceText?: string;
  screenshot?: ScreenshotCaptureRecord;
  topic?: string;
  summary?: string;
  keywords?: string[];
  questions?: string[];
  suggestedExpressions?: string[];
  capturedAt: string;
  fragments: CaptureFragment[];
  topicId?: string;
  status: CaptureStatus;
  issueType?: ReviewIssueType;
  extractedText?: string;
  originalText?: string;
  originalImageUrl?: string;
  notice?: string;
}

export interface TopicItem {
  id: string;
  name: string;
  summary: string;
  captureIds: string[];
  tags: string[];
  practiceGoal: string;
  status: TopicStatus;
  savedExpressionCount: number;
  createdAt: string;
  updatedAt: string;
  lastStudiedAt?: string;
  lastPracticedAt?: string;
}

export interface ScreenshotCaptureRecord {
  imageDataUrl?: string;
  width: number;
  height: number;
  language: string;
  screenType: string;
  contextNote: string;
  visibleText: string[];
  errorMessages: string[];
  interactiveElements: string[];
  questionAnswers: ScreenshotQuestionAnswer[];
}

export interface ScreenshotQuestionAnswer {
  id: string;
  question: string;
  answer: string;
  quotedText: string;
  nextAction: string;
  createdAt: string;
}

export interface ExpressionRecord {
  id: string;
  original: string;
  meaning: string;
  keywords: string[];
  pattern: string;
  scene: string;
  practiceStem: string;
  sourceTitle: string;
  sourceContentId: string;
  capturedAt: string;
  saved: boolean;
  useLater: boolean;
  usedInTalk: boolean;
  userSentence: string;
  practiceCount: number;
  learned: boolean;
  category: "captured" | "my-sentence" | "pattern" | "need-practice" | "used";
}

export interface TalkMessage {
  id: string;
  role: "tinybu" | "user" | "rescue";
  text: string;
  createdAt: string;
  rescueType?: RescueType;
}

export interface TalkSession {
  id: string;
  topic: string;
  contentId: string;
  title: string;
  messages: TalkMessage[];
  rescueUsed: RescueType[];
  roundCount: number;
  status: "active" | "ended";
  createdAt: string;
  endedAt?: string;
}

export interface ReviewRecord {
  id: string;
  sessionId: string;
  talkedAbout: string;
  didWell: string[];
  naturalExpressions: Array<{
    original: string;
    improved: string;
  }>;
  savedExpressionIds: string[];
  nextPractice: string;
  createdAt: string;
}

export interface PracticeQuestion {
  id: string;
  type: PracticeQuestionType;
  question: string;
  relatedFragmentIds: string[];
  tipLevel: number;
  tipOutline: string;
  tipExample: string;
}

export interface PracticeAnswer {
  id: string;
  questionId: string;
  answer: string;
  tinybuReply: string;
  createdAt: string;
}

export interface PracticeSession {
  id: string;
  captureId: string;
  topicId?: string;
  selectedFragmentIds: string[];
  stage: PracticeStage;
  questions: PracticeQuestion[];
  answers: PracticeAnswer[];
  currentQuestionIndex: number;
  reviewId?: string;
  status: "active" | "completed";
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface MemoryItem {
  id: string;
  type: "interest" | "expression" | "support" | "anxiety" | "next";
  title: string;
  body: string;
  editable: boolean;
  updatedAt: string;
}

export interface ContentUnderstanding {
  topic: string;
  summary: string;
  keywords: string[];
  questions: string[];
  suggestedExpressions: string[];
}

export interface ScreenshotCapturePayload {
  imageDataUrl: string;
  width: number;
  height: number;
  capturedAt: string;
  captureArea?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface ScreenshotRecognitionOutput {
  title: string;
  text: string;
  language: string;
  contextNote: string;
  screenType: string;
  visibleText: string[];
  errorMessages: string[];
  interactiveElements: string[];
}

export interface ScreenshotQuestionOutput {
  answer: string;
  quotedText: string;
  nextAction: string;
}

export interface TalkTurnOutput {
  reply: string;
  nextQuestion: string;
  shouldSuggestRescue: boolean;
  readyToEnd: boolean;
}

export interface RescueOutput {
  lines: string[];
}

export interface ReviewOutput {
  talkedAbout: string;
  didWell: string[];
  naturalExpressions: Array<{
    original: string;
    improved: string;
  }>;
  savedExpressions: Array<{
    original: string;
    meaning: string;
    keywords: string[];
    pattern: string;
    scene: string;
    practiceStem: string;
  }>;
  nextPractice: string;
}

export interface MemoryUpdateOutput {
  memories: MemoryItem[];
}

export interface FragmentRecommendationOutput {
  recommendedFragmentIds: string[];
}

export interface PracticeQuestionsOutput {
  questions: Omit<PracticeQuestion, "id" | "tipLevel">[];
}

export interface PracticeTipOutput {
  outline?: string;
  example?: string;
}

export interface PracticeTurnOutput {
  encouragement: string;
  response: string;
}

export interface QuickPetChatOutput {
  reply: string;
}
