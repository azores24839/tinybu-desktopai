import type { CaptureFragment, CaptureItem, MemoryItem, PracticeTask, UserProfile } from "../../types";

const MIN_PRACTICE_TEXT_LENGTH = 40;
const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const nowIso = () => new Date().toISOString();

function compactText(text: string, max = 360) {
  return text.replace(/\s+/g, " ").trim().slice(0, max);
}

function capturePracticeText(capture: CaptureItem) {
  return (
    capture.extractedText ||
    capture.sourceText ||
    capture.fragments.map((fragment) => fragment.text).join(" ") ||
    capture.summary ||
    ""
  );
}

function taskLabelSeed(language: UserProfile["interfaceLanguage"]) {
  const zh = language === "中文";
  return {
    captureTitle: zh ? "聊聊你刚刚看到的内容" : "Talk about what you just saw",
    captureDescription: zh ? "TinyBu 会帮你先抓住重点，再把你的看法说出来。" : "TinyBu will help you catch the point and say your view.",
    captureGoal: zh ? "让 TinyBu 听懂你对这段内容的一个真实看法" : "Help TinyBu understand one real opinion you have about this",
    captureQuestion: zh ? "这段内容里，哪一点最让你想回应？" : "What part of this makes you want to respond?",
    memoryTitle: zh ? "换个场景再说一次" : "Try it again in a new scene",
    memoryDescription: zh ? "把上次没说顺的表达，放进一个新情境里轻轻复现。" : "Reuse a recent expression in a new, low-pressure context.",
    memoryGoal: zh ? "把上次那句话换成你自己的新例子说给 TinyBu 听" : "Tell TinyBu a new personal example using one expression from last time",
    tinybuTitle: zh ? "TinyBu 给你挑的小材料" : "A small pick from TinyBu",
    tinybuDescription: zh ? "不是教材题，先读一个小观点，再说说你怎么看。" : "Read one small idea, then say what you think.",
    tinybuGoal: zh ? "说服 TinyBu 理解你同意或不同意的原因" : "Make TinyBu understand why you agree or disagree",
    tinybuQuestion: zh ? "你同意这个观点吗？为什么？" : "Do you agree with this idea? Why?",
    scenarioTitle: zh ? "今天的情境练习" : "Today's small scenario",
    scenarioDescription: zh ? "练一个真实会遇到的表达场景，不追求完美。" : "Practice a real-life moment without aiming for perfect.",
    scenarioGoal: zh ? "让 TinyBu 明白你今天的状态，以及你接下来想怎么做" : "Help TinyBu understand how you feel today and what you want to do next",
    scenarioQuestion: zh ? "如果你今天状态有点累，但还想继续，你会怎么说？" : "How would you say you feel tired but still want to keep going?",
    openChatTitle: zh ? "最近有什么让你有点在意？" : "What has been on your mind lately?",
    openChatDescription: zh ? "不用准备素材，先随便说一点，TinyBu 会帮你接成外语表达。" : "No source needed. Say a little first, and TinyBu will help shape it into the target language.",
    openChatGoal: zh ? "让 TinyBu 听懂你最近在意的一件小事" : "Help TinyBu understand one small thing on your mind",
    openChatQuestion: zh ? "最近有没有一件小事，让你有点想解释、分享或吐槽？" : "Is there one small thing you want to explain, share, or react to?",
    findTitle: zh ? "去找一个可以聊的小素材" : "Find one small thing to talk about",
    findDescription: zh ? "截图或复制一个你想吐槽、好奇、想解释给别人的内容。" : "Capture something you want to react to, question, or explain.",
    findGoal: zh ? "发现一个真实语境里的表达机会" : "Notice one expression opportunity from real context",
    findQuestion: zh ? "找到后，把它丢给 TinyBu，我们再开始聊。" : "Capture it first, then TinyBu will turn it into a practice."
  };
}

export function isCapturePracticeReady(capture: CaptureItem) {
  if (capture.status === "archived" || capture.status === "needs_review") return false;
  return compactText(capturePracticeText(capture)).length >= MIN_PRACTICE_TEXT_LENGTH;
}

