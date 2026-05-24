import type {
  ChatMessage,
  PracticeReviewFeatures,
  ReviewConfidence,
  ReviewDimensionSignals,
  ReviewWhyMoment
} from "../../types";

const SEGMENT_USER_TURNS = 4;

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function expressionStatusLabel(score: number, interfaceLanguage: "中文" | "English" = "中文") {
  const zh = interfaceLanguage === "中文";
  if (score < 40) return zh ? "还在热身" : "Warming up";
  if (score < 60) return zh ? "开始接住了" : "Starting to hold the thread";
  if (score < 80) return zh ? "表达变清楚了" : "Getting clearer";
  return zh ? "很有状态" : "In a good flow";
}

export function reviewConfidenceFromFeatures(userTurnCount: number, totalWordCount: number): ReviewConfidence {
  if (userTurnCount < 2 || totalWordCount < 30) return "low";
  if (userTurnCount <= 4 || totalWordCount <= 80) return "medium";
  return "high";
}

function countWords(text: string) {
  const latinWords = text.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g)?.length ?? 0;
  const numbers = text.match(/\b\d+\b/g)?.length ?? 0;
  const cjkChars = text.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  return latinWords + numbers + Math.ceil(cjkChars / 2);
}

function compactText(text: string, max = 170) {
  const compacted = text.replace(/\s+/g, " ").trim();
  if (compacted.length <= max) return compacted;
  return `${compacted.slice(0, max).trim()}...`;
}

function containsAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function chunkSignal(text: string, chunks: string[]) {
  const normalizedText = text.toLowerCase().replace(/\s+/g, " ");
  return chunks.some((chunk) => {
    const normalizedChunk = chunk.toLowerCase().replace(/[.?!…]+/g, "").replace(/\s+/g, " ").trim();
    if (normalizedChunk.length < 4) return false;
    const anchorWords = normalizedChunk
      .split(/\s+/)
      .filter((word) => word.length > 2 && word !== "..." && word !== "___");
    if (normalizedText.includes(normalizedChunk)) return true;
    if (anchorWords.length >= 3) {
      const hits = anchorWords.filter((word) => normalizedText.includes(word)).length;
      return hits >= Math.ceil(anchorWords.length * 0.65);
    }
    return false;
  });
}

function buildSegments(userMessages: ChatMessage[]) {
  const segments: PracticeReviewFeatures["segments"] = [];
  for (let index = 0; index < userMessages.length; index += SEGMENT_USER_TURNS) {
    const text = userMessages
      .slice(index, index + SEGMENT_USER_TURNS)
      .map((message) => message.text)
      .join(" ");
    segments.push({
      index: Math.floor(index / SEGMENT_USER_TURNS),
      text: compactText(text, 360),
      wordCount: countWords(text)
    });
  }
  return segments;
}

function buildWhy(args: {
  userMessages: ChatMessage[];
  totalWordCount: number;
  averageWordsPerTurn: number;
  hasReason: boolean;
  hasExample: boolean;
  usedTargetChunk: boolean;
  isChinese: boolean;
}): ReviewWhyMoment[] {
  const longest = [...args.userMessages].sort((a, b) => countWords(b.text) - countWords(a.text))[0];
  const first = args.userMessages[0];
  const moments: ReviewWhyMoment[] = [];

  if (longest?.text) {
    moments.push({
      quote: compactText(longest.text),
      interpretation: args.hasReason
        ? args.isChinese
          ? "你没有停在一个短回答，而是补出了原因。"
          : "You gave a reason instead of stopping at a short answer."
        : args.isChinese
          ? "这是这次练习里最清楚的一段表达。"
          : "This was your clearest stretch of expression in the practice."
    });
  }

  if (args.hasExample && first?.text && first.id !== longest?.id) {
    moments.push({
      quote: compactText(first.text),
      interpretation: args.isChinese
        ? "你开始把话题连接到一个具体细节或例子。"
        : "You started connecting the topic to a concrete detail or example."
    });
  }

  if (args.usedTargetChunk) {
    moments.push({
      quote: longest?.text ? compactText(longest.text) : "",
      interpretation: args.isChinese
        ? "你尝试调用了这次练习里值得复用的表达。"
        : "You tried to activate a useful chunk from this practice."
    });
  }

  if (!moments.length || args.totalWordCount < 30) {
    moments.push({
      quote: first?.text ? compactText(first.text) : "",
      interpretation: args.isChinese
        ? `这次你开口 ${args.userMessages.length} 次，所以 TinyBu 会把判断放轻一点。`
        : `This practice had ${args.userMessages.length} user turn(s), so TinyBu is keeping the judgment light.`
    });
  } else if (moments.length < 2) {
    moments.push({
      quote: "",
      interpretation: args.isChinese
        ? `这次你大约说了 ${args.totalWordCount} 个词，平均每次开口约 ${Math.round(args.averageWordsPerTurn)} 个词。`
        : `Across the practice, you spoke about ${args.totalWordCount} words with an average of ${Math.round(args.averageWordsPerTurn)} words per turn.`
    });
  }

  return moments.slice(0, 3);
}

