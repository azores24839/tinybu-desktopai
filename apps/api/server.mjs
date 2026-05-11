import http from "node:http";
import https from "node:https";
import crypto from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import { pathToFileURL } from "node:url";
import {
  isAnthropicCompatibleModel,
  isProviderQualifiedModel,
  normalizeAnthropicModel,
  normalizeOpenRouterModel,
  shouldUseOpenRouterModel
} from "./providerRouting.mjs";

const port = Number(process.env.PORT ?? 8787);
const openAiApiKey = process.env.OPENAI_API_KEY;
const openRouterApiKey = process.env.OPENROUTER_API_KEY;
const openRouterBaseUrl = process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
const anthropicAuthToken = process.env.ANTHROPIC_AUTH_TOKEN;
const anthropicBaseUrl = process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com";
const apiTimeoutMs = Number(process.env.API_TIMEOUT_MS ?? 300000);
const taskPath = "/v1/tinybu/task";
const volcWsPath = "/v1/volc-ws";
const volcAppId = process.env.VOLC_APP_ID ?? "";
const volcAccessKey = process.env.VOLC_ACCESS_KEY ?? "";
const volcResourceId = "volc.speech.dialog";
const volcAppKey = "PlgvMymc7f3tQnJ6";
const volcWsUrl = "wss://openspeech.bytedance.com/api/v3/realtime/dialogue";
const defaultModel =
  process.env.ANTHROPIC_MODEL ??
  process.env.ANTHROPIC_DEFAULT_SONNET_MODEL ??
  process.env.OPENAI_MODEL ??
  "MiniMax-M2.7";

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
    "Create short learning memories that support future practice. Do not save private or sensitive information.",
  practiceChat:
    "You are TinyBu, a warm and gentle language learning companion. Reply in 1-3 very short sentences. First acknowledge what the user said, then give one natural expression or ask one simple follow-up question to keep the conversation going. Be encouraging, never critical. No markdown formatting, no long explanations, no lists, no corrections unless asked. Keep replies under 50 words."
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

function log(level, ...args) {
  const ts = new Date().toISOString().slice(11, 23);
  const prefix = `[${ts} ${level}]`;
  if (level === "ERROR") {
    console.error(prefix, ...args);
  } else if (level === "WARN") {
    console.warn(prefix, ...args);
  } else {
    console.log(prefix, ...args);
  }
}

function logReq(label, body) {
  if (typeof body !== "string") {
    log("REQ", label, JSON.stringify(body).slice(0, 400));
  } else {
    log("REQ", label, body.slice(0, 400));
  }
}