export function buildPracticeTaskFromCapture(capture: CaptureItem, profile: UserProfile): PracticeTask | null {
  if (!isCapturePracticeReady(capture)) return null;
  const copy = taskLabelSeed(profile.interfaceLanguage);
  const text = compactText(capturePracticeText(capture));
  return {
    id: `task-capture-${capture.id}`,
    title: capture.topic || capture.title || copy.captureTitle,
    description: capture.summary || copy.captureDescription,
    taskType: "capture-based",
    sourceText: text,
    sourceCaptureId: capture.id,
    targetGoal: copy.captureGoal,
    starterQuestion: capture.questions?.[0] || copy.captureQuestion,
    status: "new",
    createdAt: capture.capturedAt
  };
}

export function buildTodayPracticeTasks(args: {
  captures: CaptureItem[];
  memories: MemoryItem[];
  profile: UserProfile;
  limit?: number;
}): PracticeTask[] {
  const copy = taskLabelSeed(args.profile.interfaceLanguage);
  const createdAt = nowIso();
  const tasks: PracticeTask[] = [];
  const recentCapture = [...args.captures]
    .sort((a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime())
    .find(isCapturePracticeReady);
  const captureTask = recentCapture ? buildPracticeTaskFromCapture(recentCapture, args.profile) : null;
  if (captureTask) tasks.push(captureTask);

  const memory = [...args.memories]
    .filter((item) => item.type === "next" || item.type === "expression" || item.type === "support")
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
  if (memory) {
    tasks.push({
      id: `task-memory-${memory.id}`,
      title: memory.title || copy.memoryTitle,
      description: memory.body || copy.memoryDescription,
      taskType: "memory-review",
      targetGoal: copy.memoryGoal,
      starterQuestion: args.profile.interfaceLanguage === "中文" ? "这次换一个自己的例子，你想怎么说？" : "Can you try it again with a new example from your life?",
      status: "new",
      createdAt: memory.updatedAt
    });
  }

  tasks.push({
    id: "task-tinybu-material-default",
    title: "My Favorite Ways to Unwind",
    description:
      args.profile.interfaceLanguage === "中文"
        ? "Demo：聊聊你平时如何从压力中缓过来。"
        : "Demo: Talk about how you decompress and feel like yourself again.",
    taskType: "tinybu-material",
    sourceText:
      "When I feel stressed, I usually don’t want anything too exciting. I prefer quiet, low-effort routines that help me slow down. For example, I might listen to soft music, drink hot tea near the window, or go for a short walk at night. These things don’t solve my problems directly, but they help me clear my head and feel grounded again. Sometimes I just need a small reset before I can face everything.",
    targetGoal:
      args.profile.interfaceLanguage === "中文"
        ? "让 TinyBu 理解并认同你最喜欢的一种解压方式"
        : "Get TinyBu to understand and agree with your favorite way to unwind",
    starterQuestion: "What’s your favorite way to relieve stress?",
    status: "new",
    createdAt
  });

  tasks.push({
    id: "task-scenario-default",
    title: args.profile.interfaceLanguage === "中文" ? "跟同事解释：今天状态不太好" : "Explain to a coworker that today is a bit rough",
    description: args.profile.interfaceLanguage === "中文" ? "练习温和地说明状态、原因和你接下来会怎么做。" : "Practice explaining your state, the reason, and what you will do next.",
    taskType: "scenario",
    targetGoal: copy.scenarioGoal,
    starterQuestion: copy.scenarioQuestion,
    status: "new",
    createdAt
  });

  tasks.push({
    id: "task-open-chat-default",
    title: copy.openChatTitle,
    description: copy.openChatDescription,
    taskType: "open-chat",
    targetGoal: copy.openChatGoal,
    starterQuestion: copy.openChatQuestion,
    status: "new",
    createdAt
  });

  tasks.push({
    id: "task-find-material-default",
    title: copy.findTitle,
    description: copy.findDescription,
    taskType: "find-material",
    targetGoal: copy.findGoal,
    starterQuestion: copy.findQuestion,
    status: "new",
    createdAt
  });

  const seen = new Set<string>();
  return tasks.filter((task) => {
    if (seen.has(task.id)) return false;
    seen.add(task.id);
    return true;
  }).slice(0, args.limit ?? 3);
}

export function practiceTaskToFragments(task: PracticeTask): CaptureFragment[] {
  const text = compactText([task.sourceText, task.description, task.starterQuestion].filter(Boolean).join(" "));
  return [
    {
      id: `${task.id}-fragment`,
      text,
      selected: true,
      recommended: true,
      sourceIndex: 0
    }
  ];
}