export function extractPracticeReviewFeatures(args: {
  messages: ChatMessage[];
  whatToCover: string[];
  completedFocusItemIds?: string[];
  targetChunks?: string[];
  interfaceLanguage?: "中文" | "English";
}): PracticeReviewFeatures {
  const userMessages = args.messages.filter((message) => message.role === "user" && message.text.trim());
  const userText = userMessages.map((message) => message.text).join(" ");
  const userTurnCount = userMessages.length;
  const totalWordCount = countWords(userText);
  const turnWordCounts = userMessages.map((message) => countWords(message.text));
  const averageWordsPerTurn = userTurnCount ? totalWordCount / userTurnCount : 0;
  const longestTurnWordCount = Math.max(0, ...turnWordCounts);
  const shortReplyCount = turnWordCounts.filter((count) => count > 0 && count < 8).length;
  const shortReplyRatio = userTurnCount ? shortReplyCount / userTurnCount : 0;
  const completedMoveCount = args.completedFocusItemIds?.length ?? 0;
  const targetMoveCount = Math.max(1, args.whatToCover.length);
  const hasReason = containsAny(userText, [/\bbecause\b/i, /\bsince\b/i, /\bso\b/i, /因为|原因|所以/]);
  const hasExample = containsAny(userText, [/\bfor example\b/i, /\bfor instance\b/i, /\blike\b/i, /比如|例如|举例/]);
  const hasContrast = containsAny(userText, [/\bbut\b/i, /\bhowever\b/i, /\bon the other hand\b/i, /但是|不过|然而/]);
  const hasAction = containsAny(userText, [/\bi will\b/i, /\bi'm going to\b/i, /\bnext time\b/i, /我会|下次|接下来/]);
  const usedTargetChunk = chunkSignal(userText, args.targetChunks ?? []);

  const taskCompletion = clampScore(35 + (completedMoveCount / targetMoveCount) * 55 + (hasReason ? 5 : 0) + (hasExample ? 5 : 0));
  const continuity = clampScore(30 + Math.min(35, averageWordsPerTurn * 2.4) + Math.min(25, userTurnCount * 4) - shortReplyRatio * 20);
  const development = clampScore(
    25 +
      (hasReason ? 20 : 0) +
      (hasExample ? 22 : 0) +
      (hasContrast ? 12 : 0) +
      (hasAction ? 12 : 0) +
      Math.min(9, longestTurnWordCount / 4)
  );
  const control = clampScore(58 + Math.min(20, averageWordsPerTurn) - shortReplyRatio * 12);
  const interaction = clampScore(42 + Math.min(35, userTurnCount * 5) + (usedTargetChunk ? 10 : 0));
  const dimensionSignals: ReviewDimensionSignals = {
    taskCompletion,
    continuity,
    development,
    control,
    interaction
  };
  const suggestedScore = clampScore(
    taskCompletion * 0.26 + continuity * 0.2 + development * 0.24 + control * 0.14 + interaction * 0.16
  );
  const isChinese = (args.interfaceLanguage ?? "中文") === "中文";
  const confidence = reviewConfidenceFromFeatures(userTurnCount, totalWordCount);
  const suggestedLabel = expressionStatusLabel(suggestedScore, args.interfaceLanguage ?? "中文");

  return {
    userTurnCount,
    totalWordCount,
    averageWordsPerTurn,
    longestTurnWordCount,
    shortReplyRatio,
    completedMoveCount,
    targetMoveCount,
    hasReason,
    hasExample,
    hasContrast,
    hasAction,
    usedTargetChunk,
    confidence,
    suggestedScore,
    suggestedLabel,
    dimensionSignals,
    why: buildWhy({
      userMessages,
      totalWordCount,
      averageWordsPerTurn,
      hasReason,
      hasExample,
      usedTargetChunk,
      isChinese
    }),
    segments: buildSegments(userMessages)
  };
}
