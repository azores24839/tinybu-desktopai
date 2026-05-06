import type { UserProfile } from "../types";

export const uiCopy = {
  中文: {
    nav: {
      home: "首页",
      inbox: "收件箱",
      topics: "主题",
      notebook: "表达库",
      memory: "Bu 的记忆",
      settings: "设置"
    },
    home: {
      title: "首页",
      upgrade: "升级",
      suggestion: "Suggestion",
      startPractice: "开始练习",
      continuePractice: "继续练习",
      openTopic: "打开主题",
      organizeNow: "去整理",
      tryFeatured: "试试精选练习",
      defaultObservation: "Bu 为你准备了一道精选练习。",
      defaultPrompt: "今天试着用一个更自然的开头回答问题。",
      memoryPrompt: "今天试着把这个观察转化成一句目标语言回答。",
      activePrefix: "继续上次关于",
      activeSuffix: "的练习。",
      activePrompt: "从还没回答的问题继续，不需要重新开始。",
      topicPrefix: "你有一个新主题可以学习：",
      topicPrompt: "先理解内容，再用自己的话练一次表达。",
      queueTitle: "Learning Queue",
      organize: "待整理",
      study: "待学习",
      practice: "待练习",
      rhythm: "Practice Rhythm"
    },
    settings: {
      title: "设置",
      description: "语言、AI、数据和桌面连接设置。",
      language: "语言",
      interfaceLanguage: "系统语言",
      sourceLanguage: "母语",
      targetLanguage: "目标语言",
      supportStrength: "支持强度",
      save: "保存设置"
    }
  },
  English: {
    nav: {
      home: "Home",
      inbox: "Inbox",
      topics: "Topics",
      notebook: "Notebook",
      memory: "Bu's Memory",
      settings: "Settings"
    },
    home: {
      title: "Home",
      upgrade: "Upgrade",
      suggestion: "Suggestion",
      startPractice: "Start practice",
      continuePractice: "Continue practice",
      openTopic: "Open topic",
      organizeNow: "Organize",
      tryFeatured: "Try featured practice",
      defaultObservation: "Bu picked a featured practice for you.",
      defaultPrompt: "Today, try opening with a more natural answer starter.",
      memoryPrompt: "Today, turn this observation into one answer in your target language.",
      activePrefix: "Continue your practice on",
      activeSuffix: ".",
      activePrompt: "Pick up from the next unanswered question. No need to restart.",
      topicPrefix: "You have a new topic ready:",
      topicPrompt: "Understand it first, then practice saying the idea in your own words.",
      queueTitle: "Learning Queue",
      organize: "To organize",
      study: "To study",
      practice: "To practice",
      rhythm: "Practice Rhythm"
    },
    settings: {
      title: "Settings",
      description: "Language, AI, data, and desktop connection settings.",
      language: "Language",
      interfaceLanguage: "System language",
      sourceLanguage: "Source language",
      targetLanguage: "Target language",
      supportStrength: "Support strength",
      save: "Save Settings"
    }
  }
} satisfies Record<UserProfile["interfaceLanguage"], Record<string, unknown>>;
