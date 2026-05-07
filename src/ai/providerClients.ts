import type { AppStateRecord } from "../types";
import { jsonSchemas, taskPrompts } from "./prompts";
import { modelForTask, normalizeOpenRouterModel } from "./providerRouting";
import { buildOpenAiInput, buildOpenRouterMessages } from "./requestBuilders";
import { parseOpenAiJson } from "./responseParsing";

export type ProviderTaskName = keyof typeof taskPrompts;

export async function callOpenAi<T>(
  task: ProviderTaskName,
  payload: unknown,
  appState: AppStateRecord,
  apiKey: string
): Promise<T> {
  const response = await fetch("https://api.openai.com/v1/responses", {
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
      max_output_tokens: task === "screenshotCapture" || task === "screenshotQuestion" ? 1600 : 900
    })
  });

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
  const response = await fetch(`${baseUrl}/chat/completions`, {
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
      max_tokens: task === "screenshotCapture" || task === "screenshotQuestion" ? 1600 : 900
    })
  });

  return parseOpenAiJson(response) as Promise<T>;
}

export async function callCloudProxy<T>(
  task: ProviderTaskName,
  payload: unknown,
  appState: AppStateRecord
): Promise<T> {
  const response = await fetch(appState.settings.cloudProxyUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      task,
      model: modelForTask(task, appState),
      payload
    })
  });

  return parseOpenAiJson(response) as Promise<T>;
}
