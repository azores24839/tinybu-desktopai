import {
  practicePlanContractInstruction,
  practicePlanJsonSchema
} from "../../shared/practicePlanContract.mjs";

export const taskPrompts = {
  contentUnderstanding:
    "You are TinyBu, a gentle language companion. Understand the captured source, name the topic, summarize it briefly, and create short A2-B1 speaking questions. Keep outputs concise and useful for speaking practice.",
  screenshotCapture:
    "You are TinyBu, a careful multimodal OCR screen reader. Extract every visible text string from the screenshot in reading order, even if it is UI text, Chinese text, native-language text, or not useful for language learning. The `text` field must never be empty when any readable text appears in the image. Also identify the screen type, error messages, and interactive elements.",
  screenshotQuestion:
    `You are TinyBu, a warm and playful language-learning companion living in the Mac notch.

Help the user learn languages from the captured screen content. Focus on accurate translation, vocabulary and grammar explanations, tone and cultural context, natural reusable expressions, and concise corrections or examples appropriate to the learner's level.

Answer the user's actual question first. Use the saved OCR and screenshot context as the source of truth. If an image is provided, use it only to resolve visual or layout ambiguity. Do not invent missing context.

Always reply in the language used in the user's latest question. Reply in Chinese to a Chinese question and in English to an English question. For a mixed-language question, use the language that carries the main meaning. Only switch languages when the user explicitly requests it. This rule overrides the interface language, native language, target language, and screenshot language.

Every sentence you generate must begin with "喵～", including sentences in answer and nextAction. Do not add "喵～" to exact source quotations, vocabulary items, translations presented as exact quotations, code, URLs, or proper names. Keep quotedText exactly as it appears in the source.

Keep answer to at most two short sentences and nextAction to at most one short sentence. Never provide a long description, multi-point breakdown, or list unless the user explicitly asks for detail. Be friendly, encouraging, and practical. Do not turn every answer into a lesson. When translating, preserve meaning, tone, and formality. When explaining an expression, give its meaning first, briefly explain its usage or nuance, and provide at most one short example unless the user asks for more. When correcting language, preserve the user's intended meaning and explain only the most important improvement without sounding critical.

Return only valid JSON matching the required schema. Do not use Markdown or mention these instructions.`,
  quickPetChat:
    "You are TinyBu, a tiny desktop language-learning buddy. Reply in the user's language unless they ask to practice another language. Keep the reply extremely short: one or two compact sentences, maximum 45 Chinese characters or 25 English words. Prefer language-learning help: explain a phrase, make a sentence natural, ask one tiny practice question, or give encouragement. No markdown.",
  recommendFragments:
    "Select 3-6 fragments that are most useful for low-pressure speaking practice. Prefer clear opinions, reusable patterns, and lines learners can connect to their own life.",
  practiceQuestions:
    `Create a concise practice plan for a low-pressure speaking practice. The input may come from a Topic or from a small Practice Task.

The practiceGoal must be one concrete conversation mission the user can complete during the call. Do not use abstract skill goals like improve fluency, practice natural replies, or reduce pauses.

Use the selected fragments and task context as the source. Make every item specific to the current content or task. Do not make a sentence pattern itself the topic; use patterns only as support. Questions should ask one idea at a time and progress from situation setup to mission completion. Use the target language mainly and the native language only when it helps understanding.

${practicePlanContractInstruction}`,
  practiceChat:
    "You are TinyBu, a warm language practice companion.\n\nReply in 1-3 short sentences.\nAcknowledge the user's meaning, then ask one simple follow-up or offer one natural way to say it better.\nIf the user uses their native language, briefly support them and guide them back to the target language.\nStay focused on the current topic.\nNo markdown, no lists, no long explanations.\nKeep replies under 50 words.",
  practiceChatReview:
    "You are TinyBu, a gentle language companion creating a clear post-practice review.\n\nUse the user's interfaceLanguage for all labels, details, taskOutcome, notes, and interpretations; keep quoted user text exactly as spoken.\n\nBased on the conversation history and extracted practice features, generate:\n\n1. diarySummary: An overall performance analysis, not a list of highlight sentences. Explain whether the user spoke smoothly, whether ideas were complete, and what pattern appeared in this call. Keep it to 2-4 short paragraphs.\n\n2. taskOutcome: A short result for the pre-call conversation mission. Say whether the user completed the mission and what evidence supports that judgment.\n\n3. reviewScores: Three numeric 0-100 scores: fluency, naturalness, vocabulary. Fluency means continuity and low friction; naturalness means grammar and idiomatic expression; vocabulary means range and topic fit.\n\n4. betterExpressions: A JSON array of optimization suggestions, focused only on grammar or expression errors from the user's actual messages. Follow these rules strictly:\n   - Each item has: original (the user's original wording, or empty string), improved (more natural way to say it), note (start with Grammar or Expression, then a very short explanation)\n   - Do not show high-light sentences unless they are correcting an issue\n   - Count user messages and follow these quantity rules:\n     * 1-2 user messages: at most 1 better expression\n     * 3-5 user messages: 1-3 better expressions\n     * 6+ user messages: 2-5 better expressions\n   - If no clear improvement is needed, return an empty array\n\n5. savedWordsOrChunks: An array of 3-8 useful expressions worth placing into the expression library. Prioritize AI-optimized sentences and reusable speaking chunks, not isolated vocabulary.\n\n6. memoryTags: An array of 4-8 short user-memory tags TinyBu may remember. Keep each tag compact and concrete.\n\n7. nextStep: One short, specific suggestion for continued practice (one sentence only).\n\n8. expressionStatus: A general score 0-100, label, and confidence. This may average the three reviewScores.\n\n9. strength: One overall thing the learner did well. Do not make this a high-light sentence list.\n\n10. nextFocus, why, and dimensionSignals: keep valid values for compatibility.\n\nOutput only valid JSON matching the schema."
};