function logRes(label, status, body) {
  const preview = typeof body === "string" ? body.slice(0, 200) : JSON.stringify(body).slice(0, 200);
  log("RES", label, `status=${status}`, preview);
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
    talkReview: reviewSchema("talk_review"),
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

  if (req.method !== "POST" || req.url !== taskPath) {
    sendJson(res, 404, { error: "Not found" });
    return;
  }

  let task, model, payload;
  try {
    const body = JSON.parse(await readBody(req));
    task = body.task;
    payload = body.payload;
    model = body.model || defaultModel;
    log("REQ", `task=${task} model=${model}`, `payload keys=[${Object.keys(payload || {}).join(",")}]`);

    if (!taskPrompts[task] || !schemaFor(task)) {
      log("WARN", `Invalid task: ${task}`);
      sendJson(res, 400, { error: "Invalid task" });
      return;
    }

    if (task === "quickPetChat" || task === "practiceChat") {
      if (task === "practiceChat") {
        if (anthropicAuthToken && isAnthropicCompatibleModel(model)) {
          const messages = [
            { role: "user", content: JSON.stringify({
              topicName: payload?.topicName,
              userAnswer: payload?.userAnswer,
              chatHistory: (payload?.chatHistory || []).slice(-6)
            }) }
          ];
          const reqBody = {
            model: normalizeAnthropicModel(model),
            max_tokens: 150,
            system: taskPrompts.practiceChat,
            messages
          };
          logReq("practiceChat → anthropic", reqBody);

          const response = await fetchWithTimeout(anthropicEndpoint(), {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": anthropicAuthToken,
              Authorization: `Bearer ${anthropicAuthToken}`,
              "anthropic-version": "2023-06-01"
            },
            body: JSON.stringify(reqBody)
          });
          const data = await response.json();
          logRes("practiceChat ← anthropic", response.status, data);
          if (!response.ok) {
            sendJson(res, response.status, data);
            return;
          }
          const text = data.content
            ?.filter((item) => item.type === "text")
            .map((item) => item.text)
            .join("\n")
            .trim();
          sendJson(res, 200, { output_text: text || "" });
          return;
        }

        if (openRouterApiKey && shouldUseOpenRouterModel(model, { anthropicAuthToken })) {
          const normalizedModel = normalizeOpenRouterModel(model);
          const messages = [
            { role: "system", content: taskPrompts.practiceChat },
            { role: "system", content: `Current topic: ${payload?.topicName || ""}` },
            ...(payload?.chatHistory || []).slice(-6).map((msg) => ({
              role: msg.role === "bu" ? "assistant" : "user",
              content: msg.text
            })),
            { role: "user", content: payload?.userAnswer || "" }
          ];

          const reqBody = { model: normalizedModel, messages, max_tokens: 150, temperature: 0.5 };
          logReq("practiceChat → OpenRouter", reqBody);

          const response = await fetchWithTimeout(`${openRouterBaseUrl.replace(/\/+$/, "")}/chat/completions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${openRouterApiKey}`,
              "HTTP-Referer": "http://127.0.0.1",
              "X-Title": "TinyBu Desktop"
            },
            body: JSON.stringify(reqBody)
          });
          const data = await response.json();
          logRes("practiceChat ← OpenRouter", response.status, data);
          if (!response.ok) {
            sendJson(res, response.status, data);
            return;
          }
          sendJson(res, 200, { output_text: data.choices?.[0]?.message?.content ?? "" });
          return;
        }

        if (shouldUseOpenRouterModel(model, { anthropicAuthToken }) && !openRouterApiKey) {
          log("WARN", "practiceChat: no OPENROUTER_API_KEY set for model", model);
          sendJson(res, 500, { error: `Configure OPENROUTER_API_KEY before using ${normalizeOpenRouterModel(model)}.` });
          return;
        }

        if (!openAiApiKey || isProviderQualifiedModel(model)) {
          log("WARN", "practiceChat: no OPENAI_API_KEY or provider model with no route");
          sendJson(res, 500, { error: "Configure OPENAI_API_KEY for OpenAI models or ANTHROPIC_AUTH_TOKEN / OPENROUTER_API_KEY for other models." });
          return;
        }

        const input = `Topic: ${payload?.topicName || ""}\nUser: ${payload?.userAnswer || ""}`;
        logReq("practiceChat → openai", input);
        const response = await fetchWithTimeout("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openAiApiKey}`
          },
          body: JSON.stringify({
            model,
            instructions: taskPrompts.practiceChat,
            input,
            max_output_tokens: 150
          })
        });
        const data = await response.json();
        logRes("practiceChat ← openai", response.status, data);
        if (!response.ok) {
          sendJson(res, response.status, data);
          return;
        }
        const text = data.output_text ?? data.output?.[0]?.content?.[0]?.text ?? "";
        sendJson(res, 200, { output_text: String(text).trim() });
        return;
      }

      if (task === "quickPetChat") {
      if (anthropicAuthToken && isAnthropicCompatibleModel(model)) {
        log("REQ", "quickPetChat route=anthropic");
        const { response, data } = await callQuickPetChatAnthropic(normalizeAnthropicModel(model), payload);
        logRes("quickPetChat ← anthropic", response.status, data);
        sendJson(res, response.status, data);
        return;
      }

      if (openRouterApiKey && shouldUseOpenRouterModel(model, { anthropicAuthToken })) {
        log("REQ", "quickPetChat route=openrouter");
        const { response, data } = await callQuickPetChatOpenRouter(model, payload);
        logRes("quickPetChat ← openrouter", response.status, data);
        sendJson(res, response.status, data);
        return;
      }

      if (shouldUseOpenRouterModel(model, { anthropicAuthToken }) && !openRouterApiKey) {
        log("WARN", "quickPetChat: no OPENROUTER_API_KEY");
        sendJson(res, 500, { error: `Configure OPENROUTER_API_KEY before using ${normalizeOpenRouterModel(model)}.` });
        return;
      }

      if (!openAiApiKey || isProviderQualifiedModel(model)) {
        log("WARN", "quickPetChat: no OPENAI_API_KEY for provider model");
        sendJson(res, 500, { error: "Configure ANTHROPIC_AUTH_TOKEN for MiniMax/Anthropic-compatible models, OPENROUTER_API_KEY for provider/model IDs such as qwen/..., or OPENAI_API_KEY for OpenAI models." });
        return;
      }

      log("REQ", "quickPetChat route=openai");
      const { response, data } = await callQuickPetChatOpenAi(model, payload);
      logRes("quickPetChat ← openai", response.status, data);
      sendJson(res, response.status, data);
      return;
    }
    }

    if (anthropicAuthToken && isAnthropicCompatibleModel(model)) {
      log("REQ", `task=${task} route=anthropic model=${normalizeAnthropicModel(model)}`);
      const output = await callAnthropic(task, normalizeAnthropicModel(model), payload);
      log("RES", `task=${task} route=anthropic`, `output keys=[${Object.keys(output || {}).join(",")}]`);
      sendJson(res, 200, { output_text: JSON.stringify(output) });
      return;
    }

    if (openRouterApiKey && shouldUseOpenRouterModel(model, { anthropicAuthToken })) {
      log("REQ", `task=${task} route=openrouter model=${model}`);
      const { response, data } = await callOpenRouter(task, model, payload);
      logRes(`task=${task} route=openrouter`, response.status, data);
      sendJson(res, response.status, data);
      return;
    }

    if (shouldUseOpenRouterModel(model, { anthropicAuthToken }) && !openRouterApiKey) {
      log("WARN", `task=${task} no OPENROUTER_API_KEY for model=${model}`);
      sendJson(res, 500, { error: `Configure OPENROUTER_API_KEY before using ${normalizeOpenRouterModel(model)}.` });
      return;
    }

    if (!openAiApiKey || isProviderQualifiedModel(model)) {
      log("WARN", `task=${task} no OPENAI_API_KEY for model=${model}`);
      sendJson(res, 500, { error: "Configure ANTHROPIC_AUTH_TOKEN for MiniMax/Anthropic-compatible models, OPENROUTER_API_KEY for provider/model IDs such as qwen/..., or OPENAI_API_KEY for OpenAI models." });
      return;
    }

    log("REQ", `task=${task} route=openai model=${model}`);
    const { response, data } = await callOpenAi(task, model, payload);
    logRes(`task=${task} route=openai`, response.status, data);
    sendJson(res, response.status, data);
  } catch (error) {
    log("ERROR", error instanceof Error ? error.message : "Unknown error");
    log("ERROR", "request body =", JSON.stringify({ task, model, payload }).slice(0, 800));
    if (error instanceof Error && error.stack) log("ERROR", error.stack);
    sendJson(res, 500, { error: error instanceof Error ? error.message : "Unknown error" });
  }
});

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (request, socket, head) => {
  if (request.url === volcWsPath) {
    wss.handleUpgrade(request, socket, head, (browserWs) => {
      wss.emit("connection", browserWs, request);
    });
  } else {
    socket.destroy();
  }
});

