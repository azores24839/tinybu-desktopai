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
    "Create a concise practice plan for a low-pressure speaking practice. The input may come from a Topic or from a small Practice Task.\n\nReturn:\n- practiceGoal: one concrete conversation mission the user can complete during the call, such as making TinyBu understand a preference, persuading TinyBu to agree with an opinion, discovering TinyBu's likes, comparing two viewpoints, or explaining one real experience clearly. Do not use abstract skill goals like improve fluency, practice natural replies, or reduce pauses.\n- whatToCover: 2-3 concrete points the user can cover to complete the mission\n- languageBank.usefulWords: 5-8 topic-specific words or short phrases\n- languageBank.usefulChunks: 3-5 short speaking chunks\n- questions: 3-5 gentle practice questions\n\nRules:\nUse the selected fragments and task context as the source.\nMake every item specific to the current content or task.\nDo not make a sentence pattern itself the topic; use patterns only as support.\nKeep the content concise and suitable for a practice UI.\nQuestions should ask one idea at a time.\nOrder questions from situation setup, to personal connection or opinion, to mission completion.\nUse the target language mainly. Use the native language only when it helps understanding.",
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
        recommendedFragmentIds: { type: "array", minItems: 3, maxItems: 6, items: { type: "string" } }
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
              type: {
                type: "string",
                enum: ["understanding", "opinion", "personal", "expression"]
              },
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
