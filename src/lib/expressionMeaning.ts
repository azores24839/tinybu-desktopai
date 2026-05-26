import type { ExpressionRecord } from "../types";

const genericMeaningLabels = new Set([
  "Reusable speaking chunk",
  "Saved from Study Room",
  "Optimized from practice review"
]);

const phraseMeanings: Array<[RegExp, string]> = [
  [/^clear my head$/i, "让脑子清醒一下 / 放空一下，常用来表达从压力或混乱里缓过来。"],
  [/^my head feels clearer\.?$/i, "我的头脑更清醒了。"],
  [/^unwind$/i, "放松下来，尤其是从压力中缓过来。"],
  [/^feel grounded$/i, "感觉稳定、踏实，不再那么焦虑或飘着。"],
  [/^healing$/i, "有疗愈感，让自己慢慢恢复。"],
  [/when i'?m feeling .+ i usually reach for/i, "当我感到某种状态时，我通常会选择某种方式来调整自己。"],
  [/it helps me shift from .+ to/i, "它帮助我从一种状态切换到另一种状态。"],
  [/it doesn'?t fix .+ but it helps me/i, "它不能彻底解决问题，但能帮我缓和或调整。"]
];

const phraseAlternatives: Array<[RegExp, string[]]> = [
  [/^clear my head$/i, ["clear my mind", "reset my brain", "get some mental space"]],
  [/^unwind$/i, ["relax", "decompress", "slow down"]],
  [/^feel grounded$/i, ["feel centered", "feel steady", "feel more present"]],
  [/^my head feels clearer\.?$/i, ["I can think more clearly.", "My mind feels less cluttered.", "I feel more clear-headed."]]
];

const phraseUsageHints: Array<[RegExp, string]> = [
  [/^clear my head$/i, "适合在压力大、脑子乱、想暂停一下整理思路时使用。"],
  [/^my head feels clearer\.?$/i, "适合描述休息、散步、聊天之后思路变清楚的状态。"],
  [/^unwind$/i, "适合聊下班后、学习后、压力后怎么放松。"],
  [/^feel grounded$/i, "适合表达自己从焦虑或混乱中稳定下来。"],
  [/^healing$/i, "适合描述某件事让你恢复能量、情绪被安抚。"]
];

export function inferExpressionMeaning(pattern: string) {
  const trimmed = pattern.trim();
  const matched = phraseMeanings.find(([regex]) => regex.test(trimmed));
  if (matched) return matched[1];
  if (trimmed.includes("...")) return "这是一个可替换句架，把省略号换成你的真实感受、原因或经历。";
  if (trimmed.split(/\s+/).length <= 3) return `“${trimmed}” 的场景表达，需要结合话题来使用。`;
  return "这句话可以作为口语表达直接套用，重点练自然说出来。";
}

export function expressionNativeMeaning(expression: ExpressionRecord) {
  const meaning = expression.meaning.trim();
  if (meaning && !genericMeaningLabels.has(meaning)) return meaning;
  return inferExpressionMeaning(expression.pattern);
}

export function expressionAlternatives(pattern: string) {
  const trimmed = pattern.trim();
  const matched = phraseAlternatives.find(([regex]) => regex.test(trimmed));
  return matched?.[1] ?? [];
}

export function expressionUsageHint(expression: ExpressionRecord) {
  const trimmed = expression.pattern.trim();
  const matched = phraseUsageHints.find(([regex]) => regex.test(trimmed));
  if (matched) return matched[1];
  if (expression.category === "need-practice") return "适合在相似话题里替换原来不自然的说法。";
  if (trimmed.includes("...")) return "适合当作句架，把空位换成你的真实感受、原因或例子。";
  return `适合在「${expression.scene}」这个话题里自然接话或表达观点。`;
}

export function expressionScenarioOptions(expression: ExpressionRecord) {
  return [
    {
      id: "correct",
      text: expressionUsageHint(expression),
      correct: true
    },
    {
      id: "literal",
      text: "只是在解释单词的字面意思，不需要放进真实对话。",
      correct: false
    },
    {
      id: "formal",
      text: "主要用于正式写作或考试作文，不太适合日常口语。",
      correct: false
    }
  ];
}

export function expressionRecallPrompt(expression: ExpressionRecord) {
  const pattern = expression.pattern.trim();
  if (/^clear my head$/i.test(pattern)) return "用英文说一句：我需要散个步，让脑子清醒一下。";
  if (/^unwind$/i.test(pattern)) return "用英文说一句：我通常听音乐来放松。";
  if (/^feel grounded$/i.test(pattern)) return "用英文说一句：安静的时间让我感觉更稳定。";
  if (/^my head feels clearer\.?$/i.test(pattern)) return "用英文说一句：现在我的头脑更清醒了。";
  if (pattern.includes("...")) return `用这个句架造一句自己的话：${pattern}`;
  return `用英文说一句能表达这个意思的话：${expressionNativeMeaning(expression)}`;
}
