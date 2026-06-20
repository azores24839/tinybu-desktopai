import { lazy, Suspense } from "react";
import { BookOpen, Brain, Home, Inbox, NotebookTabs, Settings, Wand2 } from "lucide-react";
import { TinyBuOrb } from "../components/TinyBuOrb";
import { topicCaptures, topicExpressions } from "../features/topics/topicUtils";
import { defaultAppState } from "../lib/defaults";
import { uiCopy } from "../lib/uiCopy";
import type { PracticeSource } from "../features/practice/practiceSessionTypes";
import type {
  AppStateRecord,
  CaptureItem,
  CompanionProfile,
  CompanionState,
  ExpressionRecord,
  MemoryItem,
  PracticeChatReview,
  PracticePlan,
  PracticeTask,
  Screen,
  TopicItem,
  UserProfile
} from "../types";

const HomePage = lazy(() => import("../features/home/HomePage").then((module) => ({ default: module.HomePage })));
const InboxPage = lazy(() => import("../features/captures/InboxPage").then((module) => ({ default: module.InboxPage })));
const OrganizePage = lazy(() => import("../features/captures/OrganizePage").then((module) => ({ default: module.OrganizePage })));
const TopicsPage = lazy(() => import("../features/topics/TopicsPage").then((module) => ({ default: module.TopicsPage })));
const TopicDetailPage = lazy(() => import("../features/topics/TopicDetailPage").then((module) => ({ default: module.TopicDetailPage })));
const StudyRoomPage = lazy(() => import("../features/topics/StudyRoomPage").then((module) => ({ default: module.StudyRoomPage })));
const NotebookPage = lazy(() => import("../features/notebook/NotebookPage").then((module) => ({ default: module.NotebookPage })));
const ExpressionTrainingPage = lazy(() =>
  import("../features/notebook/ExpressionTrainingPage").then((module) => ({ default: module.ExpressionTrainingPage }))
);
const MemoryPage = lazy(() => import("../features/memory/MemoryPage").then((module) => ({ default: module.MemoryPage })));
const SettingsPage = lazy(() => import("../features/settings/SettingsPage").then((module) => ({ default: module.SettingsPage })));
const PracticeReviewPage = lazy(() => import("../features/practice/PracticeReviewPage").then((module) => ({ default: module.PracticeReviewPage })));
const PracticePreparingPage = lazy(() =>
  import("../features/practice/PracticePreparingPage").then((module) => ({ default: module.PracticePreparingPage }))
);
const PracticeChatPage = lazy(() => import("../features/practice/PracticeChatPage").then((module) => ({ default: module.PracticeChatPage })));
const WelcomePage = lazy(() => import("../features/setup/WelcomePage").then((module) => ({ default: module.WelcomePage })));
const OnboardingPage = lazy(() => import("../features/setup/OnboardingPage").then((module) => ({ default: module.OnboardingPage })));
const CompanionSetupPage = lazy(() => import("../features/setup/CompanionSetupPage").then((module) => ({ default: module.CompanionSetupPage })));

const shellScreens: Screen[] = [
  "home",
  "inbox",
  "organize",
  "topics",
  "topic-detail",
  "study-room",
  "notebook",
  "memory",
  "settings"
];

const routeFallback = (
  <div className="route-loading" aria-live="polite">
    Loading...
  </div>
);

