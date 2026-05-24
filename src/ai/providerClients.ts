import type { AppStateRecord, QuickPetChatOutput } from "../types";
import { fetchWithTimeout } from "./fetchWithTimeout";
import { jsonSchemas, taskPrompts } from "./prompts";
import { modelForTask, normalizeOpenRouterModel } from "./providerRouting";
import { buildOpenAiInput, buildOpenRouterMessages } from "./requestBuilders";
import { parseOpenAiJson, parseOpenAiText, quickReplyText } from "./responseParsing";

export type ProviderTaskName = keyof typeof taskPrompts;
const QUICK_PET_CHAT_PROMPT =
  "TinyBu desktop buddy. Reply in the user's language. Max 35 Chinese chars or 18 English words. No markdown.";

export async function callOpenAi<T>(
  task: ProviderTaskName,
  payload: unknown,
  appState: AppStateRecord,
  apiKey: string
): Promise<T> {
  const response = await fetchWithTimeout(
    "https://api.openai.com/v1/responses",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: modelForTask(task, appState),
        instructions: taskPrompts[task],
        input: buildOpenAiInput(task, payload),
        text: {
          format: {
            type: "json_schema",
            ...jsonSchemas[task],
            strict: true
          }
        },
        max_output_tokens: task === "screenshotCapture" || task === "screenshotQuestion" || task === "practiceChatReview" ? 1600 : 900
      })
    },
    25000
  );

  return parseOpenAiJson(response) as Promise<T>;
}

export async function callOpenRouter<T>(
  task: ProviderTaskName,
  payload: unknown,
  appState: AppStateRecord,
  apiKey: string
): Promise<T> {
  const baseUrl = (appState.settings.openRouterBaseUrl || "https://openrouter.ai/api/v1").replace(/\/+$/, "");
  const schema = jsonSchemas[task];
  const model = normalizeOpenRouterModel(modelForTask(task, appState));
  const response = await fetchWithTimeout(
    `${baseUrl}/chat/completions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": window.location.origin,
        "X-Title": "TinyBu Desktop"
      },
      body: JSON.stringify({
        model,
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
        max_tokens: task === "screenshotCapture" || task === "screenshotQuestion" || task === "practiceChatReview" ? 1600 : 900
      })
    },
    25000
  );

  return parseOpenAiJson(response) as Promise<T>;
}

export async function callCloudProxy<T>(
  task: ProviderTaskName,
  payload: unknown,
  appState: AppStateRecord
): Promise<T> {
  const response = await fetchWithTimeout(
    appState.settings.cloudProxyUrl,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task,
        model: modelForTask(task, appState),
        payload
      })
    },
    25000
  );

  return parseOpenAiJson(response) as Promise<T>;
}

export async function callQuickPetChatOpenAi(
  payload: { message: string; [key: string]: unknown },
  appState: AppStateRecord,
  apiKey: string
): Promise<QuickPetChatOutput> {
  const response = await fetchWithTimeout(
    "https://api.openai.com/v1/responses",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: modelForTask("quickPetChat", appState),
        instructions: QUICK_PET_CHAT_PROMPT,
        input: String(payload.message),
        max_output_tokens: 70
      })
    },
    12000
  );

  return { reply: quickReplyText(await parseOpenAiText(response)) };
}

export async function callQuickPetChatOpenRouter(
  payload: { message: string; [key: string]: unknown },
  appState: AppStateRecord,
  apiKey: string
): Promise<QuickPetChatOutput> {
  const baseUrl = (appState.settings.openRouterBaseUrl || "https://openrouter.ai/api/v1").replace(/\/+$/, "");
  const response = await fetchWithTimeout(
    `${baseUrl}/chat/completions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": window.location.origin,
        "X-Title": "TinyBu Desktop"
      },
      body: JSON.stringify({
        model: normalizeOpenRouterModel(modelForTask("quickPetChat", appState)),
        messages: [
          { role: "system", content: QUICK_PET_CHAT_PROMPT },
          { role: "user", content: String(payload.message) }
        ],
        max_tokens: 70,
        temperature: 0.35
      })
    },
    12000
  );

  return { reply: quickReplyText(await parseOpenAiText(response)) };
}

export async function callQuickPetChatCloudProxy(
  payload: { message: string; [key: string]: unknown },
  appState: AppStateRecord
): Promise<QuickPetChatOutput> {
  const response = await fetchWithTimeout(
    appState.settings.cloudProxyUrl,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task: "quickPetChat",
        model: modelForTask("quickPetChat", appState),
        payload: {
          message: payload.message,
          fast: true
        }
      })
    },
    12000
  );

  return { reply: quickReplyText(await parseOpenAiText(response)) };
}

export async function callPracticeChatOpenAi(
  payload: { userAnswer: string; topicName: string; practiceGoal?: string; chatHistory: Array<{ role: string; text: string }> },
  appState: AppStateRecord,
  apiKey: string
): Promise<string> {
  const historyText = payload.chatHistory
    .slice(-6)
    .map((msg) => `${msg.role === "bu" ? "TinyBu" : "User"}: ${msg.text}`)
    .join("\n");
  const input = `Practice source: ${payload.topicName}\nGoal: ${payload.practiceGoal ?? "low-pressure speaking practice"}\n\nChat history:\n${historyText}\n\nUser: ${payload.userAnswer}\n\nTinyBu:`;

  const response = await fetchWithTimeout(
    "https://api.openai.com/v1/responses",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: modelForTask("practiceChat", appState),
        instructions: taskPrompts.practiceChat,
        input,
        max_output_tokens: 150
      })
    },
    15000
  );

  return (await parseOpenAiText(response)).trim();
}

export async function callPracticeChatOpenRouter(
  payload: { userAnswer: string; topicName: string; practiceGoal?: string; chatHistory: Array<{ role: string; text: string }> },
  appState: AppStateRecord,
  apiKey: string
): Promise<string> {
  const baseUrl = (appState.settings.openRouterBaseUrl || "https://openrouter.ai/api/v1").replace(/\/+$/, "");
  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: taskPrompts.practiceChat },
    { role: "system", content: `Current practice source: ${payload.topicName}\nGoal: ${payload.practiceGoal ?? "low-pressure speaking practice"}` },
    ...payload.chatHistory.slice(-6).map((msg) => ({
      role: msg.role === "bu" ? "assistant" : "user",
      content: msg.text
    })),
    { role: "user", content: payload.userAnswer }
  ];

  const response = await fetchWithTimeout(
    `${baseUrl}/chat/completions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": window.location.origin,
        "X-Title": "TinyBu Desktop"
      },
      body: JSON.stringify({
        model: normalizeOpenRouterModel(modelForTask("practiceChat", appState)),
        messages,
        max_tokens: 150,
        temperature: 0.5
      })
    },
    15000
  );

  return (await parseOpenAiText(response)).trim();
}

export async function callPracticeChatCloudProxy(
  payload: { userAnswer: string; topicName: string; practiceGoal?: string; chatHistory: Array<{ role: string; text: string }> },
  appState: AppStateRecord
): Promise<string> {
  const response = await fetchWithTimeout(
    appState.settings.cloudProxyUrl,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task: "practiceChat",
        model: modelForTask("practiceChat", appState),
        payload: {
          userAnswer: payload.userAnswer,
          topicName: payload.topicName,
          practiceGoal: payload.practiceGoal,
          chatHistory: payload.chatHistory.slice(-6)
        }
      })
    },
    15000
  );

  return (await parseOpenAiText(response)).trim();
}
