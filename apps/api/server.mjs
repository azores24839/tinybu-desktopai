import http from "node:http";

const port = Number(process.env.PORT ?? 8787);
const openAiApiKey = process.env.OPENAI_API_KEY;
const openRouterApiKey = process.env.OPENROUTER_API_KEY;
const openRouterBaseUrl = process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
const anthropicAuthToken = process.env.ANTHROPIC_AUTH_TOKEN;
const anthropicBaseUrl = process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com";
const apiTimeoutMs = Number(process.env.API_TIMEOUT_MS ?? 300000);
const defaultModel =
  process.env.ANTHROPIC_MODEL ??
  process.env.ANTHROPIC_DEFAULT_SONNET_MODEL ??
  process.env.OPENAI_MODEL ??
  "MiniMax-M2.7";

function normalizeOpenRouterModel(model = "") {
  const trimmed = model.trim();
  const aliases = {
    "MiniMax-M2.7": "minimax/minimax-m2.7",
    "minimax-m2.7": "minimax/minimax-m2.7",
    "MiniMax M2.7": "minimax/minimax-m2.7",
    "MiniMax-M2": "minimax/minimax-m2",
    "minimax-m2": "minimax/minimax-m2",
    "MiniMax M2": "minimax/minimax-m2"
  };
  return aliases[trimmed] ?? trimmed;
}

function shouldUseOpenRouterModel(model = "") {
  return normalizeOpenRouterModel(model).includes("/");
}

const taskPrompts = {
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
  mirror:
    "Create a gentle post-talk mirror card. Start with what the learner communicated successfully. Give only 1-2 natural expression suggestions.",
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

const quickPetChatPrompt =
  "TinyBu desktop buddy. Reply in the user's language. Max 35 Chinese chars or 18 English words. No markdown.";

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 8_000_000) {
        reject(new Error("Request too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function commonStringArray() {
  return { type: "array", items: { type: "string" } };
}

function expressionCardSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["original", "meaning", "keywords", "pattern", "scene", "practiceStem"],
    properties: {
      original: { type: "string" },
      meaning: { type: "string" },
      keywords: commonStringArray(),
      pattern: { type: "string" },
      scene: { type: "string" },
      practiceStem: { type: "string" }
    }
  };
}

function schemaFor(task) {
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
    expressionCard: {
      name: "expression_card",
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["meaning", "keywords", "pattern", "scene", "practiceStem"],
        properties: {
          meaning: { type: "string" },
          keywords: commonStringArray(),
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
          lines: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 3 }
        }
      }
    },
    mirror: reviewSchema("mirror_card"),
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
      name: "practice_questions",
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["questions"],
        properties: {
          questions: {
            type: "array",
            minItems: 1,
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
    review: reviewSchema("practice_review"),
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
                type: { type: "string", enum: ["interest", "expression", "support", "anxiety", "next"] },
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

  return schemas[task];
}

function reviewSchema(name) {
  return {
    name,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["talkedAbout", "didWell", "naturalExpressions", "savedExpressions", "nextPractice"],
      properties: {
        talkedAbout: { type: "string" },
        didWell: commonStringArray(),
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
          items: expressionCardSchema()
        },
        nextPractice: { type: "string" }
      }
    }
  };
}

function anthropicEndpoint() {
  const base = anthropicBaseUrl.replace(/\/+$/, "");
  return base.endsWith("/v1") ? `${base}/messages` : `${base}/v1/messages`;
}

function stripDataUrl(dataUrl = "") {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return { mediaType: "image/png", data: dataUrl };
  return { mediaType: match[1], data: match[2] };
}

function buildAnthropicContent(task, payload) {
  if (task !== "screenshotCapture" && task !== "screenshotQuestion") return JSON.stringify(payload);

  const { imageDataUrl, ...rest } = payload ?? {};
  const image = stripDataUrl(imageDataUrl);
  const content = [
    {
      type: "text",
      text: JSON.stringify({
        ...rest,
        instruction:
          task === "screenshotCapture"
            ? "OCR every readable text string. Do not filter by usefulness or language."
            : "Answer the user's question about this screenshot."
      })
    }
  ];

  if (imageDataUrl) {
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: image.mediaType,
        data: image.data
      }
    });
  }

  return content;
}