type AppShellProps = {
  screen: Screen;
  appState: AppStateRecord;
  busyLabel: string;
  companionState: CompanionState;
  captures: CaptureItem[];
  topics: TopicItem[];
  expressions: ExpressionRecord[];
  memories: MemoryItem[];
  activeTopic: TopicItem | undefined;
  activeCapture: CaptureItem | undefined;
  practicePlan: PracticePlan | null;
  activePracticeSource: PracticeSource | null;
  practiceChatFirstQuestion: string;
  practiceChatReview: PracticeChatReview | null;
  topicPracticeChatReviews: PracticeChatReview[];
  isReviewGenerating: boolean;
  screenshotQuestionInput: string;
  screenshotQuestionBusy: boolean;
  apiKeyDraft: string;
  apiKeyStatus: string;
  navigate: (next: Screen) => void;
  startDemo: () => Promise<void>;
  startPracticeForTask: (task: PracticeTask) => Promise<void>;
  startPracticeForTopic: (topic: TopicItem) => Promise<void>;
  handlePreparingReady: () => void;
  handlePracticeChatReply: (userAnswer: string, chatHistory: Array<{ role: string; text: string }>) => Promise<string>;
  finishPracticeChatWithReview: (messages: Array<{ id: string; role: "bu" | "user"; text: string; createdAt: string; saved?: boolean }>, whatToCover: string[]) => Promise<void>;
  endPracticeChatWithoutSaving: () => void;
  saveReviewAndGoToTopic: (review: PracticeChatReview) => Promise<void>;
  saveReviewAndPracticeAgain: (review: PracticeChatReview, topic?: TopicItem) => Promise<void>;
  openTopic: (topic: TopicItem, next?: Screen) => Promise<void>;
  openCapture: (capture: CaptureItem) => Promise<void>;
  updateCapture: (capture: CaptureItem) => Promise<void>;
  archiveCapture: (capture: CaptureItem) => Promise<void>;
  deleteCapture: (id: string) => Promise<void>;
  createTopicFromCaptures: (captureIds: string[], name?: string, practiceGoal?: string) => Promise<void>;
  addCapturesToTopic: (captureIds: string[], topic: TopicItem) => Promise<void>;
  updateTopic: (topic: TopicItem) => Promise<void>;
  markTopicStudied: (topic: TopicItem) => Promise<void>;
  persistState: (nextState: AppStateRecord) => Promise<void>;
  confirmScreenshotText: (capture: CaptureItem) => Promise<void>;
  askAboutScreenshot: (capture: CaptureItem, question: string) => Promise<void>;
  setScreenshotQuestionInput: (value: string) => void;
  saveExpressionFromCapture: (capture: CaptureItem, expression: string) => Promise<void>;
  updateExpression: (record: ExpressionRecord) => Promise<void>;
  deleteExpression: (id: string) => Promise<void>;
  updateMemoryItem: (item: MemoryItem) => Promise<void>;
  deleteMemory: (id: string) => Promise<void>;
  saveSettings: (nextState: AppStateRecord, key?: string) => Promise<boolean>;
  setApiKeyDraft: (value: string) => void;
  checkUserKey: () => Promise<void>;
  clearUserKey: () => Promise<void>;
  clearMemoryOnly: () => Promise<void>;
  clearAllData: () => Promise<void>;
  resetOnboarding: () => Promise<void>;
  submitOnboarding: (profile: UserProfile) => Promise<void>;
  submitCompanion: (companion: CompanionProfile) => Promise<void>;
};

