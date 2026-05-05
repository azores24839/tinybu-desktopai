import type {
  AppStateRecord,
  CaptureFragment,
  ContentItem,
  ContentUnderstanding,
  ExpressionRecord,
  FragmentRecommendationOutput,
  MemoryItem,
  MemoryUpdateOutput,
  MirrorOutput,
  PracticeAnswer,
  PracticeQuestionsOutput,
  PracticeTipOutput,
  PracticeTurnOutput,
  RescueOutput,
  RescueType,
  TalkMessage,
  TalkTurnOutput
} from "../types";
import { nowIso, uid } from "../lib/defaults";

const contains = (text: string, part: string) => text.toLowerCase().includes(part.toLowerCase());

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

export function expressionCardRules(
  sentence: string,
  content: ContentItem,
  appState: AppStateRecord
): Omit<ExpressionRecord, "id" | "capturedAt" | "saved" | "useLater" | "usedInTalk" | "userSentence" | "practiceCount" | "learned" | "category"> {
  const usedToPattern = contains(sentence, "used to think") || contains(sentence, "but now");
  const communicationPattern = contains(sentence, "not just about") || contains(sentence, "it is about");
  const noticedPattern = contains(sentence, "noticed");

  if (usedToPattern) {
    return {
      original: sentence,
      meaning: "我过去以为某件事是这样，但现在我的想法变了。",
      keywords: ["used to think", "but now I think", "what matters"],
      pattern: "I used to think…, but now I think…",
      scene: "用来表达过去想法和现在想法的变化。",
      practiceStem: `I used to think learning ${appState.profile.targetLanguage} was…, but now I think…`,
      sourceTitle: content.title,
      sourceContentId: content.id
    };
  }

  if (communicationPattern) {
    return {
      original: sentence,
      meaning: "某件事不只是 A，更重要的是 B。",
      keywords: ["not just about", "it is about", "communication"],
      pattern: "… is not just about…. It is about…",
      scene: "用来说明一件事真正重要的部分。",
      practiceStem: `Learning ${appState.profile.targetLanguage} is not just about…, it is about…`,
      sourceTitle: content.title,
      sourceContentId: content.id
    };
  }

  if (noticedPattern) {
    return {
      original: sentence,
      meaning: "我先注意到了某个细节。",
      keywords: ["noticed", "before", "small detail"],
      pattern: "I noticed… before I noticed…",
      scene: "用来描述观察、旅行或日常体验里的细节。",
      practiceStem: "When I arrived at…, I noticed… before I noticed…",
      sourceTitle: content.title,
      sourceContentId: content.id
    };
  }

  return {
    original: sentence,
    meaning: "这是一个可以迁移到自己经历里的表达。",
    keywords: sentence
      .split(/\s+/)
      .filter((word) => word.length > 4)
      .slice(0, 4),
    pattern: sentence.replace(/[A-Z][a-z]+|English|productivity|city/g, "…"),
    scene: "用来复述内容或表达自己的想法。",
    practiceStem: "I can use this idea when I talk about…",
    sourceTitle: content.title,
    sourceContentId: content.id
  };
}

export function talkTurnRules(args: {
  answer: string;
  messages: TalkMessage[];
  content: ContentItem;
  expressions: ExpressionRecord[];
  appState: AppStateRecord;
  roundCount: number;
}): TalkTurnOutput {
  const { answer, content, expressions, appState, roundCount } = args;
  const shortAnswer = answer.trim().split(/\s+/).length < 5;
  const capturedPattern = expressions.find((item) => item.useLater || item.saved)?.pattern;
  const gentle = appState.profile.anxiety >= 4 || appState.settings.gentleFeedback;
  const reply = shortAnswer
    ? "I understand. You already have a small clear start."
    : "I understand your point. You connected the content to your own thinking, and that is useful practice.";
  const nudge = shortAnswer
    ? gentle
      ? "You can keep it simple: one idea is enough."
      : "Try adding one reason after “because”."
    : "A more natural opening could be: “I think the main idea is…”";
  const questions = [
    content.questions[1] ?? "Can you say one idea in your own words?",
    content.questions[2] ?? "Do you agree with this idea? Why?",
    content.questions[3] ?? "Can you connect this idea to your own life?",
    capturedPattern
      ? `Can you use “${capturedPattern}” to talk about yourself?`
      : "Can you make one sentence about yourself?"
  ];

  return {
    reply: `${reply} ${nudge}`,
    nextQuestion: questions[Math.min(roundCount, questions.length - 1)],
    shouldSuggestRescue: shortAnswer || appState.profile.anxiety >= 4,
    readyToEnd: roundCount >= 3
  };
}

