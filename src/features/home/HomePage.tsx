import { ChevronRight, Crown, Sparkles } from "lucide-react";
import { AppHeader } from "../../components/AppHeader";
import { uiCopy } from "../../lib/uiCopy";
import { suggestedGroups } from "../captures/captureUtils";
import type { AppStateRecord, CaptureItem, MemoryItem, PracticeSession, Screen, TopicItem } from "../../types";

export function HomePage({
  appState,
  captures,
  topics,
  sessions,
  memories,
  openInbox,
  openTopic,
  continuePractice,
  upgrade,
  tryDemo
}: {
  appState: AppStateRecord;
  captures: CaptureItem[];
  topics: TopicItem[];
  sessions: PracticeSession[];
  memories: MemoryItem[];
  openInbox: () => void;
  openTopic: (topic: TopicItem, next?: Screen) => void;
  continuePractice: (session: PracticeSession) => void;
  upgrade: () => void;
  tryDemo: () => void;
}) {
  const copy = uiCopy[appState.profile.interfaceLanguage].home;
  const profileSummary = `${appState.profile.targetLanguage} · ${appState.profile.level} · ${appState.profile.supportPreference}`;
  const activeSessions = sessions.filter((session) => session.status === "active");
  const suggested = suggestedGroups(captures);
  const waitingCaptures = captures.filter((capture) => capture.status !== "archived" && !capture.topicId);
  const readyTopics = topics.filter((topic) => topic.status === "ready");
  const practiceTopics = topics.filter((topic) => topic.status === "in-progress");
  const latestMemory = [...memories].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
  const activeSessionTopic = activeSessions[0] ? topics.find((topic) => topic.id === activeSessions[0].topicId) : undefined;
  const suggestedTopic = suggested[0];

  const suggestion = (() => {
    if (latestMemory) {
      return {
        source: "memory",
        observation: latestMemory.body || latestMemory.title,
        prompt: copy.memoryPrompt,
        actionLabel: activeSessions[0] ? copy.continuePractice : copy.startPractice,
        action: () => {
          if (activeSessions[0]) {
            continuePractice(activeSessions[0]);
            return;
          }
          const topic = practiceTopics[0] ?? readyTopics[0] ?? topics[0];
          if (topic) openTopic(topic, topic.status === "ready" ? "study-room" : "topic-detail");
          else tryDemo();
        }
      };
    }
    if (activeSessions[0]) {
      const topicName = activeSessionTopic?.name ?? "your topic";
      return {
        source: "active",
        observation: `${copy.activePrefix} ${topicName}${copy.activeSuffix}`,
        prompt: copy.activePrompt,
        actionLabel: copy.continuePractice,
        action: () => continuePractice(activeSessions[0])
      };
    }
    if (suggestedTopic) {
      return {
        source: "capture",
        observation: `${copy.topicPrefix} ${suggestedTopic.name}`,
        prompt: suggestedTopic.practiceGoal || copy.topicPrompt,
        actionLabel: copy.organizeNow,
        action: openInbox
      };
    }
    return {
      source: "featured",
      observation: copy.defaultObservation,
      prompt: copy.defaultPrompt,
      actionLabel: copy.tryFeatured,
      action: tryDemo
    };
  })();

  const queueItems = [
    { label: copy.organize, count: waitingCaptures.length, action: openInbox },
    {
      label: copy.study,
      count: readyTopics.length,
      action: () => (readyTopics[0] ? openTopic(readyTopics[0], "study-room") : openInbox())
    },
    {
      label: copy.practice,
      count: activeSessions.length + practiceTopics.length,
      action: () => (activeSessions[0] ? continuePractice(activeSessions[0]) : practiceTopics[0] ? openTopic(practiceTopics[0]) : openInbox())
    }
  ];

  const dayMs = 24 * 60 * 60 * 1000;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const activity = new Map<string, number>();
  const locale = appState.profile.interfaceLanguage === "中文" ? "zh-CN" : "en-US";
  const monthFormatter = new Intl.DateTimeFormat(locale, { month: "short" });
  const dateKey = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const addActivity = (value: string | undefined, weight: number) => {
    if (!value) return;
    const date = new Date(value);
    date.setHours(0, 0, 0, 0);
    const key = dateKey(date);
    activity.set(key, Math.min(4, (activity.get(key) ?? 0) + weight));
  };
  topics.forEach((topic) => {
    addActivity(topic.createdAt, 1);
    addActivity(topic.lastStudiedAt, 2);
  });
  sessions.forEach((session) => addActivity(session.completedAt, 3));
  const rhythmWeekCount = 18;
  const currentMonday = new Date(todayStart);
  currentMonday.setDate(todayStart.getDate() - ((todayStart.getDay() + 6) % 7));
  const rhythmStart = new Date(currentMonday.getTime() - (rhythmWeekCount - 1) * 7 * dayMs);
  const rhythmWeeks = Array.from({ length: rhythmWeekCount }, (_, weekIndex) => {
    const days = Array.from({ length: 7 }, (_, dayIndex) => {
      const date = new Date(rhythmStart.getTime() + (weekIndex * 7 + dayIndex) * dayMs);
      const key = dateKey(date);
      return {
        key,
        date,
        future: date.getTime() > todayStart.getTime(),
        level: activity.get(key) ?? 0
      };
    });
    const monthDay = days.find((day) => day.date.getDate() === 1);
    return {
      label: weekIndex === 0 ? monthFormatter.format(days[0].date) : monthDay ? monthFormatter.format(monthDay.date) : "",
      days
    };
  });
  const rhythmDays = rhythmWeeks.flatMap((week) => week.days);

  return (
    <section className="page">
      <AppHeader title={copy.title} description={profileSummary}>
        <button className="secondary upgrade-button" onClick={upgrade}>
          <Crown size={16} />
          {copy.upgrade}
        </button>
      </AppHeader>

      <div className="home-focus-layout">
        <section className={`panel suggestion-panel ${suggestion.source}`}>
          <div>
            <p className="eyebrow">{copy.suggestion}</p>
            <h2>{suggestion.observation}</h2>
            <p>{suggestion.prompt}</p>
          </div>
          <button className="primary icon-action" onClick={suggestion.action} aria-label={suggestion.actionLabel}>
            <span>{suggestion.actionLabel}</span>
            <ChevronRight size={20} />
          </button>
        </section>

        <section className="queue-grid" aria-label={copy.queueTitle}>
          {queueItems.map((item) => (
            <button className="queue-card" key={item.label} onClick={item.action}>
              <span>{item.label}</span>
              <strong>{item.count}</strong>
            </button>
          ))}
        </section>

        <section className="panel rhythm-panel">
          <div className="rhythm-header">
            <div className="section-title">
              <Sparkles size={18} />
              {copy.rhythm}
            </div>
            <div className="rhythm-legend">
              <span>Less</span>
              <i className="rhythm-cell level-0" />
              <i className="rhythm-cell level-1" />
              <i className="rhythm-cell level-2" />
              <i className="rhythm-cell level-3" />
              <i className="rhythm-cell level-4" />
              <span>More</span>
            </div>
          </div>

          <div className="rhythm-calendar" aria-label={copy.rhythm}>
            <div className="rhythm-months" style={{ gridTemplateColumns: `repeat(${rhythmWeekCount}, var(--rhythm-cell-size))` }}>
              {rhythmWeeks.map((week, index) => (
                <span className="rhythm-month" key={`${week.label}-${index}`}>
                  {week.label}
                </span>
              ))}
            </div>
            <div className="rhythm-calendar-body">
              <div className="rhythm-weekdays" aria-hidden="true">
                <span>Mon</span>
                <span>Wed</span>
                <span>Fri</span>
              </div>
              <div className="rhythm-grid" style={{ gridTemplateColumns: `repeat(${rhythmWeekCount}, var(--rhythm-cell-size))` }}>
                {rhythmDays.map((day) => (
                  <span
                    className={`rhythm-cell level-${day.level}${day.future ? " future" : ""}`}
                    key={day.key}
                    title={`${day.key}: ${day.level}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
