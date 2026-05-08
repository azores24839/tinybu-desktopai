import { ArrowUpRight } from "lucide-react";
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
  const isChinese = appState.profile.interfaceLanguage === "中文";
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
      return {
        actionLabel: copy.continuePractice,
        action: () => continuePractice(activeSessions[0])
      };
    }
    if (suggestedTopic) {
      return {
        actionLabel: copy.organizeNow,
        action: openInbox
      };
    }
    return {
      actionLabel: copy.tryFeatured,
      action: tryDemo
    };
  })();

  const headlineTopic =
    readyTopics[0]?.name ??
    practiceTopics[0]?.name ??
    activeSessionTopic?.name ??
    suggestedTopic?.name ??
    (isChinese ? "游戏UI设计工作日常" : "Game UI Design Workday");

  const featuredEmoji = ["🎮", "📝", "💡", "🚀", "🧩"];
  const featuredTags = isChinese
    ? ["Discovery", "Refinement", "Conceptualization", "Delivery", "Refinement"]
    : ["Discovery", "Refinement", "Conceptualization", "Delivery", "Refinement"];
  const featuredCards = [
    ...topics.map((topic) => ({
      tag: topic.tags[0] ?? featuredTags[0],
      title: topic.name,
      likes: Math.max(24, topic.captureIds.length * 32 || 128),
      action: () => openTopic(topic, topic.status === "ready" ? "study-room" : "topic-detail")
    })),
    ...suggested.slice(0, 5).map((topic, index) => ({
      tag: featuredTags[index % featuredTags.length],
      title: topic.name,
      likes: 128,
      action: openInbox
    }))
  ].slice(0, 5);

  while (featuredCards.length < 5) {
    const index = featuredCards.length;
    featuredCards.push({
      tag: featuredTags[index % featuredTags.length],
      title:
        index === 0
          ? headlineTopic
          : isChinese
            ? "计算机能模拟人脑吗？"
            : "Can computers simulate the brain?",
      likes: index === 0 ? 123 : 128,
      action: tryDemo
    });
  }

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

  const rhythmDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const rhythmColumns = 25;
  const rhythmCells = Array.from({ length: rhythmColumns * rhythmDays.length }, (_, index) => {
    const column = Math.floor(index / rhythmDays.length);
    const row = index % rhythmDays.length;
    if (column > 21 && (column + row) % 2 === 0) return 4;
    if (column > 17 && (column + row) % 3 === 0) return 3;
    if (column > 12 && (column + row) % 4 === 0) return 2;
    if (column > 7 && (column + row) % 5 === 0) return 1;
    return 0;
  });

  return (
    <section className="page home-page">
      <div className="home-focus-layout">
        <section className="home-hero" aria-label={copy.suggestion}>
          <span className="hero-star star-top-left" aria-hidden="true">★</span>
          <span className="hero-star star-top-right" aria-hidden="true">★</span>
          <span className="hero-star star-bottom-left" aria-hidden="true">★</span>
          <span className="hero-star star-bottom-right" aria-hidden="true">★</span>
          <div className="hero-asset-slot" aria-hidden="true">
            <img src="/assets/tinybu-home-hero.png" alt="" onError={(event) => (event.currentTarget.style.display = "none")} />
          </div>

          <div className="hero-copy-block">
            <p>{isChinese ? "早上好，想不想聊聊这个？" : "Good morning, want to talk about this?"}</p>
            <div className="hero-title-row">
              <h1>{headlineTopic}</h1>
            </div>
          </div>
          <button className="hero-go-button" onClick={suggestion.action} aria-label={suggestion.actionLabel}>
            <span>{isChinese ? "开始" : "Start"}</span>
            <ArrowUpRight size={32} />
          </button>
        </section>

        <section className="weekly-panel" aria-label={isChinese ? "每周精选" : "Weekly picks"}>
          <div className="weekly-heading-row">
            <h2>{isChinese ? "每周精选" : "Best of the week"}</h2>
            <button type="button">{isChinese ? "更多" : "More"}</button>
          </div>
          <div className="weekly-card-row">
            {featuredCards.map((card, index) => (
              <button className="weekly-card" key={`${card.title}-${index}`} onClick={card.action}>
                <span className="weekly-user">minibu</span>
                <span className="weekly-likes">{card.likes} Liked</span>
                <span className="weekly-emoji" aria-hidden="true">{featuredEmoji[index % featuredEmoji.length]}</span>
                <span className="weekly-folder">
                  <strong>{card.tag}</strong>
                  <i />
                  <em>{card.title}</em>
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="home-bottom-grid">
          <div className="suggestions-block">
            <h2>Suggestions</h2>
            <div className="queue-grid" aria-label={copy.queueTitle}>
              {queueItems.map((item, index) => (
                <button className={`queue-card tone-${index}`} key={item.label} onClick={item.action}>
                  <span>{item.label}</span>
                  <strong>{item.count}</strong>
                  <i>
                    <ArrowUpRight size={34} />
                  </i>
                </button>
              ))}
            </div>
          </div>

          <section className="rhythm-panel">
            <h2>{copy.rhythm}</h2>

            <div className="rhythm-calendar" aria-label={copy.rhythm}>
              <div className="rhythm-top-labels" aria-hidden="true">
                {[1, 5, 9, 13, 17, 21, 25].map((label) => (
                  <span key={label}>{label}</span>
                ))}
              </div>
              <div className="rhythm-calendar-body">
                <div className="rhythm-weekdays" aria-hidden="true">
                  {rhythmDays.map((day) => (
                    <span key={day}>{day}</span>
                  ))}
                </div>
                <div className="rhythm-grid" style={{ gridTemplateColumns: `repeat(${rhythmColumns}, var(--rhythm-cell-size))` }}>
                  {rhythmCells.map((level, index) => (
                    <span className={`rhythm-cell level-${level}`} key={index} />
                  ))}
                </div>
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
          </section>
        </section>
      </div>
    </section>
  );
}
