import { useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import { ArrowUpRight, BookMarked, CheckCircle2, ChevronDown, Gift, Phone, Plus, Sparkles } from "lucide-react";
import type { AppStateRecord, CaptureItem, MemoryItem, PracticeTask, Screen, TopicItem } from "../../types";
import { captureText } from "../captures/captureUtils";
import { MaterialLibraryPanel, type MaterialKind } from "../captures/MaterialLibraryPanel";
import { buildTodayPracticeTasks } from "../practice/practiceTasks";

type ConversationMode = "casual" | "roleplay" | "retell";

function topicTag(task: PracticeTask, isChinese: boolean) {
  if (task.taskType === "capture-based") return isChinese ? "素材内容" : "Source-based";
  if (task.taskType === "memory-review") return isChinese ? "回访练习" : "Memory";
  if (task.taskType === "scenario") return isChinese ? "情境模拟" : "Roleplay";
  if (task.taskType === "open-chat") return isChinese ? "轻松聊聊" : "Easy chat";
  if (task.taskType === "find-material") return isChinese ? "找素材" : "Find source";
  return isChinese ? "观点话题" : "Topic";
}

type DailyMission = {
  id: string;
  title: string;
  detail: string;
  completed: boolean;
  actionLabel: string;
  rewardLabel: string;
  action: () => void;
};

function modeCopy(mode: ConversationMode, isChinese: boolean) {
  const labels = {
    casual: {
      label: isChinese ? "随便聊聊" : "Easy chat",
      description: isChinese ? "像朋友一样轻松表达想法。" : "Express ideas casually, like talking to a friend.",
      goal: isChinese ? "轻松说出一个真实想法" : "Express one real thought casually",
      question: isChinese ? "你想从哪一点开始聊？可以先用中文说。" : "Where do you want to start? You can begin in your own language."
    },
    roleplay: {
      label: isChinese ? "情境模拟" : "Roleplay",
      description: isChinese ? "进入一个角色扮演场景。" : "Enter a roleplay scene.",
      goal: isChinese ? "在情境里完成一次自然表达" : "Complete one natural expression in a scenario",
      question: isChinese ? "我们进入这个场景。你第一句会怎么开口？" : "Let's enter the scene. What would you say first?"
    },
    retell: {
      label: isChinese ? "理解复述" : "Understand & retell",
      description: isChinese ? "适合文章、视频、新闻、科普或领域内容。" : "For articles, videos, news, explainers, or field topics.",
      goal: isChinese ? "抓住重点，并用自己的话说出来" : "Catch the main point and say it in your own words",
      question: isChinese ? "这段内容主要在说什么？你可以先用自己的话讲一遍。" : "What is this mainly about? Try retelling it in your own words first."
    }
  };
  return labels[mode];
}

function makeInputTask(args: {
  text: string;
  fileName: string;
  fileText: string;
  mode: ConversationMode;
  isChinese: boolean;
}): PracticeTask {
  const mode = modeCopy(args.mode, args.isChinese);
  const source = [args.text, args.fileName ? `${args.isChinese ? "上传资料" : "Uploaded source"}: ${args.fileName}` : "", args.fileText]
    .filter(Boolean)
    .join("\n\n")
    .trim();
  const fallbackTitle = args.isChinese ? "我们聊聊这个" : "Let's talk about this";
  const titleSeed = args.text || args.fileName || fallbackTitle;
  return {
    id: `task-input-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    title: titleSeed.slice(0, 52),
    description: mode.description,
    taskType: args.mode === "roleplay" ? "scenario" : args.mode === "retell" ? "tinybu-material" : "open-chat",
    sourceText: source || mode.description,
    targetGoal: mode.goal,
    starterQuestion: mode.question,
    status: "new",
    createdAt: new Date().toISOString()
  };
}

export function HomePage({
  appState,
  captures,
  memories,
  openInbox,
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
  const [tasksOpen, setTasksOpen] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  const [inputDraft, setInputDraft] = useState("");
  const [mode, setMode] = useState<ConversationMode>("casual");
  const [materialLibraryOpen, setMaterialLibraryOpen] = useState(false);
  const [materialLibraryKind, setMaterialLibraryKind] = useState<MaterialKind>("text");
  const [fileName, setFileName] = useState("");
  const [fileText, setFileText] = useState("");
  const isChinese = appState.profile.interfaceLanguage === "中文";
  const tasks = useMemo(
    () => buildTodayPracticeTasks({ captures, memories, profile: appState.profile, limit: 6 }),
    [captures, memories, appState.profile]
  );
  const topicCards = tasks.filter((task) => task.taskType !== "find-material").slice(0, 3);
  const hasTodayCapture = captures.some((capture) => {
    const capturedAt = new Date(capture.capturedAt);
    const now = new Date();
    return capture.status !== "archived" && capturedAt.toDateString() === now.toDateString();
  });
  const hasVideoCapture = captures.some((capture) => capture.sourceKind === "youtube" || capture.sourceKind === "video");
  const hasArticleCapture = captures.some((capture) => capture.sourceKind === "article" || capture.sourceKind === "selection");
  const missions: DailyMission[] = [
    {
      id: "check-in",
      title: isChinese ? "每日签到" : "Daily check-in",
      detail: isChinese ? "选一张话题卡，和 TinyBu 说几句。" : "Pick a topic card and say a few lines.",
      completed: memories.length > 0,
      actionLabel: isChinese ? "去完成" : "Go",
      rewardLabel: isChinese ? "领取" : "Claim",
      action: () => topicCards[0] && startTask(topicCards[0])
    },
    {
      id: "youtube",
      title: isChinese ? "在 YouTube 捕捉视频" : "Capture a YouTube video",
      detail: isChinese ? "保存一段字幕或视频观点，让它变成话题。" : "Save a caption or idea and turn it into a topic.",
      completed: hasVideoCapture,
      actionLabel: isChinese ? "去完成" : "Go",
      rewardLabel: isChinese ? "领取" : "Claim",
      action: openInbox
    },
    {
      id: "article",
      title: isChinese ? "捕捉一篇文章报道" : "Capture one article",
      detail: isChinese ? "复制文章里的一个观点，TinyBu 会帮你练表达。" : "Copy one idea from an article for expression practice.",
      completed: hasArticleCapture || hasTodayCapture,
      actionLabel: isChinese ? "去完成" : "Go",
      rewardLabel: isChinese ? "领取" : "Claim",
      action: openInbox
    }
  ];
  const currentMode = modeCopy(mode, isChinese);

  function handleStartFromInput() {
    const text = inputDraft.trim();
    if (!text && !fileName) return;
    startTask(makeInputTask({ text, fileName, fileText, mode, isChinese }));
    setInputDraft("");
    setFileName("");
    setFileText("");
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setFileName(file.name);
    if (file.type.startsWith("text/") || /\.(txt|md|csv|json|srt|vtt)$/i.test(file.name)) {
      setFileText((await file.text()).slice(0, 4000));
    } else {
      setFileText("");
    }
  }

  function selectMaterial(capture: CaptureItem) {
    const text = captureText(capture).trim();
    const title = capture.title || (isChinese ? "素材库内容" : "Material library source");
    setFileName(title);
    setFileText(text.slice(0, 4000));
    setMode("retell");
    setMaterialLibraryOpen(false);
    if (!inputDraft.trim()) {
      setInputDraft(title);
    }
  }

  return (
    <section className="page home-page clean-home-page">
      <div className="clean-home-surface">
        <header className="clean-home-topbar">
          <div className="daily-task-menu">
            <button className="daily-task-trigger" onClick={() => setTasksOpen((open) => !open)}>
              <Gift size={16} />
              {isChinese ? "今日任务" : "Daily tasks"}
              <ChevronDown size={15} />
            </button>
            {tasksOpen && (
              <div className="daily-task-popover">
                {missions.map((mission) => (
                  <button key={mission.id} className={mission.completed ? "completed" : ""} onClick={mission.completed ? undefined : mission.action}>
                    <span>{mission.completed ? <CheckCircle2 size={14} /> : <Sparkles size={14} />}{mission.title}</span>
                    <strong>{mission.detail}</strong>
                    <em>{mission.completed ? mission.rewardLabel : mission.actionLabel}</em>
                  </button>
                ))}
              </div>
            )}
          </div>
        </header>

        <main className="clean-home-main">
          <h1>{isChinese ? "今天想聊点什么？" : "What shall we talk about today?"}</h1>

          <div className="topic-recommend-row" aria-label={isChinese ? "话题推荐" : "Topic recommendations"}>
            {topicCards.map((task, index) => (
              <button
                className={`topic-recommend-card tilt-${index}`}
                key={task.id}
                onClick={() => startTask(task)}
              >
                <span className="topic-card-tag">{topicTag(task, isChinese)}</span>
                <strong>{task.title}</strong>
                <p>{task.description}</p>
                <i>
                  {isChinese ? "开始聊" : "Start"}
                  <ArrowUpRight size={16} />
                </i>
              </button>
            ))}
          </div>

          <section className="conversation-start-box" aria-label={isChinese ? "开始对话" : "Start conversation"}>
            <textarea
              value={inputDraft}
              onChange={(event) => setInputDraft(event.target.value)}
              placeholder={currentMode.description}
              rows={2}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  handleStartFromInput();
                }
              }}
            />
            {fileName && <span className="attached-file">{fileName}</span>}
            <div className="conversation-start-toolbar">
              <label className="start-tool-button" aria-label={isChinese ? "上传资料" : "Upload source"}>
                <Plus size={20} />
                <input type="file" accept="image/*,.pdf,.txt,.md,.csv,.json,.srt,.vtt" onChange={handleFileChange} />
              </label>
              <div className="mode-picker">
                <button className="mode-picker-trigger" onClick={() => setModeOpen((open) => !open)}>
                  {currentMode.label}
                  <ChevronDown size={16} />
                </button>
                {modeOpen && (
                  <div className="mode-picker-menu">
                    {(["casual", "roleplay", "retell"] as ConversationMode[]).map((item) => {
                      const itemCopy = modeCopy(item, isChinese);
                      return (
                        <button
                          key={item}
                          className={mode === item ? "active" : ""}
                          onClick={() => {
                            setMode(item);
                            setModeOpen(false);
                          }}
                        >
                          <strong>{itemCopy.label}</strong>
                          <span>{itemCopy.description}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <button className="start-tool-button material-picker-button" onClick={() => setMaterialLibraryOpen((open) => !open)} aria-label={isChinese ? "选择素材" : "Choose source"}>
                <BookMarked size={19} />
              </button>
              <button className="start-send-button" onClick={handleStartFromInput} disabled={!inputDraft.trim() && !fileName}>
                <Phone size={18} />
              </button>
            </div>
            {materialLibraryOpen && (
              <MaterialLibraryPanel
                captures={captures}
                isChinese={isChinese}
                activeKind={materialLibraryKind}
                setActiveKind={setMaterialLibraryKind}
                close={() => setMaterialLibraryOpen(false)}
                openCapture={selectMaterial}
              />
            )}
          </section>
        </main>
      </div>
    </section>
  );
}
