import { ArrowUpRight, BookOpen, Inbox, Sparkles } from "lucide-react";
import type { AppStateRecord, CaptureItem, MemoryItem, PracticeTask, Screen, TopicItem } from "../../types";
import { buildTodayPracticeTasks } from "../practice/practiceTasks";

function taskLabel(task: PracticeTask, isChinese: boolean) {
  if (task.taskType === "capture-based") return isChinese ? "最近看到的内容" : "From your screen";
  if (task.taskType === "memory-review") return isChinese ? "上次表达回访" : "From your memory";
  if (task.taskType === "scenario") return isChinese ? "情境练习" : "Scenario";
  if (task.taskType === "find-material") return isChinese ? "找一个素材" : "Find material";
  return isChinese ? "TinyBu 选的" : "TinyBu pick";
}

export function HomePage({
  appState,
  captures,
  topics,
  memories,
  openInbox,
  openTopic,
  startTask
}: {
  appState: AppStateRecord;
  captures: CaptureItem[];
  topics: TopicItem[];
  memories: MemoryItem[];
  openInbox: () => void;
  openTopic: (topic: TopicItem, next?: Screen) => void;
  upgrade: () => void;
  tryDemo: () => void;
  startTask: (task: PracticeTask) => void;
}) {
  const isChinese = appState.profile.interfaceLanguage === "中文";
  const tasks = buildTodayPracticeTasks({ captures, memories, profile: appState.profile, limit: 3 });
  const latestTopic = [...topics].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];

  return (
    <section className="page home-page">
      <div className="home-focus-layout task-home-layout">
        <section className="task-hero" aria-label={isChinese ? "今日小任务" : "Today tasks"}>
          <div className="task-hero-copy">
            <span className="task-eyebrow">
              <Sparkles size={16} />
              {isChinese ? "今日小任务" : "Today with TinyBu"}
            </span>
            <h1>{isChinese ? "今天想完成哪个小任务？" : "Which small task feels doable today?"}</h1>
            <p>
              {isChinese
                ? "不用先整理资料。选一张卡，TinyBu 会帮你把素材、情境或上次没说顺的表达，变成一次低压力对话。"
                : "No need to organize first. Pick a card and TinyBu will turn a source, scene, or recent memory into a low-pressure practice."}
            </p>
          </div>
          <div className="task-hero-asset" aria-hidden="true">
            <img src="/assets/tinybu-home-hero.png" alt="" onError={(event) => (event.currentTarget.style.display = "none")} />
          </div>
        </section>

        <section className="today-task-panel" aria-label={isChinese ? "可以开始的小任务" : "Tasks to start"}>
          <div className="today-task-heading">
            <h2>{isChinese ? "选一张开始" : "Pick one to start"}</h2>
            <p>{isChinese ? "每次只练一个小表达目标。" : "Each task keeps one small expression goal."}</p>
          </div>
          <div className="today-task-grid">
            {tasks.map((task) => (
              <button className={`today-task-card ${task.taskType}`} key={task.id} onClick={() => startTask(task)}>
                <span className="task-source-label">{taskLabel(task, isChinese)}</span>
                <strong>{task.title}</strong>
                <p>{task.description}</p>
                <span className="task-goal">{task.targetGoal}</span>
                <i>
                  {isChinese ? "开始聊" : "Start"}
                  <ArrowUpRight size={18} />
                </i>
              </button>
            ))}
          </div>
        </section>

        <section className="task-secondary-panel">
          <button className="task-secondary-card" onClick={openInbox}>
            <Inbox size={18} />
            <span>
              <strong>{isChinese ? "查看保存的素材" : "Saved captures"}</strong>
              <em>{isChinese ? `${captures.filter((capture) => capture.status !== "archived").length} 条内容在这里` : `${captures.filter((capture) => capture.status !== "archived").length} items saved`}</em>
            </span>
          </button>
          <button
            className="task-secondary-card"
            onClick={() => (latestTopic ? openTopic(latestTopic, "topic-detail") : openInbox())}
          >
            <BookOpen size={18} />
            <span>
              <strong>{isChinese ? "继续深度学习" : "Continue deeper study"}</strong>
              <em>{latestTopic ? latestTopic.name : isChinese ? "先添加一个素材" : "Add a source first"}</em>
            </span>
          </button>
        </section>
      </div>
    </section>
  );
}
