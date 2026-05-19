import type {
  AppStateRecord,
  CaptureFragment,
  ChatMessage,
  ContentItem,
  ContentUnderstanding,
  FragmentRecommendationOutput,
  PracticeChatReviewOutput,
  PracticePlan,
  QuickPetChatOutput
} from "../types";

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
  targetLanguage: string;
  nativeLanguage: string;
  appState: AppStateRecord;
}): PracticeChatReviewOutput {
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
    nextStep: `Next time, try explaining one specific idea from ${args.topicName} with a personal example.`
  };
}
