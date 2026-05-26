import {
  isAnthropicCompatibleModel,
  isDeepSeekModel,
  isProviderQualifiedModel,
  normalizeAnthropicModel,
  normalizeOpenRouterModel,
  shouldUseOpenRouterModel
} from "./providerRouting.mjs";
import { log, logReq, logRes, sendJson } from "./httpUtils.mjs";
import { taskPrompts } from "./taskSchemas.mjs";

async function handlePracticeChat({
  anthropicAuthToken,
  anthropicEndpoint,
  deepSeekApiKey,
  deepSeekBaseUrl,
  fetchWithTimeout,
  model,
  openAiApiKey,
  openRouterApiKey,
  openRouterBaseUrl,
  payload,
  res
}) {
  if (deepSeekApiKey && isDeepSeekModel(model)) {
    const messages = [
      { role: "system", content: taskPrompts.practiceChat },
      { role: "system", content: `Current practice source: ${payload?.topicName || ""}\nGoal: ${payload?.practiceGoal || "low-pressure speaking practice"}` },
      ...(payload?.chatHistory || []).slice(-6).map((msg) => ({
        role: msg.role === "bu" ? "assistant" : "user",
        content: msg.text
      })),
      { role: "user", content: payload?.userAnswer || "" }
    ];
    const reqBody = { model, messages, max_tokens: 150, temperature: 0.5, stream: false };
    logReq("practiceChat → deepseek", reqBody);

    const response = await fetchWithTimeout(`${deepSeekBaseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${deepSeekApiKey}`
      },
      body: JSON.stringify(reqBody)
    });
    const data = await response.json();
    logRes("practiceChat ← deepseek", response.status, data);
    if (!response.ok) {
      sendJson(res, response.status, data);
      return;
    }
    sendJson(res, 200, { output_text: data.choices?.[0]?.message?.content ?? "" });
    return;
  }

  if (isDeepSeekModel(model) && !deepSeekApiKey) {
    log("WARN", "practiceChat: no DEEPSEEK_API_KEY set for model", model);
    sendJson(res, 500, { error: `Configure DEEPSEEK_API_KEY before using ${model}.` });
    return;
  }

  if (anthropicAuthToken && isAnthropicCompatibleModel(model)) {
    const messages = [
      {
        role: "user",
        content: JSON.stringify({
          topicName: payload?.topicName,
          practiceGoal: payload?.practiceGoal,
          userAnswer: payload?.userAnswer,
          chatHistory: (payload?.chatHistory || []).slice(-6)
        })
      }
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
      { role: "system", content: `Current practice source: ${payload?.topicName || ""}\nGoal: ${payload?.practiceGoal || "low-pressure speaking practice"}` },
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

  const input = `Practice source: ${payload?.topicName || ""}\nGoal: ${payload?.practiceGoal || "low-pressure speaking practice"}\nUser: ${payload?.userAnswer || ""}`;
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
}

async function handleQuickPetChat({
  anthropicAuthToken,
  clients,
  deepSeekApiKey,
  model,
  openAiApiKey,
  openRouterApiKey,
  payload,
  res
}) {
  if (deepSeekApiKey && isDeepSeekModel(model)) {
    log("REQ", "quickPetChat route=deepseek");
    const { response, data } = await clients.callQuickPetChatDeepSeek(model, payload);
    logRes("quickPetChat ← deepseek", response.status, data);
    sendJson(res, response.status, data);
    return;
  }

  if (isDeepSeekModel(model) && !deepSeekApiKey) {
    log("WARN", "quickPetChat: no DEEPSEEK_API_KEY");
    sendJson(res, 500, { error: `Configure DEEPSEEK_API_KEY before using ${model}.` });
    return;
  }

  if (anthropicAuthToken && isAnthropicCompatibleModel(model)) {
    log("REQ", "quickPetChat route=anthropic");
    const { response, data } = await clients.callQuickPetChatAnthropic(normalizeAnthropicModel(model), payload);
    logRes("quickPetChat ← anthropic", response.status, data);
    sendJson(res, response.status, data);
    return;
  }

  if (openRouterApiKey && shouldUseOpenRouterModel(model, { anthropicAuthToken })) {
    log("REQ", "quickPetChat route=openrouter");
    const { response, data } = await clients.callQuickPetChatOpenRouter(model, payload);
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
  const { response, data } = await clients.callQuickPetChatOpenAi(model, payload);
  logRes("quickPetChat ← openai", response.status, data);
  sendJson(res, response.status, data);
}

export async function handleChatTask(args) {
  if (args.task === "practiceChat") {
    await handlePracticeChat(args);
    return true;
  }

  if (args.task === "quickPetChat") {
    await handleQuickPetChat(args);
    return true;
  }

  return false;
}