export function rescueRules(type: RescueType, args: { question: string; appState: AppStateRecord }): RescueOutput {
  const highSupport = args.appState.profile.anxiety >= 4 || args.appState.profile.supportPreference === "Gentle";

  const map: Record<RescueType, string[]> = {
    start: highSupport
      ? ["You can start with: “I think the video is about…”", "中文也可以先想：这个内容主要在说……"]
      : ["Start with: “I think this is about…”"],
    continue: ["You can continue with: “What I mean is…”", "Or add one reason: “because…”"],
    words: ["useful words: agree, surprising, because", "in my experience, I noticed that…"],
    simple: ["Try a simple sentence: “I like this idea because…”"],
    "with-me": ["Say this with me: “I used to think…, but now I think…”"],
    "native-first": [
      "先用中文写下你的想法。",
      "Then TinyBu can help turn it into simple English."
    ]
  };

  return { lines: map[type].slice(0, highSupport ? 3 : 2) };
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
}): PracticeQuestionsOutput {
  const first = args.fragments[0];
  const second = args.fragments[1] ?? first;
  const reusable = args.fragments.find((fragment) => contains(fragment.text, "used to") || contains(fragment.text, "not just"));
  const reusablePattern = reusable
    ? contains(reusable.text, "used to")
      ? "I used to think…, but now I think…"
      : "… is not just about…. It is about…"
    : "I think… because…";

  return {
    questions: [
      {
        type: "understanding",
        question: "What is the main idea of this selected part?",
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
        question: `Can you answer using this pattern: “${reusablePattern}”?`,
        relatedFragmentIds: reusable ? [reusable.id] : args.fragments.slice(0, 1).map((fragment) => fragment.id),
        tipOutline: "Keep the same pattern, but replace the blanks with your own experience.",
        tipExample: `I can use this pattern like this: ${reusablePattern.replace("…", "language learning")}`
      }
    ]
  };
}

export function practiceTipRules(args: {
  question: string;
  tipLevel: number;
  outline: string;
  example: string;
}): PracticeTipOutput {
  return args.tipLevel <= 1
    ? { outline: args.outline, example: "" }
    : { outline: args.outline, example: args.example };
}

export function practiceTurnRules(args: {
  answer: string;
  questionIndex: number;
  appState: AppStateRecord;
}): PracticeTurnOutput {
  const short = args.answer.trim().split(/\s+/).length < 6;
  return {
    encouragement: short ? "Good start." : "Nice, that was clear.",
    response: short
      ? "I can understand your main idea, and one small answer is enough to keep going."
      : "You answered the meaning and connected it to your own thinking."
  };
}

export function reviewRules(args: {
  title: string;
  fragments: CaptureFragment[];
  answers: PracticeAnswer[];
  appState: AppStateRecord;
}): MirrorOutput {
  const firstAnswer = args.answers[0]?.answer || "I think this idea is useful.";
  const selectedText = args.fragments.slice(0, 2).map((fragment) => fragment.text).join(" ");
  const savedBase = expressionCardRules(selectedText || firstAnswer, {
    id: "review-source",
    title: args.title,
    topic: args.title,
    sourceType: "external",
    transcript: args.fragments.map((fragment) => ({ id: fragment.id, text: fragment.text })),
    summary: args.title,
    keywords: ["practice", "review"],
    questions: []
  }, args.appState);

  return {
    talkedAbout: `You practiced talking about ${args.title} and used the selected content to share your own ideas.`,
    didWell: [
      "You answered the questions one by one.",
      "You kept the practice low-pressure and continued even when the answer was short.",
      "You connected at least one idea from the content to speaking practice."
    ],
    naturalExpressions: [
      {
        original: firstAnswer,
        improved:
          firstAnswer.length > 8
            ? firstAnswer
                .replace("English is not only words", "English is not only about words")
                .replace("people work too much", "people are working too much")
            : "I think this idea is useful because it connects to real life."
      }
    ],
    savedExpressions: [savedBase],
    nextPractice: "Next time, choose one saved expression and use it in your first answer."
  };
}

