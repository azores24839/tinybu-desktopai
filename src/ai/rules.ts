import type {
  AppStateRecord,
  CaptureFragment,
  ChatMessage,
  ContentItem,
  ContentUnderstanding,
  FragmentRecommendationOutput,
  PracticeChatReviewOutput,
  PracticeReviewFeatures,
  PracticePlan,
  QuickPetChatOutput
} from "../types";

const contains = (text: string, part: string) => text.toLowerCase().includes(part.toLowerCase());
const UNWIND_DEMO_TITLE = "My Favorite Ways to Unwind";

function isUnwindDemoTask(task?: { title: string; description: string; targetGoal: string; starterQuestion: string }) {
  return task?.title === UNWIND_DEMO_TITLE;
}

function isUnwindDemoTopic(topicName: string) {
  return topicName === UNWIND_DEMO_TITLE;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function fallbackReviewFeatures(args: { chatMessages: ChatMessage[]; whatToCover: string[]; appState: AppStateRecord }): PracticeReviewFeatures {
  const userMessages = args.chatMessages.filter((message) => message.role === "user");
  const totalWordCount = userMessages
    .map((message) => message.text.split(/\s+/).filter(Boolean).length)
    .reduce((sum, count) => sum + count, 0);
  const score = clampScore(45 + Math.min(30, totalWordCount / 2) + Math.min(20, userMessages.length * 4));
  const label = args.appState.profile.interfaceLanguage === "中文"
    ? score < 60
      ? "开始接住了"
      : score < 80
        ? "表达变清楚了"
        : "很有状态"
    : score < 60
      ? "Starting to hold the thread"
      : score < 80
        ? "Getting clearer"
        : "In a good flow";
  return {
    userTurnCount: userMessages.length,
    totalWordCount,
    averageWordsPerTurn: userMessages.length ? totalWordCount / userMessages.length : 0,
    longestTurnWordCount: totalWordCount,
    shortReplyRatio: userMessages.length && totalWordCount < userMessages.length * 8 ? 1 : 0,
    completedMoveCount: 0,
    targetMoveCount: Math.max(1, args.whatToCover.length),
    hasReason: /because|since|so|因为|所以/i.test(userMessages.map((message) => message.text).join(" ")),
    hasExample: /example|like|比如|例如/i.test(userMessages.map((message) => message.text).join(" ")),
    hasContrast: /but|however|但是|不过/i.test(userMessages.map((message) => message.text).join(" ")),
    hasAction: /will|next|我会|下次/i.test(userMessages.map((message) => message.text).join(" ")),
    usedTargetChunk: false,
    confidence: userMessages.length < 2 || totalWordCount < 30 ? "low" : userMessages.length <= 4 || totalWordCount <= 80 ? "medium" : "high",
    suggestedScore: score,
    suggestedLabel: label,
    dimensionSignals: {
      taskCompletion: score,
      continuity: score,
      development: score,
      control: score,
      interaction: score
    },
    why: [
      {
        quote: userMessages[0]?.text ?? "",
        interpretation: userMessages.length < 2
          ? "This was a short practice, so TinyBu is keeping the judgment light."
          : "TinyBu used your actual practice turns to make this light judgment."
      }
    ],
    segments: []
  };
}

function reviewV2Fallback(args: {
  reviewFeatures?: PracticeReviewFeatures;
  chatMessages: ChatMessage[];
  whatToCover: string[];
  appState: AppStateRecord;
}): Pick<PracticeChatReviewOutput, "taskOutcome" | "reviewScores" | "expressionStatus" | "strength" | "nextFocus" | "why" | "dimensionSignals"> {
  const features = args.reviewFeatures ?? fallbackReviewFeatures(args);
  const firstWhy = features.why[0];
  const hasDevelopment = features.hasReason && features.hasExample;
  const zh = args.appState.profile.interfaceLanguage === "中文";
  const fluency = clampScore(features.dimensionSignals.continuity || features.suggestedScore);
  const naturalness = clampScore(features.dimensionSignals.control || features.suggestedScore);
  const vocabulary = clampScore((features.dimensionSignals.development + features.suggestedScore) / 2);
  const taskDone = features.completedMoveCount >= Math.max(1, Math.ceil(features.targetMoveCount / 2));
  return {
    taskOutcome: {
      label: taskDone ? (zh ? "任务基本完成" : "Mission mostly complete") : (zh ? "任务还可以更完整" : "Mission needs one more step"),
      detail: taskDone
        ? (zh ? "你已经覆盖了这次任务里的关键内容，TinyBu 能接住你的主要意思。" : "You covered the key parts of the mission, so TinyBu could follow your main point.")
        : (zh ? "你开始回应了主题，但还需要多补一个理由、例子或明确结论。" : "You started the topic, but one more reason, example, or clear conclusion would make it complete.")
    },
    reviewScores: {
      fluency,
      naturalness,
      vocabulary
    },
    expressionStatus: {
      score: clampScore((fluency + naturalness + vocabulary) / 3),
      label: features.suggestedLabel,
      confidence: features.confidence
    },
    strength: {
      label: features.hasReason
        ? zh ? "你补出了原因" : "You gave a reason"
        : zh ? "你接住了对话" : "You kept the conversation going",
      detail: features.hasReason
        ? zh ? "你没有停在一个简单回答，而是把原因说出来了。" : "You did not stop at a bare answer; you added why it mattered."
        : zh ? "你回应了练习，也给了 TinyBu 可以继续陪你往下走的内容。" : "You responded to the practice and gave TinyBu something to build on.",
      quote: firstWhy?.quote ?? ""
    },
    nextFocus: {
      type: hasDevelopment ? "continuity" : "idea_development",
      label: hasDevelopment
        ? zh ? "再多接一句" : "Keep the flow going"
        : zh ? "补一个具体例子" : "Add one concrete example",
      detail: hasDevelopment
        ? zh ? "下次可以试着在回答后面再自然多接一句。" : "Next time, try keeping the answer going for one more sentence."
        : zh ? "下次说出主要想法后，补一个自己的细节或例子。" : "Next time, after your main idea, add one personal detail or example.",
      practiceMove: hasDevelopment ? "continue_one_more_sentence" : "add_one_specific_example",
      quote: firstWhy?.quote ?? ""
    },
    why: features.why,
    dimensionSignals: features.dimensionSignals
  };
}

function unwindDemoPracticePlan(args: { fragments: CaptureFragment[]; task: { targetGoal: string; starterQuestion: string } }): PracticePlan {
  const fragmentIds = args.fragments.map((fragment) => fragment.id);

  return {
    practiceGoal: "Help TinyBu understand why your favorite way to unwind works for you.",
    whatToCover: [
      "Name one favorite way to unwind",
      "Describe how it changes your mood or energy",
      "Add one specific detail, like music, tea, walking, or quiet time"
    ],
    languageBank: {
      usefulWords: [
        "unwind",
        "decompress",
        "take my mind off things",
        "clear my head",
        "slow down",
        "feel grounded",
        "a small reset",
        "mentally drained",
        "overwhelmed",
        "comforting",
        "soothing",
        "healing",
        "restorative",
        "low-effort",
        "quiet time",
        "set a boundary",
        "release tension",
        "recharge"
      ],
      usefulChunks: [
        "When I’m feeling ..., I usually reach for ...",
        "I wouldn’t say ..., but ...",
        "It’s not exactly ..., it’s more like ...",
        "What helps me most is not ..., but ...",
        "The thing about ... is that ...",
        "What I like about ... is how ...",
        "For me, ... works better than ... because ...",
        "I tend to ... when I’m ...",
        "I usually need ... before I can ...",
        "It gives me a chance to ... without ...",
        "It helps me shift from ... to ...",
        "It takes my mind off ... for a while.",
        "It helps me feel less ... and more ...",
        "It feels like a small ... after ...",
        "It’s a simple way to ... when ...",
        "There’s something really ... about ...",
        "I find it easier to ... after ...",
        "Once I ..., I usually feel ...",
        "Whenever I’m overwhelmed by ..., I try to ...",
        "Instead of forcing myself to ..., I usually ...",
        "I don’t always need ..., sometimes I just need ...",
        "It may sound small, but ... makes a big difference.",
        "I’m trying to get better at ... before ...",
        "The best kind of relaxation for me is when ...",
        "I like routines that feel ..., but still ...",
        "It doesn’t fix ..., but it helps me ...",
        "I see ... as a way to ..., not just ...",
        "Compared with ..., ... feels more ...",
        "I’m the kind of person who needs ... to ...",
        "By the time I finish ..., I usually feel ..."
      ]
    },
    questions: [
      {
        type: "personal",
        question: args.task.starterQuestion,
        relatedFragmentIds: fragmentIds,
        tipOutline: "Name one routine first, then add a feeling or reason.",
        tipExample: "My favorite way to unwind is listening to soft music near the window."
      },
      {
        type: "personal",
        question: "When do you usually need this kind of quiet time?",
        relatedFragmentIds: fragmentIds,
        tipOutline: "Describe the situation before the routine.",
        tipExample: "When I’m mentally drained after work, I usually need quiet time before I can talk to people."
      },
      {
        type: "expression",
        question: "Can you explain how it helps you feel better?",
        relatedFragmentIds: fragmentIds,
        tipOutline: "Use a shift sentence: from one state to another state.",
        tipExample: "It helps me shift from feeling overwhelmed to feeling calm and grounded."
      },
      {
        type: "expression",
        question: "Can you add one small detail that makes the scene feel personal?",
        relatedFragmentIds: fragmentIds,
        tipOutline: "Mention one sensory detail, like rain, tea, a window, or music.",
        tipExample: "There’s something really soothing about drinking hot tea while it rains outside."
      }
    ]
  };
}

export function understandContentRules(content: ContentItem): ContentUnderstanding {
  const transcriptText = content.transcript.map((line) => line.text).join(" ");
  const firstUsefulLine = content.transcript.find((line) => line.text.trim().length > 12)?.text ?? content.title;

  return {
    topic: content.topic || firstUsefulLine.slice(0, 80),
    summary:
      content.summary ||
      `这段内容主要围绕「${(content.topic || firstUsefulLine).slice(0, 48)}」展开，适合先理解大意再练习表达观点。`,
    keywords:
      content.keywords.length > 0
        ? content.keywords
        : transcriptText
            .split(/\s+/)
            .map((word) => word.replace(/[^\p{L}\p{N}'-]/gu, ""))
            .filter((word) => word.length > 4)
            .slice(0, 6),
    questions:
      content.questions.length > 0
        ? content.questions
        : [
            "What is the main idea of this content?",
            "Do you agree with this idea? Why?",
            "Can you connect this topic to your own life?"
          ],
    suggestedExpressions: content.transcript.slice(0, 3).map((line) => line.text)
  };
}

export function recommendFragmentsRules(fragments: CaptureFragment[]): FragmentRecommendationOutput {
  const recommendedFragmentIds =
    fragments.length <= 6
      ? fragments.map((fragment) => fragment.id)
      : fragments
          .filter((fragment) => {
            const text = fragment.text.toLowerCase();
            return (
              text.includes("think") ||
              text.includes("because") ||
              text.includes("not just") ||
              text.includes("used to") ||
              text.includes("noticed") ||
              text.length > 70
            );
          })
          .slice(0, 6)
          .map((fragment) => fragment.id);

  return {
    recommendedFragmentIds:
      recommendedFragmentIds.length >= 3
        ? recommendedFragmentIds.slice(0, 6)
        : fragments.slice(0, Math.min(6, Math.max(3, fragments.length))).map((fragment) => fragment.id)
  };
}

export function practiceQuestionsRules(args: {
  fragments: CaptureFragment[];
  appState: AppStateRecord;
  task?: { title: string; description: string; targetGoal: string; starterQuestion: string };
}): PracticePlan {
  if (isUnwindDemoTask(args.task) && args.task) {
    return unwindDemoPracticePlan({ fragments: args.fragments, task: args.task });
  }

  const first = args.fragments[0];
  const second = args.fragments[1] ?? first;
  const reusable = args.fragments.find((fragment) => contains(fragment.text, "used to") || contains(fragment.text, "not just"));
  const reusablePattern = reusable
    ? contains(reusable.text, "used to")
      ? "I used to think..., but now I think..."
      : "... is not just about.... It is about..."
    : "I think... because...";

  return {
    practiceGoal: args.task?.targetGoal || "Give a clear personal response",
    whatToCover: [
      "Cover the main point of the topic",
      "Include at least 1 specific detail",
      "Use the target language as much as possible"
    ],
    languageBank: {
      usefulWords: args.fragments.slice(0, 6).map((f) => f.text.split(/\s+/)[0]).filter(Boolean),
      usefulChunks: [
        "The main point is that...",
        "For example, ...",
        "I think... because...",
        "One thing I noticed is..."
      ]
    },
    questions: [
      {
        type: "understanding",
        question: args.task?.starterQuestion || "What is the main idea of this selected part?",
        relatedFragmentIds: first ? [first.id] : [],
        tipOutline: "Start with: This part is mainly about..., then say one simple idea.",
        tipExample: "This part is mainly about changing how we think about learning."
      },
      {
        type: "opinion",
        question: "Do you agree with this idea? Why?",
        relatedFragmentIds: second ? [second.id] : [],
        tipOutline: "Say agree or disagree first, then add one reason with because.",
        tipExample: "I agree with this idea because small practice feels easier to repeat."
      },
      {
        type: "personal",
        question: "Can you connect this idea to your own life?",
        relatedFragmentIds: args.fragments.slice(0, 2).map((fragment) => fragment.id),
        tipOutline: "Mention one real situation, then connect it to the idea.",
        tipExample: "In my own learning, I remember phrases better when I use them in my daily life."
      },
      {
        type: "expression",
        question: `Can you answer using this pattern: "${reusablePattern}"?`,
        relatedFragmentIds: reusable ? [reusable.id] : args.fragments.slice(0, 1).map((fragment) => fragment.id),
        tipOutline: "Keep the same pattern, but replace the blanks with your own experience.",
        tipExample: `I can use this pattern like this: ${reusablePattern.replace("...", "language learning")}`
      }
    ]
  };
}

export function quickPetChatRules(args: { message: string; appState: AppStateRecord }): QuickPetChatOutput {
  const message = args.message.trim();
  if (!message) return { reply: "我在，给我一句话就好。" };
  if (/[?？]|怎么|如何|what|how|why/i.test(message)) {
    return { reply: "可以。先拆成一句主语加动词，再补一个小理由。" };
  }
  if (/[a-zA-Z]/.test(message)) {
    return { reply: "我懂。可以顺手练一句：I think... because..." };
  }
  return { reply: `我在。要不要把这句试着说成${args.appState.profile.targetLanguage}？` };
}

export function practiceChatReviewRules(args: {
  topicName: string;
  practiceGoal: string;
  whatToCover: string[];
  chatMessages: ChatMessage[];
  reviewFeatures?: PracticeReviewFeatures;
  targetLanguage: string;
  nativeLanguage: string;
  appState: AppStateRecord;
}): PracticeChatReviewOutput {
  const reviewV2 = reviewV2Fallback(args);
  if (isUnwindDemoTopic(args.topicName)) {
    const zh = args.appState.profile.interfaceLanguage === "中文";
    return {
      diarySummary:
        zh
          ? "这次对话里，你围绕解压方式做了比较清楚的表达。整体思路是先说明自己喜欢安静、低负担的放松方式，再补充这些方式为什么能让自己慢下来。\n\n表达上，你能够使用具体场景来支撑观点，比如音乐、热茶、夜晚散步这些细节。这样 TinyBu 不只是听到一个偏好，也能理解这个偏好背后的感受。\n\n可以继续优化的是部分英文表达的自然度。下次可以把中文式表达换成更地道的短句，让句子听起来更像真实聊天。"
          : "You practiced explaining how you unwind in a clear, personal way.\n\nYour answer did not stay at a simple preference. You added concrete scenes like soft music, warm tea, and night walks, which made it easier for TinyBu to understand why this way of relaxing works for you.\n\nThe next improvement is expression naturalness. A few phrases can sound more idiomatic if you use shorter, cleaner spoken English.",
      betterExpressions: [
        {
          original: "my head is more clear",
          improved: "My head feels clearer.",
          note: zh ? "Expression：描述头脑变清楚时更自然。" : "Expression: More natural wording for describing mental clarity."
        }
      ],
      savedWordsOrChunks: [
        "unwind",
        "clear my head",
        "feel grounded",
        "healing",
        "When I’m feeling ..., I usually reach for ...",
        "It helps me shift from ... to ...",
        "It doesn’t fix ..., but it helps me ..."
      ],
      memoryTags: [
        "soft music",
        "warm tea",
        "night walks",
        "rainy days",
        "jasmine tea",
        "fruit tea",
        "light comedies",
        "funny cat videos",
        "needs quiet time first",
        "can feel guilty for resting"
      ],
      nextStep: "Next time, gently remind Sisi that rest is not a waste.",
      ...reviewV2
    };
  }

  const userMessages = args.chatMessages.filter((m) => m.role === "user");
  const firstReply = userMessages[0]?.text || "";
  const betterExpressions: PracticeChatReviewOutput["betterExpressions"] = [];
  if (firstReply && firstReply.length > 8) {
    betterExpressions.push({
      original: firstReply,
      improved: firstReply
        .replace("I think is", "I think it is")
        .replace("is very important", "matters a lot"),
      note: "Slightly more natural phrasing"
    });
  }
  return {
    diarySummary: `You practiced talking about ${args.topicName}, focusing on ${args.practiceGoal}.`,
    betterExpressions,
    savedWordsOrChunks: [
      ...args.whatToCover.slice(0, 2),
      "practice makes progress",
      "build on this"
    ].slice(0, 6),
    memoryTags: args.whatToCover.slice(0, 3),
    nextStep: `Next time, try explaining one specific idea from ${args.topicName} with a personal example.`,
    ...reviewV2
  };
}
