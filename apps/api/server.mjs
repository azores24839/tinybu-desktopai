import http from "node:http";
import { pathToFileURL } from "node:url";
import {
  isAnthropicCompatibleModel,
  isDeepSeekModel,
  isProviderQualifiedModel,
  normalizeAnthropicModel,
  shouldUseOpenRouterModel
} from "./providerRouting.mjs";
import { handleChatTask } from "./chatTaskHandlers.mjs";
import { createProviderClients } from "./providerClients.mjs";
import { schemaFor, taskPrompts } from "./taskSchemas.mjs";
import {
  fetchWithTimeout as fetchWithTimeoutBase,
  log,
  logRes,
  readBody,
  sendJson
} from "./httpUtils.mjs";
import { attachVolcWsProxy } from "./volcWsProxy.mjs";

const port = Number(process.env.PORT ?? 8787);
const openAiApiKey = process.env.OPENAI_API_KEY;
const deepSeekApiKey = process.env.DEEPSEEK_API_KEY;
const deepSeekBaseUrl = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
const openRouterApiKey = process.env.OPENROUTER_API_KEY;
const openRouterBaseUrl = process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
const anthropicAuthToken = process.env.ANTHROPIC_AUTH_TOKEN;
const anthropicBaseUrl = process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com";
const apiTimeoutMs = Number(process.env.API_TIMEOUT_MS ?? 300000);
const taskPath = "/v1/tinybu/task";
const volcWsPath = "/v1/volc-ws";
const volcAppId = process.env.VOLC_APP_ID ?? "";
const volcAccessKey = process.env.VOLC_ACCESS_KEY ?? "";
const defaultModel =
  process.env.DEEPSEEK_MODEL ??
  process.env.ANTHROPIC_MODEL ??
  process.env.ANTHROPIC_DEFAULT_SONNET_MODEL ??
  process.env.OPENAI_MODEL ??
  "deepseek-v4-flash";

function anthropicEndpoint() {
  const base = anthropicBaseUrl.replace(/\/+$/, "");
  return base.endsWith("/v1") ? `${base}/messages` : `${base}/v1/messages`;
}

async function fetchWithTimeout(url, options) {
  return fetchWithTimeoutBase(url, options, apiTimeoutMs);
}

const clients = createProviderClients({
  anthropicAuthToken,
  anthropicEndpoint,
  deepSeekApiKey,
  deepSeekBaseUrl,
  fetchWithTimeout,
  openAiApiKey,
  openRouterApiKey,
  openRouterBaseUrl
});

const {
  callAnthropic,
  callDeepSeek,
  callOpenAi,
  callOpenRouter
} = clients;

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

    const handledChatTask = await handleChatTask({
      anthropicAuthToken,
      anthropicEndpoint,
      clients,
      deepSeekApiKey,
      deepSeekBaseUrl,
      fetchWithTimeout,
      model,
      openAiApiKey,
      openRouterApiKey,
      openRouterBaseUrl,
      payload,
      res,
      task
    });
    if (handledChatTask) {
      return;
    }

    if (deepSeekApiKey && isDeepSeekModel(model)) {
      log("REQ", `task=${task} route=deepseek model=${model}`);
      const { response, data } = await callDeepSeek(task, model, payload);
      logRes(`task=${task} route=deepseek`, response.status, data);
      sendJson(res, response.status, data);
      return;
    }

    if (isDeepSeekModel(model) && !deepSeekApiKey) {
      log("WARN", `task=${task} no DEEPSEEK_API_KEY for model=${model}`);
      sendJson(res, 500, { error: `Configure DEEPSEEK_API_KEY before using ${model}.` });
      return;
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

attachVolcWsProxy(server, {
  path: volcWsPath,
  appId: volcAppId,
  accessKey: volcAccessKey
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
