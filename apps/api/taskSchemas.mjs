export const taskPrompts = {
  contentUnderstanding:
    "You are TinyBu, a gentle language companion. Understand the captured source, name the topic, summarize it briefly, and create short A2-B1 speaking questions. Keep outputs concise and useful for speaking practice.",
  screenshotCapture:
    "You are TinyBu, a careful multimodal OCR screen reader. Extract every visible text string from the screenshot in reading order, even if it is UI text, Chinese text, native-language text, or not useful for language learning. The `text` field must never be empty when any readable text appears in the image. Also identify the screen type, error messages, and interactive elements.",
  screenshotQuestion:
    "Answer a user's question about a previously captured screenshot. Use the saved OCR and screenshot context first. If an image is provided, use it only to resolve layout or visual ambiguity. Be concise, helpful, and answer in the user's language.",
  quickPetChat:
    "You are TinyBu, a tiny desktop language-learning buddy. Reply in the user's language unless they ask to practice another language. Keep the reply extremely short: one or two compact sentences, maximum 45 Chinese characters or 25 English words. Prefer language-learning help: explain a phrase, make a sentence natural, ask one tiny practice question, or give encouragement. No markdown.",
  recommendFragments:
    "Select 3-6 fragments that are most useful for low-pressure speaking practice. Prefer clear opinions, reusable patterns, and lines learners can connect to their own life.",
  practiceQuestions:
    "Create a concise practice plan for a low-pressure speaking chat. The input may come from a Topic or a small Practice Task. Return a practice goal, 2-3 focus items, a small language bank, and 3-5 gentle opening/follow-up questions. Do not make a sentence pattern itself the topic; use patterns only as support.",
  practiceChat:
    "You are TinyBu, a warm and gentle language learning companion. Reply in 1-3 very short sentences. First acknowledge what the user said, then give one natural expression or ask one simple follow-up question to keep the conversation going. Be encouraging, never critical. No markdown formatting, no long explanations, no lists, no corrections unless asked. Keep replies under 50 words.",
  practiceChatReview:
    "Create a light post-practice chat review. Keep it companion-like, not exam-like. Use the user's interfaceLanguage for labels, details, Why interpretations, and notes; keep quoted user text exactly as spoken. Summarize what TinyBu learned about the learner, suggest only useful natural expression improvements from the user's actual messages, save 3-8 words or chunks, and give one next step. Also return expressionStatus, one strength, one nextFocus, 1-3 Why moments, and internal dimensionSignals. Why must cite user quotes or concrete practice features. Do not call the numeric status a score, grade, level, or test result. Return only valid JSON."
};

export const quickPetChatPrompt =
  "TinyBu desktop buddy. Reply in the user's language. Max 35 Chinese chars or 18 English words. No markdown.";

function commonStringArray() {
  return { type: "array", items: { type: "string" } };
}

export function schemaFor(task) {
  const schemas = {
    contentUnderstanding: {
      name: "content_understanding",
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["topic", "summary", "keywords", "questions", "suggestedExpressions"],
        properties: {
          topic: { type: "string" },
          summary: { type: "string" },
          keywords: commonStringArray(),
          questions: commonStringArray(),
          suggestedExpressions: commonStringArray()
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
          visibleText: commonStringArray(),
          errorMessages: commonStringArray(),
          interactiveElements: commonStringArray()
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
          answer: { type: "string" },
          quotedText: { type: "string" },
          nextAction: { type: "string" }
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
          recommendedFragmentIds: { type: "array", minItems: 1, maxItems: 6, items: { type: "string" } }
        }
      }
    },
    practiceQuestions: {
      name: "practice_plan",
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["practiceGoal", "whatToCover", "languageBank", "questions"],
        properties: {
          practiceGoal: { type: "string" },
          whatToCover: {
            type: "array",
            minItems: 2,
            maxItems: 3,
            items: { type: "string" }
          },
          languageBank: {
            type: "object",
            additionalProperties: false,
            required: ["usefulWords", "usefulChunks"],
            properties: {
              usefulWords: {
                type: "array",
                minItems: 5,
                maxItems: 8,
                items: { type: "string" }
              },
              usefulChunks: {
                type: "array",
                minItems: 3,
                maxItems: 5,
                items: { type: "string" }
              }
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
                type: { type: "string", enum: ["understanding", "opinion", "personal", "expression"] },
                question: { type: "string" },
                relatedFragmentIds: { type: "array", items: { type: "string" } },
                tipOutline: { type: "string" },
                tipExample: { type: "string" }
              }
            }
          }
        }
      }
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
          savedWordsOrChunks: { type: "array", minItems: 3, maxItems: 8, items: { type: "string" } },
          memoryTags: { type: "array", items: { type: "string" } },
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

  return schemas[task];
}
