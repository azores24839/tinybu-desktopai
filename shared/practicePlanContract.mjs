const questionTypes = new Set(["understanding", "opinion", "personal", "expression"]);

const stringArraySchema = (minItems, maxItems) => ({
  type: "array",
  minItems,
  maxItems,
  items: { type: "string" }
});

export const practicePlanJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["practiceGoal", "whatToCover", "languageBank", "questions"],
  properties: {
    practiceGoal: { type: "string" },
    whatToCover: stringArraySchema(2, 3),
    languageBank: {
      type: "object",
      additionalProperties: false,
      required: ["usefulWords", "usefulChunks"],
      properties: {
        usefulWords: stringArraySchema(5, 8),
        usefulChunks: stringArraySchema(3, 5)
      }
    },
    questions: {
      type: "array",
      minItems: 3,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "question", "relatedFragmentIds", "tipOutline", "tipExample"],
        properties: {
          type: { type: "string", enum: [...questionTypes] },
          question: { type: "string" },
          relatedFragmentIds: { type: "array", items: { type: "string" } },
          tipOutline: { type: "string" },
          tipExample: { type: "string" }
        }
      }
    }
  }
};

export const practicePlanContractInstruction = `Return exactly one JSON object with these fields:
- practiceGoal: a non-empty string containing one concrete conversation mission
- whatToCover: an array of 2-3 non-empty strings
- languageBank: an object with usefulWords (5-8 non-empty strings) and usefulChunks (3-5 non-empty strings)
- questions: an array of 3-5 objects; every object must contain type (understanding, opinion, personal, or expression), question, relatedFragmentIds (string array), tipOutline, and tipExample
Do not rename fields. languageBank must be an object, not an array. Return no markdown or additional fields.`;

function recordOf(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanStringArray(value, path, minItems, maxItems, issues) {
  if (!Array.isArray(value)) {
    issues.push({ path, message: `Expected an array of ${minItems}-${maxItems} strings.` });
    return [];
  }

  const cleaned = value.map(cleanString).filter(Boolean);
  if (cleaned.length < minItems || cleaned.length > maxItems) {
    issues.push({ path, message: `Expected ${minItems}-${maxItems} non-empty strings.` });
  }
  return cleaned.slice(0, maxItems);
}

export function parsePracticePlanCandidate(candidate) {
  const record = recordOf(candidate);
  if (!record) {
    return { ok: false, issues: [{ path: "$", message: "Expected a practice plan object." }] };
  }

  const issues = [];
  let normalized = false;
  const practiceGoal = cleanString(record.practiceGoal);
  if (!practiceGoal) issues.push({ path: "practiceGoal", message: "Expected a non-empty string." });

  let whatToCoverValue = record.whatToCover;
  if (whatToCoverValue === undefined && Array.isArray(record.focusItems)) {
    whatToCoverValue = record.focusItems;
    normalized = true;
  }
  const whatToCover = cleanStringArray(whatToCoverValue, "whatToCover", 2, 3, issues);

  const languageBankRecord = recordOf(record.languageBank);
  if (!languageBankRecord) {
    issues.push({ path: "languageBank", message: "Expected an object with usefulWords and usefulChunks." });
  }
  const usefulWords = cleanStringArray(languageBankRecord?.usefulWords, "languageBank.usefulWords", 5, 8, issues);
  const usefulChunks = cleanStringArray(languageBankRecord?.usefulChunks, "languageBank.usefulChunks", 3, 5, issues);

  if (!Array.isArray(record.questions)) {
    issues.push({ path: "questions", message: "Expected an array of 3-5 question objects." });
  }
  const rawQuestions = Array.isArray(record.questions) ? record.questions : [];
  if (rawQuestions.length < 3 || rawQuestions.length > 5) {
    issues.push({ path: "questions", message: "Expected 3-5 question objects." });
  }
  const questions = rawQuestions.slice(0, 5).map((item, index) => {
    const questionRecord = recordOf(item);
    if (!questionRecord) {
      issues.push({ path: `questions.${index}`, message: "Expected a question object." });
      return null;
    }

    const type = cleanString(questionRecord.type);
    const question = cleanString(questionRecord.question);
    const tipOutline = cleanString(questionRecord.tipOutline);
    const tipExample = cleanString(questionRecord.tipExample);
    if (!questionTypes.has(type)) issues.push({ path: `questions.${index}.type`, message: "Unexpected question type." });
    if (!question) issues.push({ path: `questions.${index}.question`, message: "Expected a non-empty string." });
    if (!tipOutline) issues.push({ path: `questions.${index}.tipOutline`, message: "Expected a non-empty string." });
    if (!tipExample) issues.push({ path: `questions.${index}.tipExample`, message: "Expected a non-empty string." });

    const relatedFragmentIds = Array.isArray(questionRecord.relatedFragmentIds)
      ? questionRecord.relatedFragmentIds.map(cleanString).filter(Boolean)
      : [];
    if (!Array.isArray(questionRecord.relatedFragmentIds)) {
      issues.push({ path: `questions.${index}.relatedFragmentIds`, message: "Expected a string array." });
    }

    return { type, question, relatedFragmentIds, tipOutline, tipExample };
  }).filter(Boolean);

  if (issues.length) return { ok: false, issues };

  return {
    ok: true,
    normalized,
    value: {
      practiceGoal,
      whatToCover,
      languageBank: { usefulWords, usefulChunks },
      questions
    }
  };
}

export function practicePlanIssueSummary(issues) {
  return issues.slice(0, 6).map((issue) => `${issue.path}: ${issue.message}`).join("; ");
}