wss.on("connection", (browserWs) => {

function encodeWsFrame(payload, opcode = 2) {
  const len = payload.length;
  const maskKey = crypto.randomBytes(4);
  let header;
  if (len < 126) {
    header = Buffer.alloc(6);
    header[0] = 0x80 | opcode;
    header[1] = len | 0x80;
  } else if (len < 65536) {
    header = Buffer.alloc(8);
    header[0] = 0x80 | opcode;
    header[1] = 126 | 0x80;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(14);
    header[0] = 0x80 | opcode;
    header[1] = 127 | 0x80;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  maskKey.copy(header, header.length - 4);
  const masked = Buffer.alloc(len);
  for (let i = 0; i < len; i++) {
    masked[i] = payload[i] ^ maskKey[i % 4];
  }
  return Buffer.concat([header, masked]);
}

function parseWsFrames(data) {
  const frames = [];
  let pos = 0;
  // Accumulate buffer for partial frames
  parseWsFrames._buf = parseWsFrames._buf ? Buffer.concat([parseWsFrames._buf, data]) : Buffer.from(data);
  const buf = parseWsFrames._buf;

  while (pos < buf.length) {
    if (pos + 2 > buf.length) break;
    const firstByte = buf[pos];
    const secondByte = buf[pos + 1];
    const fin = (firstByte & 0x80) !== 0;
    const opcode = firstByte & 0x0f;
    const masked = (secondByte & 0x80) !== 0;
    let payloadLen = secondByte & 0x7f;
    let headerLen = 2;

    if (payloadLen === 126) {
      if (pos + 4 > buf.length) break;
      payloadLen = buf.readUInt16BE(pos + 2);
      headerLen = 4;
    } else if (payloadLen === 127) {
      if (pos + 10 > buf.length) break;
      payloadLen = Number(buf.readBigUInt64BE(pos + 2));
      headerLen = 10;
    }

    const maskLen = masked ? 4 : 0;
    const totalLen = headerLen + maskLen + payloadLen;
    if (pos + totalLen > buf.length) break;

    const maskStart = pos + headerLen;
    const payloadStart = maskStart + maskLen;
    let payload = buf.slice(payloadStart, payloadStart + payloadLen);

    if (masked) {
      const mask = buf.slice(maskStart, maskStart + 4);
      for (let i = 0; i < payload.length; i++) {
        payload[i] ^= mask[i % 4];
      }
    }

    frames.push({ fin, opcode, payload });
    pos += totalLen;
  }

  parseWsFrames._buf = buf.slice(pos);
  return frames;
}
  if (!volcAppId || !volcAccessKey) {
    console.log("Volc WS: missing VOLC_APP_ID or VOLC_ACCESS_KEY env vars");
    browserWs.close(1011, "Server config missing");
    return;
  }

  console.log(`Volc WS: connecting App-ID=${volcAppId} Token=${volcAccessKey.slice(0,8)}...`);

  const pending = [];
  let upstreamSocket = null;
  let upstreamReady = false;
  let sessionStarted = false;

  function decodeV1Event(buf) {
    if (buf.length < 8) return null;
    const flags = buf[1] & 0x0f;
    if (!(flags & 0x04)) return null;
    const eventId = (buf[4] << 24) | (buf[5] << 16) | (buf[6] << 8) | buf[7];
    return eventId;
  }

  function flushNextToUpstream() {
    if (!upstreamSocket || upstreamSocket.destroyed) return;
    if (pending.length === 0) return;
    const buf = pending.shift();
    const ev = decodeV1Event(buf);
    if (ev !== null) {
      if (ev === 100 && !sessionStarted) {
        // Flush StartSession even before SessionStarted
      }
    }
    msgCount++;
    const wsFrame = encodeWsFrame(buf);
    const hex = buf.length <= 40 ? buf.toString("hex") : buf.slice(0, 40).toString("hex") + "...";
    console.log(`Volc WS: sent #${msgCount} v1-len=${buf.length} ws-len=${wsFrame.length} hex=${hex}`);
    upstreamSocket.write(wsFrame);
  }

  browserWs.on("message", (data, isBinary) => {
    const buf = Buffer.from(data);
    const ev = decodeV1Event(buf);
    if (upstreamReady && upstreamSocket && !upstreamSocket.destroyed && sessionStarted) {
      msgCount++;
      if (msgCount <= 5) {
        const hex = buf.length <= 40 ? buf.toString("hex") : buf.slice(0, 40).toString("hex") + "...";
        console.log(`Volc WS: msg #${msgCount} len=${buf.length} hex=${hex}`);
      }
      upstreamSocket.write(encodeWsFrame(buf, isBinary ? 2 : 1));
    } else {
      pending.push(buf);
    }
  });

  browserWs.on("close", () => {
    upstreamReady = false;
    if (upstreamSocket && !upstreamSocket.destroyed) upstreamSocket.destroy();
  });

  browserWs.on("error", () => {
    upstreamReady = false;
    if (upstreamSocket && !upstreamSocket.destroyed) upstreamSocket.destroy();
  });

  const wsKey = crypto.randomBytes(16).toString("base64");
  let msgCount = 0;

  const req = https.request({
    hostname: "openspeech.bytedance.com",
    path: "/api/v3/realtime/dialogue",
    method: "GET",
    headers: {
      "Connection": "Upgrade",
      "Upgrade": "websocket",
      "Sec-WebSocket-Version": "13",
      "Sec-WebSocket-Key": wsKey,
      "X-Api-App-ID": volcAppId,
      "X-Api-Access-Key": volcAccessKey,
      "X-Api-Resource-Id": volcResourceId,
      "X-Api-App-Key": volcAppKey,
    },
  });

  req.on("upgrade", (res, socket, head) => {
    console.log(`Volc WS: upstream connected (status ${res.statusCode})`);
    socket.setNoDelay(true);
    upstreamSocket = socket;
    upstreamReady = true;

    flushNextToUpstream();

    socket.on("data", (data) => {
      const frames = parseWsFrames(data);
      for (const frame of frames) {
        if (frame.opcode === 8) {
          const code = frame.payload.length >= 2 ? frame.payload.readUInt16BE(0) : 0;
          const reason = frame.payload.length > 2 ? frame.payload.slice(2).toString() : "";
          console.log(`Volc WS: server closed (code=${code} reason=${reason.slice(0,100)})`);
          browserWs.close();
          return;
        }
        if (frame.opcode === 9) { socket.write(encodeWsFrame(Buffer.alloc(0), 10)); return; }

        const ev = decodeV1Event(frame.payload);
        if (ev === 50) {
          console.log("Volc WS: received ConnectionStarted, flushing next...");
          flushNextToUpstream();
        } else if (ev === 150) {
          console.log("Volc WS: received SessionStarted, flushing audio...");
          sessionStarted = true;
          while (pending.length > 0) flushNextToUpstream();
        } else if (ev !== null && frame.opcode === 1) {
          const text = frame.payload.toString().slice(0, 300);
          console.log(`Volc WS: received text (ev=${ev}): ${text}`);
        }

        if (frame.opcode === 2 || frame.opcode === 1) {
          if (browserWs.readyState === WebSocket.OPEN) {
            browserWs.send(frame.payload, { binary: frame.opcode === 2 });
          }
        }
      }
    });

    socket.on("close", () => {
      console.log("Volc WS: upstream socket closed");
      upstreamReady = false;
      browserWs.close();
    });

    socket.on("error", (err) => {
      console.log("Volc WS: upstream socket error:", err.message);
      upstreamReady = false;
      browserWs.close();
    });
  });

  req.on("error", (err) => {
    console.log("Volc WS: upstream error:", err.message);
    browserWs.close();
  });

  req.on("response", (res) => {
    let body = "";
    res.on("data", (chunk) => { body += chunk; });
    res.on("end", () => {
      console.log(`Volc WS: upstream rejected (${res.statusCode}):`, body.slice(0, 200));
      browserWs.close();
    });
  });

  req.end();
});

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  server.listen(port, "127.0.0.1", () => {
    const providers = [];
    if (anthropicAuthToken) providers.push("Anthropic-compatible");
    if (openRouterApiKey) providers.push("OpenRouter");
    if (openAiApiKey) providers.push("OpenAI");
    const provider = providers.length ? providers.join("+") : "OpenAI";
    console.log(`TinyBu proxy (${provider}) listening on http://127.0.0.1:${port}${taskPath}`);
    if (volcAppId && volcAccessKey) console.log(`  Volc WS proxy on ws://127.0.0.1:${port}${volcWsPath}`);
    if (openRouterApiKey) console.log(`  OpenRouter model: ${defaultModel}`);
    if (anthropicAuthToken) console.log(`  Anthropic model: ${normalizeAnthropicModel(defaultModel)}`);
  });
}
