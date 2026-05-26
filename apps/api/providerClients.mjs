import { normalizeOpenRouterModel } from "./providerRouting.mjs";
import {
  buildAnthropicContent,
  buildOpenAiInput,
  buildOpenRouterMessages,
  extractJsonText
} from "./requestBuilders.mjs";
import { quickPetChatPrompt, schemaFor, taskPrompts } from "./taskSchemas.mjs";

export function createProviderClients({
  anthropicAuthToken,
  anthropicEndpoint,
  deepSeekApiKey,
  deepSeekBaseUrl,
  fetchWithTimeout,
  openAiApiKey,
  openRouterApiKey,
  openRouterBaseUrl
}) {
  async function callAnthropic(task, model, payload) {
    const schema = schemaFor(task);
    const body = {
      model,
      max_tokens: task === "screenshotCapture" || task === "practiceChatReview" ? 1600 : 900,
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
        max_output_tokens: task === "screenshotCapture" || task === "practiceChatReview" ? 1600 : 900
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
        max_tokens: task === "screenshotCapture" || task === "screenshotQuestion" || task === "practiceChatReview" ? 1600 : 900
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

  async function callDeepSeek(task, model, payload) {
    const response = await fetchWithTimeout(`${deepSeekBaseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${deepSeekApiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: `${taskPrompts[task]}\nReturn only valid JSON. Do not wrap it in markdown.` },
          ...buildOpenRouterMessages(task, payload)
        ],
        response_format: { type: "json_object" },
        max_tokens: task === "practiceChatReview" ? 1600 : 900,
        temperature: 0.35,
        stream: false
      })
    });
    const data = await response.json();
    if (!response.ok) return { response, data };
    return { response, data: { output_text: data.choices?.[0]?.message?.content ?? "" } };
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

  async function callQuickPetChatDeepSeek(model, payload) {
    const response = await fetchWithTimeout(`${deepSeekBaseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${deepSeekApiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: quickPetChatPrompt },
          { role: "user", content: String(payload?.message ?? "") }
        ],
        max_tokens: 70,
        temperature: 0.35,
        stream: false
      })
    });
    const data = await response.json();
    if (!response.ok) return { response, data };
    return { response, data: { output_text: data.choices?.[0]?.message?.content ?? "" } };
  }

  return {
    callAnthropic,
    callDeepSeek,
    callOpenAi,
    callOpenRouter,
    callQuickPetChatAnthropic,
    callQuickPetChatDeepSeek,
    callQuickPetChatOpenAi,
    callQuickPetChatOpenRouter
  };
}