export function AppShell(props: AppShellProps) {
  const {
    screen,
    appState,
    busyLabel,
    companionState,
    captures,
    topics,
    expressions,
    memories,
    activeTopic,
    activeCapture,
    practicePlan,
    activePracticeSource,
    practiceChatFirstQuestion,
    practiceChatReview,
    topicPracticeChatReviews,
    isReviewGenerating,
    screenshotQuestionInput,
    screenshotQuestionBusy,
    apiKeyDraft,
    apiKeyStatus,
    navigate
  } = props;
  const copy = uiCopy[appState.profile.interfaceLanguage];

  return (
    <div className="app">
      {busyLabel && (
        <div className="busy-banner">
          <Wand2 size={16} />
          {busyLabel}
        </div>
      )}

      {screen === "practice-chat" && activePracticeSource ? (
        <Suspense fallback={routeFallback}>
          <PracticeChatPage
            practiceSource={activePracticeSource}
            captures={activePracticeSource.captures}
            practicePlan={practicePlan}
            opening={copy.practiceChat.opening}
            firstQuestion={practiceChatFirstQuestion || activePracticeSource.practiceGoal || copy.practiceChat.firstQuestion}
            onChatReply={props.handlePracticeChatReply}
            onEndWithReview={props.finishPracticeChatWithReview}
            onExit={props.endPracticeChatWithoutSaving}
            interfaceLanguage={appState.profile.interfaceLanguage}
            targetLanguage={appState.profile.targetLanguage}
            nativeLanguage={appState.profile.nativeLanguage}
          />
        </Suspense>
      ) : screen === "practice-preparing" ? (
        <Suspense fallback={routeFallback}>
          <PracticePreparingPage
            interfaceLanguage={appState.profile.interfaceLanguage}
            sourceTitle={activePracticeSource?.title}
            sourceSummary={activePracticeSource?.summary}
            practiceGoal={activePracticeSource?.practiceGoal}
            practicePlan={practicePlan}
            mode={isReviewGenerating ? "review-loading" : "before-call"}
            onReady={props.handlePreparingReady}
          />
        </Suspense>
      ) : screen === "practice-review" && activePracticeSource && practiceChatReview ? (
        <Suspense fallback={routeFallback}>
          <PracticeReviewPage
            sourceTitle={activePracticeSource.title}
            review={practiceChatReview}
            onDone={props.saveReviewAndGoToTopic}
            onPracticeAgain={(review) => props.saveReviewAndPracticeAgain(review, activePracticeSource.kind === "topic" ? activePracticeSource.topic : undefined)}
            interfaceLanguage={appState.profile.interfaceLanguage}
          />
        </Suspense>
      ) : screen === "expression-training" ? (
        <Suspense fallback={routeFallback}>
          <ExpressionTrainingPage expressions={expressions} updateExpression={props.updateExpression} back={() => navigate("notebook")} />
        </Suspense>
      ) : shellScreens.includes(screen) ? (
        <div className="desktop-shell home-shell">
          <aside className="sidebar">
            <button className="brand-button" onClick={() => navigate("home")}>
              <TinyBuOrb state={companionState} />
              <span>TinyBu</span>
            </button>
            <nav>
              <button className={screen === "home" ? "active" : ""} onClick={() => navigate("home")} aria-label={copy.nav.home}>
                <Home size={18} /> {copy.nav.home}
              </button>
              <button className={screen === "inbox" || screen === "organize" ? "active" : ""} onClick={() => navigate("inbox")} aria-label={copy.nav.inbox}>
                <Inbox size={18} /> {copy.nav.inbox}
              </button>
              <button
                className={["topics", "topic-detail", "study-room", "practice-preparing", "practice-review", "practice-chat-review"].includes(screen) ? "active" : ""}
                onClick={() => navigate("topics")}
                aria-label={copy.nav.topics}
              >
                <BookOpen size={18} /> {copy.nav.topics}
              </button>
              <button className={screen === "notebook" ? "active" : ""} onClick={() => navigate("notebook")} aria-label={copy.nav.notebook}>
                <NotebookTabs size={18} /> {copy.nav.notebook}
              </button>
              <button className={screen === "memory" ? "active" : ""} onClick={() => navigate("memory")} aria-label={copy.nav.memory}>
                <Brain size={18} /> {copy.nav.memory}
              </button>
              <button className={screen === "settings" ? "active" : ""} onClick={() => navigate("settings")} aria-label={copy.nav.settings}>
                <Settings size={18} /> {copy.nav.settings}
              </button>
            </nav>
            <button className="settings-link upgrade-link" onClick={() => navigate("settings")} aria-label={copy.home.upgrade}>
              {copy.home.upgrade}
            </button>
          </aside>

          <main className="main-panel">
            <Suspense fallback={routeFallback}>
              {screen === "home" && (
                <HomePage
                  appState={appState}
                  captures={captures}
                  topics={topics}
                  memories={memories}
                  openInbox={() => navigate("inbox")}
                  openTopic={props.openTopic}
                  upgrade={() => navigate("settings")}
                  tryDemo={props.startDemo}
                  startTask={(task: PracticeTask) => {
                    void props.startPracticeForTask(task);
                  }}
                />
              )}
              {screen === "inbox" && (
                <InboxPage
                  captures={captures}
                  topics={topics}
                  activeCapture={activeCapture}
                  openCapture={props.openCapture}
                  updateCapture={props.updateCapture}
                  confirmScreenshotText={props.confirmScreenshotText}
                  archiveCapture={props.archiveCapture}
                  deleteCapture={props.deleteCapture}
                  createTopicFromCaptures={props.createTopicFromCaptures}
                  addCapturesToTopic={props.addCapturesToTopic}
                  saveExpressionFromCapture={props.saveExpressionFromCapture}
                />
              )}
              {screen === "organize" && (
                <OrganizePage
                  captures={captures}
                  topics={topics}
                  createTopicFromCaptures={props.createTopicFromCaptures}
                  addCapturesToTopic={props.addCapturesToTopic}
                  back={() => navigate("inbox")}
                />
              )}
              {screen === "topics" && (
                <TopicsPage topics={topics} captures={captures} expressions={expressions} openTopic={props.openTopic} startPractice={props.startPracticeForTopic} />
              )}
              {screen === "topic-detail" && activeTopic && (
                <TopicDetailPage
                  topic={activeTopic}
                  captures={topicCaptures(activeTopic, captures)}
                  expressions={topicExpressions(activeTopic, expressions)}
                  practiceChatReviews={topicPracticeChatReviews}
                  updateTopic={props.updateTopic}
                  openStudyRoom={async () => {
                    await props.markTopicStudied(activeTopic);
                    navigate("study-room");
                  }}
                  startPractice={() => props.startPracticeForTopic(activeTopic)}
                  back={() => navigate("topics")}
                />
              )}
              {screen === "study-room" && activeTopic && (
                <StudyRoomPage
                  topic={activeTopic}
                  captures={topicCaptures(activeTopic, captures)}
                  expressions={topicExpressions(activeTopic, expressions)}
                  activeCapture={activeCapture}
                  setActiveCapture={async (capture) => {
                    await props.persistState({ ...appState, activeCaptureId: capture.id });
                  }}
                  saveExpression={props.saveExpressionFromCapture}
                  startPractice={() => props.startPracticeForTopic(activeTopic)}
                  back={() => navigate("topic-detail")}
                  screenshotQuestionInput={screenshotQuestionInput}
                  setScreenshotQuestionInput={props.setScreenshotQuestionInput}
                  askAboutScreenshot={props.askAboutScreenshot}
                  confirmScreenshotText={props.confirmScreenshotText}
                  screenshotQuestionBusy={screenshotQuestionBusy}
                />
              )}
              {screen === "notebook" && (
                <NotebookPage
                  expressions={expressions}
                  updateExpression={props.updateExpression}
                  deleteExpression={props.deleteExpression}
                  startTraining={() => navigate("expression-training")}
                />
              )}
              {screen === "memory" && (
                <MemoryPage
                  memories={memories}
                  topics={topics}
                  expressions={expressions}
                  updateMemoryItem={props.updateMemoryItem}
                  deleteMemory={props.deleteMemory}
                />
              )}
              {screen === "settings" && (
                <SettingsPage
                  appState={appState}
                  apiKeyDraft={apiKeyDraft}
                  apiKeyStatus={apiKeyStatus}
                  setApiKeyDraft={props.setApiKeyDraft}
                  saveSettings={props.saveSettings}
                  checkUserKey={props.checkUserKey}
                  clearUserKey={props.clearUserKey}
                  clearMemory={props.clearMemoryOnly}
                  clearAllData={props.clearAllData}
                  resetOnboarding={props.resetOnboarding}
                />
              )}
            </Suspense>
          </main>
        </div>
      ) : (
        <main className="entry-shell">
          <Suspense fallback={routeFallback}>
            {screen === "welcome" && <WelcomePage start={() => navigate("onboarding")} demo={props.startDemo} />}
            {screen === "onboarding" && (
              <OnboardingPage initialProfile={appState.profile} submit={props.submitOnboarding} skip={() => props.submitOnboarding(defaultAppState.profile)} />
            )}
            {screen === "companion" && (
              <CompanionSetupPage
                initialCompanion={appState.companion}
                submit={props.submitCompanion}
                skip={() => props.submitCompanion(defaultAppState.companion)}
              />
            )}
          </Suspense>
        </main>
      )}
    </div>
  );
}