function buildOpenAiInput(task, payload) {
  if (task !== "screenshotCapture" && task !== "screenshotQuestion") return JSON.stringify(payload);

  const { imageDataUrl, ...rest } = payload ?? {};
  const content = [
    {
      type: "input_text",
      text: JSON.stringify({
        ...rest,
        instruction:
          task === "screenshotCapture"
            ? "OCR every readable text string. Do not filter by usefulness or language."
            : "Answer the user's question about this screenshot."
      })
    }
  ];

  if (imageDataUrl) {
    content.push({
      type: "input_image",
      image_url: imageDataUrl,
      detail: "high"
    });
  }

  return [
    {
      role: "user",
      content
    }
  ];
}

function buildOpenRouterMessages(task, payload) {
  if (task !== "screenshotCapture" && task !== "screenshotQuestion") {
    return [{ role: "user", content: JSON.stringify(payload) }];
  }

  const { imageDataUrl, ...rest } = payload ?? {};
  const content = [
    {
      type: "text",
      text: JSON.stringify({
        ...rest,
        instruction:
          task === "screenshotCapture"
            ? "OCR every readable text string. Do not filter by usefulness or language."
            : "Answer the user's question about this screenshot."
      })
    }
  ];

  if (imageDataUrl) {
    content.push({ type: "image_url", image_url: { url: imageDataUrl, detail: "high" } });
  }

  return [{ role: "user", content }];
}

function extractJsonText(text = "") {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const objectStart = trimmed.indexOf("{");
  const arrayStart = trimmed.indexOf("[");
  const startCandidates = [objectStart, arrayStart].filter((index) => index >= 0);
  if (!startCandidates.length) return trimmed;

  const start = Math.min(...startCandidates);
  const objectEnd = trimmed.lastIndexOf("}");
  const arrayEnd = trimmed.lastIndexOf("]");
  const end = Math.max(objectEnd, arrayEnd);
  return end > start ? trimmed.slice(start, end + 1) : trimmed;
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), apiTimeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

async function callAnthropic(task, model, payload) {
  const schema = schemaFor(task);
  const body = {
    model,
    max_tokens: task === "screenshotCapture" ? 1200 : 900,
    system: taskPrompts[task],
    messages: [
      {
        role: "user",
        content: buildAnthropicContent(task, payload)
      }
    ],
    tools: [
      {
        name: schema.name,
        description: "Return the requested structured JSON object.",
        input_schema: schema.schema
      }
    ],
    tool_choice: {
      type: "tool",
      name: schema.name
    }
  };

  let response = await fetchWithTimeout(anthropicEndpoint(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicAuthToken,
      Authorization: `Bearer ${anthropicAuthToken}`,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok && [400, 404, 422].includes(response.status)) {
    response = await fetchWithTimeout(anthropicEndpoint(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicAuthToken,
        Authorization: `Bearer ${anthropicAuthToken}`,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model,
        max_tokens: body.max_tokens,
        system: `${taskPrompts[task]}\nReturn only valid JSON matching this JSON Schema: ${JSON.stringify(schema.schema)}`,
        messages: body.messages
      })
    });
  }

  const raw = await response.text();
  let data;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { error: raw };
  }
  if (!response.ok) {
    throw new Error(data?.error?.message || data?.error || `Anthropic-compatible request failed: ${response.status}`);
  }

  const toolUse = data.content?.find((item) => item.type === "tool_use" && item.name === schema.name);
  if (toolUse?.input) return toolUse.input;

  const text = data.content
    ?.filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("\n");

  if (!text) throw new Error("Anthropic-compatible response did not contain JSON text.");
  return JSON.parse(extractJsonText(text));
}

async function callOpenAi(task, model, payload) {
  const response = await fetchWithTimeout("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openAiApiKey}`
    },
    body: JSON.stringify({
      model,
      instructions: taskPrompts[task],
      input: buildOpenAiInput(task, payload),
      text: {
        format: {
          type: "json_schema",
          ...schemaFor(task),
          strict: true
        }
      },
      max_output_tokens: task === "screenshotCapture" ? 1200 : 900
    })
  });

  return { response, data: await response.json() };
}

async function callOpenRouter(task, model, payload) {
  const schema = schemaFor(task);
  const normalizedModel = normalizeOpenRouterModel(model);
  const response = await fetchWithTimeout(`${openRouterBaseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openRouterApiKey}`,
      "HTTP-Referer": "http://127.0.0.1",
      "X-Title": "TinyBu Desktop"
    },
    body: JSON.stringify({
      model: normalizedModel,
      messages: [
        { role: "system", content: `${taskPrompts[task]}\nReturn only valid JSON.` },
        ...buildOpenRouterMessages(task, payload)
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: schema.name,
          strict: true,
          schema: schema.schema
        }
      },
      max_tokens: task === "screenshotCapture" || task === "screenshotQuestion" ? 1600 : 900
    })
  });
  const data = await response.json();
  if (!response.ok) return { response, data };
  const outputText = data.choices?.[0]?.message?.content;
  return {
    response,
    data: {
      output_text: outputText
    }
  };
}