export function mirrorRules(args: {
  sessionTitle: string;
  messages: TalkMessage[];
  expressions: ExpressionRecord[];
  appState: AppStateRecord;
}): MirrorOutput {
  const userMessages = args.messages.filter((message) => message.role === "user");
  const usedPattern = args.expressions.find((item) =>
    userMessages.some((message) => contains(message.text, item.pattern.split("…")[0] || item.original.slice(0, 8)))
  );
  const firstAnswer = userMessages[0]?.text ?? "I think this idea is useful.";
  const naturalExpression =
    firstAnswer.length > 4
      ? firstAnswer
          .replace("people work too much", "people are working too much")
          .replace("English is not only words", "English is not only about words")
      : "I think this idea is useful because it connects to real life.";

  return {
    talkedAbout: `You talked about ${args.sessionTitle.toLowerCase()} and tried to connect the content to your own words.`,
    didWell: [
      "You answered with your own idea.",
      usedPattern ? `You tried to use “${usedPattern.pattern}”.` : "You stayed with the topic and kept going.",
      "You used support when you needed it instead of stopping."
    ],
    naturalExpressions: [
      {
        original: firstAnswer,
        improved: naturalExpression
      }
    ],
    savedExpressions: [
      {
        original: usedPattern?.original ?? firstAnswer,
        meaning: "A useful expression from this practice.",
        keywords: ["practice", "expression"],
        pattern: usedPattern?.pattern ?? `Learning ${args.appState.profile.targetLanguage} is not just about…, it is about…`,
        scene: "Use it in future speaking practice.",
        practiceStem: usedPattern?.practiceStem ?? `Learning ${args.appState.profile.targetLanguage} is not just about…, it is about…`
      }
    ],
    nextPractice: "Next time, try using one captured phrase in your first answer."
  };
}

export function memoryUpdateRules(args: {
  mirror: MirrorOutput;
  expressions: ExpressionRecord[];
  rescueUsed?: RescueType[];
  appState: AppStateRecord;
}): MemoryUpdateOutput {
  const memories: MemoryItem[] = [
    {
      id: uid("memory"),
      type: "interest",
      title: "内容兴趣",
      body: "你喜欢用真实内容练表达，尤其适合从短视频或 transcript 开始。",
      editable: true,
      updatedAt: nowIso()
    },
    {
      id: uid("memory"),
      type: "expression",
      title: "表达记忆",
      body:
        args.expressions[0]?.pattern ??
        "你正在练习把看到的表达换到自己的生活里。",
      editable: true,
      updatedAt: nowIso()
    },
    {
      id: uid("memory"),
      type: "support",
      title: "支架偏好",
      body: args.rescueUsed?.length
        ? `你这次使用了 ${args.rescueUsed.length} 次支架，TinyBu 会继续给短而温和的提示。`
        : "你这次没有使用支架，TinyBu 仍会把问题保持简单。",
      editable: true,
      updatedAt: nowIso()
    },
    {
      id: uid("memory"),
      type: "next",
      title: "下次建议",
      body: args.mirror.nextPractice,
      editable: true,
      updatedAt: nowIso()
    }
  ];

  if (args.appState.profile.anxiety >= 4) {
    memories.push({
      id: uid("memory"),
      type: "anxiety",
      title: "温和支架",
      body: "TinyBu 会先问更容易的问题，并给你更完整的开头。",
      editable: true,
      updatedAt: nowIso()
    });
  }

  return { memories };
}
