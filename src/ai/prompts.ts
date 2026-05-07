export const taskPrompts = {
  contentUnderstanding:
    "You are TinyBu, a gentle language companion. Understand the captured source, name the topic, summarize it briefly, and create short A2-B1 speaking questions. Keep outputs concise and useful for speaking practice.",
  screenshotCapture:
    "You are TinyBu, a careful multimodal OCR screen reader. Extract every visible text string from the screenshot in reading order, even if it is UI text, Chinese text, native-language text, or not useful for language learning. The `text` field must never be empty when any readable text appears in the image. Also identify the screen type, error messages, and interactive elements.",
  screenshotQuestion:
    "Answer a user's question about a previously captured screenshot. Use the saved OCR and screenshot context first. If an image is provided, use it only to resolve layout or visual ambiguity. Be concise, helpful, and answer in the user's language.",
  quickPetChat:
    "You are TinyBu, a tiny desktop language-learning buddy. Reply in the user's language unless they ask to practice another language. Keep the reply extremely short: one or two compact sentences, maximum 45 Chinese characters or 25 English words. Prefer language-learning help: explain a phrase, make a sentence natural, ask one tiny practice question, or give encouragement. No markdown.",
  expressionCard:
    "Turn the captured sentence into a reusable expression card. Focus on meaning, useful pattern, scene, and a half-finished sentence the learner can personalize.",
  talkTurn:
    "Continue a low-pressure language practice conversation. First respond to meaning, then give one tiny natural expression if helpful, then ask one simple next question.",
  rescue:
    "The learner is stuck. Give 1-3 short support lines only. Do not answer everything for them.",
  talkReview:
    "Create a gentle post-talk review. Start with what the learner communicated successfully. Give only 1-2 natural expression suggestions.",
  recommendFragments:
    "Select 3-6 fragments that are most useful for low-pressure speaking practice. Prefer clear opinions, reusable patterns, and lines learners can connect to their own life.",
  practiceQuestions:
    "Create 3-5 gentle practice questions from selected fragments. Ask one idea at a time. Order questions from content understanding, to opinion, to personal connection, to expression use.",
  practiceTip:
    "The learner is stuck on one practice question. If tipLevel is 1, give only an answer structure. If tipLevel is 2, give one short target-language reference sentence.",
  practiceTurn:
    "Respond briefly to a learner answer. Give one encouragement and one natural response to their meaning. Do not correct heavily or add expression advice.",
  review:
    "Create a gentle practice review. Avoid Wrong/Correct language. Summarize what the learner talked about, what worked, more natural expressions, saved notebook expressions, and next practice.",
  memory:
    "Create short learning memories that support future practice. Do not save private or sensitive information."
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
  expressionCard: {
    name: "expression_card",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["meaning", "keywords", "pattern", "scene", "practiceStem"],
      properties: {
        meaning: { type: "string" },
        keywords: { type: "array", items: { type: "string" } },
        pattern: { type: "string" },
        scene: { type: "string" },
        practiceStem: { type: "string" }
      }
    }
  },
  talkTurn: {
    name: "talk_turn",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["reply", "nextQuestion", "shouldSuggestRescue", "readyToEnd"],
      properties: {
        reply: { type: "string" },
        nextQuestion: { type: "string" },
        shouldSuggestRescue: { type: "boolean" },
        readyToEnd: { type: "boolean" }
      }
    }
  },
  rescue: {
    name: "rescue",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["lines"],
      properties: {
        lines: {
          type: "array",
          minItems: 1,
          maxItems: 3,
          items: { type: "string" }
        }
      }
    }
  },
  talkReview: {
    name: "talk_review",
    schema: {
      type: "object",
      additionalProperties: false,
      required: [
        "talkedAbout",
        "didWell",
        "naturalExpressions",
        "savedExpressions",
        "nextPractice"
      ],
      properties: {
        talkedAbout: { type: "string" },
        didWell: { type: "array", items: { type: "string" } },
        naturalExpressions: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["original", "improved"],
            properties: {
              original: { type: "string" },
              improved: { type: "string" }
            }
          }
        },
        savedExpressions: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["original", "meaning", "keywords", "pattern", "scene", "practiceStem"],
            properties: {
              original: { type: "string" },
              meaning: { type: "string" },
              keywords: { type: "array", items: { type: "string" } },
              pattern: { type: "string" },
              scene: { type: "string" },
              practiceStem: { type: "string" }
            }
          }
        },
        nextPractice: { type: "string" }
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
    name: "practice_questions",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["questions"],
      properties: {
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
  practiceTip: {
    name: "practice_tip",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["outline", "example"],
      properties: {
        outline: { type: "string" },
        example: { type: "string" }
      }
    }
  },
  practiceTurn: {
    name: "practice_turn",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["encouragement", "response"],
      properties: {
        encouragement: { type: "string" },
        response: { type: "string" }
      }
    }
  },
  review: {
    name: "practice_review",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["talkedAbout", "didWell", "naturalExpressions", "savedExpressions", "nextPractice"],
      properties: {
        talkedAbout: { type: "string" },
        didWell: { type: "array", items: { type: "string" } },
        naturalExpressions: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["original", "improved"],
            properties: {
              original: { type: "string" },
              improved: { type: "string" }
            }
          }
        },
        savedExpressions: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["original", "meaning", "keywords", "pattern", "scene", "practiceStem"],
            properties: {
              original: { type: "string" },
              meaning: { type: "string" },
              keywords: { type: "array", items: { type: "string" } },
              pattern: { type: "string" },
              scene: { type: "string" },
              practiceStem: { type: "string" }
            }
          }
        },
        nextPractice: { type: "string" }
      }
    }
  },
  memory: {
    name: "memory_update",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["memories"],
      properties: {
        memories: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "type", "title", "body", "editable", "updatedAt"],
            properties: {
              id: { type: "string" },
              type: {
                type: "string",
                enum: ["interest", "expression", "support", "anxiety", "next"]
              },
              title: { type: "string" },
              body: { type: "string" },
              editable: { type: "boolean" },
              updatedAt: { type: "string" }
            }
          }
        }
      }
    }
  }
};