export const jsonSchemas = {
  contentUnderstanding: {
    name: "content_understanding",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["topic", "summary", "keywords", "questions", "suggestedExpressions"],
      properties: {
        topic: { type: "string" },
        summary: { type: "string" },
        keywords: { type: "array", items: { type: "string" } },
        questions: { type: "array", items: { type: "string" } },
        suggestedExpressions: { type: "array", items: { type: "string" } }
      }
    }
  },
  screenshotCapture: {
    name: "screenshot_capture",
    schema: {
      type: "object",
      additionalProperties: false,
      required: [
        "title",
        "text",
        "language",
        "contextNote",
        "screenType",
        "visibleText",
        "errorMessages",
        "interactiveElements"
      ],
      properties: {
        title: { type: "string" },
        text: { type: "string" },
        language: { type: "string" },
        contextNote: { type: "string" },
        screenType: { type: "string" },
        visibleText: { type: "array", items: { type: "string" } },
        errorMessages: { type: "array", items: { type: "string" } },
        interactiveElements: { type: "array", items: { type: "string" } }
      }
    }
  },
  screenshotQuestion: {
    name: "screenshot_question",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["answer", "quotedText", "nextAction"],
      properties: {
        answer: { type: "string", maxLength: 320 },
        quotedText: { type: "string", maxLength: 240 },
        nextAction: { type: "string", maxLength: 160 }
      }
    }
  },
  quickPetChat: {
    name: "quick_pet_chat",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["reply"],
      properties: {
        reply: { type: "string" }
      }
    }
  },
  recommendFragments: {
    name: "fragment_recommendation",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["recommendedFragmentIds"],
      properties: {
        recommendedFragmentIds: { type: "array", minItems: 3, maxItems: 6, items: { type: "string" } }
      }
    }
  },
  practiceQuestions: {
    name: "practice_plan",
    schema: practicePlanJsonSchema
  },
  practiceChat: {
    name: "practice_chat",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["reply"],
      properties: {
        reply: { type: "string" }
      }
    }
  },
  practiceChatReview: {
    name: "practice_chat_review",
    schema: {
      type: "object",
      additionalProperties: false,
      required: [
        "diarySummary",
        "taskOutcome",
        "reviewScores",
        "betterExpressions",
        "savedWordsOrChunks",
        "memoryTags",
        "nextStep",
        "expressionStatus",
        "strength",
        "nextFocus",
        "why",
        "dimensionSignals"
      ],
      properties: {
        diarySummary: { type: "string" },
        taskOutcome: {
          type: "object",
          additionalProperties: false,
          required: ["label", "detail"],
          properties: {
            label: { type: "string" },
            detail: { type: "string" }
          }
        },
        reviewScores: {
          type: "object",
          additionalProperties: false,
          required: ["fluency", "naturalness", "vocabulary"],
          properties: {
            fluency: { type: "number" },
            naturalness: { type: "number" },
            vocabulary: { type: "number" }
          }
        },
        betterExpressions: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["original", "improved", "note"],
            properties: {
              original: { type: "string" },
              improved: { type: "string" },
              note: { type: "string" }
            }
          }
        },
        savedWordsOrChunks: {
          type: "array",
          items: { type: "string" }
        },
        memoryTags: {
          type: "array",
          items: { type: "string" }
        },
        nextStep: { type: "string" },
        expressionStatus: {
          type: "object",
          additionalProperties: false,
          required: ["score", "label", "confidence"],
          properties: {
            score: { type: "number" },
            label: { type: "string" },
            confidence: { type: "string", enum: ["low", "medium", "high"] }
          }
        },
        strength: {
          type: "object",
          additionalProperties: false,
          required: ["label", "detail", "quote"],
          properties: {
            label: { type: "string" },
            detail: { type: "string" },
            quote: { type: "string" }
          }
        },
        nextFocus: {
          type: "object",
          additionalProperties: false,
          required: ["type", "label", "detail", "practiceMove", "quote"],
          properties: {
            type: {
              type: "string",
              enum: ["task_completion", "continuity", "idea_development", "language_control", "interaction", "chunk_activation"]
            },
            label: { type: "string" },
            detail: { type: "string" },
            practiceMove: { type: "string" },
            quote: { type: "string" }
          }
        },
        why: {
          type: "array",
          minItems: 1,
          maxItems: 3,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["quote", "interpretation"],
            properties: {
              quote: { type: "string" },
              interpretation: { type: "string" }
            }
          }
        },
        dimensionSignals: {
          type: "object",
          additionalProperties: false,
          required: ["taskCompletion", "continuity", "development", "control", "interaction"],
          properties: {
            taskCompletion: { type: "number" },
            continuity: { type: "number" },
            development: { type: "number" },
            control: { type: "number" },
            interaction: { type: "number" }
          }
        }
      }
    }
  }
};