async function callQuickPetChatAnthropic(model, payload) {
  const response = await fetchWithTimeout(anthropicEndpoint(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicAuthToken,
      Authorization: `Bearer ${anthropicAuthToken}`,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model,
      max_tokens: 70,
      system: quickPetChatPrompt,
      messages: [{ role: "user", content: String(payload?.message ?? "") }]
    })
  });
  const data = await response.json();
  if (!response.ok) return { response, data };
  const text = data.content
    ?.filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("\n")
    .trim();
  return { response, data: { output_text: text || "" } };
}

async function callQuickPetChatOpenAi(model, payload) {
  const response = await fetchWithTimeout("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openAiApiKey}`
    },
    body: JSON.stringify({
      model,
      instructions: quickPetChatPrompt,
      input: String(payload?.message ?? ""),
      max_output_tokens: 70
    })
  });
  return { response, data: await response.json() };
}

async function callQuickPetChatOpenRouter(model, payload) {
  const normalizedModel = normalizeOpenRouterModel(model);
  const response = await fetchWithTimeout(`${openRouterBaseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openRouterApiKey}`,
      "HTTP-Referer": "http://127.0.0.1",
      "X-Title": "TinyBu Desktop"
    },
    body: JSON.stringify({
      model: normalizedModel,
      messages: [
        { role: "system", content: quickPetChatPrompt },
        { role: "user", content: String(payload?.message ?? "") }
      ],
      max_tokens: 70,
      temperature: 0.35
    })
  });
  const data = await response.json();
  if (!response.ok) return { response, data };
  return { response, data: { output_text: data.choices?.[0]?.message?.content ?? "" } };
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method !== "POST" || req.url !== "/v1/nomi/task") {
    sendJson(res, 404, { error: "Not found" });
    return;
  }

  try {
    const body = JSON.parse(await readBody(req));
    const { task, payload } = body;
    const model = body.model || defaultModel;

    if (!taskPrompts[task] || !schemaFor(task)) {
      sendJson(res, 400, { error: "Invalid task" });
      return;
    }

    if (task === "quickPetChat") {
      if (anthropicAuthToken) {
        const { response, data } = await callQuickPetChatAnthropic(model, payload);
        sendJson(res, response.status, data);
        return;
      }

      if (openRouterApiKey && shouldUseOpenRouterModel(model)) {
        const { response, data } = await callQuickPetChatOpenRouter(model, payload);
        sendJson(res, response.status, data);
        return;
      }

      if (!openAiApiKey) {
        sendJson(res, 500, { error: "Configure ANTHROPIC_AUTH_TOKEN, OPENROUTER_API_KEY, or OPENAI_API_KEY before using the cloud proxy." });
        return;
      }

      const { response, data } = await callQuickPetChatOpenAi(model, payload);
      sendJson(res, response.status, data);
      return;
    }

    if (anthropicAuthToken) {
      const output = await callAnthropic(task, model, payload);
      sendJson(res, 200, { output_text: JSON.stringify(output) });
      return;
    }

    if (openRouterApiKey && shouldUseOpenRouterModel(model)) {
      const { response, data } = await callOpenRouter(task, model, payload);
      sendJson(res, response.status, data);
      return;
    }

    if (!openAiApiKey) {
      sendJson(res, 500, { error: "Configure ANTHROPIC_AUTH_TOKEN, OPENROUTER_API_KEY, or OPENAI_API_KEY before using the cloud proxy." });
      return;
    }

    const { response, data } = await callOpenAi(task, model, payload);
    sendJson(res, response.status, data);
  } catch (error) {
    sendJson(res, 500, { error: error instanceof Error ? error.message : "Unknown error" });
  }
});

server.listen(port, "127.0.0.1", () => {
  const provider = anthropicAuthToken ? "Anthropic-compatible" : openRouterApiKey ? "OpenRouter/OpenAI" : "OpenAI";
  console.log(`TinyBu ${provider} proxy listening on http://127.0.0.1:${port}/v1/nomi/task`);
});
