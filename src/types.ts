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
  | "practice-preparing"
  | "practice-chat"
  | "practice-review"
  | "notebook"
  | "expression-training"
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
export type PracticeQuestionType = "understanding" | "opinion" | "personal" | "expression";
export type CaptureStatus = "unsorted" | "suggested" | "needs_review" | "in-topic" | "studied" | "practiced" | "archived";
export type PracticeTaskType = "find-material" | "tinybu-material" | "scenario" | "memory-review" | "capture-based" | "open-chat";
export type PracticeTaskStatus = "new" | "used" | "saved";

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
  deepSeekBaseUrl: string;
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

export interface PracticeTask {
  id: string;
  title: string;
  description: string;
  taskType: PracticeTaskType;
  sourceText?: string;
  sourceCaptureId?: string;
  sourceTopicId?: string;
  targetGoal: string;
  starterQuestion: string;
  status: PracticeTaskStatus;
  createdAt: string;
  usedAt?: string;
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

export interface PracticePlanQuestion {
  type: PracticeQuestionType;
  question: string;
  relatedFragmentIds: string[];
  tipOutline: string;
  tipExample: string;
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

export interface FragmentRecommendationOutput {
  recommendedFragmentIds: string[];
}

export interface PracticeQuestionsOutput {
  questions: PracticePlanQuestion[];
}

export interface PracticePlan {
  practiceGoal: string;
  whatToCover: string[];
  languageBank: {
    usefulWords: string[];
    usefulChunks: string[];
  };
  questions: PracticePlanQuestion[];
}

export interface QuickPetChatOutput {
  reply: string;
}

export interface ChatMessage {
  id: string;
  role: "bu" | "user";
  text: string;
  createdAt: string;
  saved?: boolean;
}

export type ReviewConfidence = "low" | "medium" | "high";
export type ReviewFocusType =
  | "task_completion"
  | "continuity"
  | "idea_development"
  | "language_control"
  | "interaction"
  | "chunk_activation";

export interface ReviewWhyMoment {
  quote: string;
  interpretation: string;
}

export interface ReviewDimensionSignals {
  taskCompletion: number;
  continuity: number;
  development: number;
  control: number;
  interaction: number;
}

export interface PracticeReviewFeatures {
  userTurnCount: number;
  totalWordCount: number;
  averageWordsPerTurn: number;
  longestTurnWordCount: number;
  shortReplyRatio: number;
  completedMoveCount: number;
  targetMoveCount: number;
  hasReason: boolean;
  hasExample: boolean;
  hasContrast: boolean;
  hasAction: boolean;
  usedTargetChunk: boolean;
  confidence: ReviewConfidence;
  suggestedScore: number;
  suggestedLabel: string;
  dimensionSignals: ReviewDimensionSignals;
  why: ReviewWhyMoment[];
  segments: Array<{
    index: number;
    text: string;
    wordCount: number;
  }>;
}

export interface PracticeChatReview {
  id: string;
  topicId?: string;
  taskId?: string;
  createdAt: string;
  diarySummary: string;
  taskOutcome?: {
    label: string;
    detail: string;
  };
  reviewScores?: {
    fluency: number;
    naturalness: number;
    vocabulary: number;
  };
  completedFocusItemIds: string[];
  focusItems: Array<{
    id: string;
    label: string;
    completed: boolean;
  }>;
  betterExpressions: Array<{
    original: string;
    improved: string;
    note: string;
  }>;
  savedWordsOrChunks: string[];
  memoryTags?: string[];
  nextStep: string;
  messageCount: number;
  userMessageCount: number;
  expressionStatus?: {
    score: number;
    label: string;
    confidence: ReviewConfidence;
  };
  strength?: {
    label: string;
    detail: string;
    quote?: string;
  };
  nextFocus?: {
    type: ReviewFocusType;
    label: string;
    detail: string;
    practiceMove: string;
    quote?: string;
  };
  why?: ReviewWhyMoment[];
  dimensionSignals?: ReviewDimensionSignals;
}

export interface PracticeChatReviewOutput {
  diarySummary: string;
  taskOutcome?: {
    label: string;
    detail: string;
  };
  reviewScores?: {
    fluency: number;
    naturalness: number;
    vocabulary: number;
  };
  betterExpressions: Array<{
    original: string;
    improved: string;
    note: string;
  }>;
  savedWordsOrChunks: string[];
  memoryTags?: string[];
  nextStep: string;
  expressionStatus: {
    score: number;
    label: string;
    confidence: ReviewConfidence;
  };
  strength: {
    label: string;
    detail: string;
    quote: string;
  };
  nextFocus: {
    type: ReviewFocusType;
    label: string;
    detail: string;
    practiceMove: string;
    quote: string;
  };
  why: ReviewWhyMoment[];
  dimensionSignals: ReviewDimensionSignals;
}
