import type { AppStateRecord } from "../types";

export function modelForTask(task: string, appState: AppStateRecord) {
  return task === "screenshotCapture" || task === "screenshotQuestion"
    ? appState.settings.visionModel || appState.settings.aiModel
    : appState.settings.aiModel;
}

export function isOpenRouterApiKey(apiKey: string) {
  return /^sk-or-/i.test(apiKey.trim());
}

export function isDeepSeekModel(model: string) {
  return model.trim().toLowerCase().startsWith("deepseek");
}

export function isDeepSeekTask(task: string, appState: AppStateRecord) {
  if (task === "screenshotCapture" || task === "screenshotQuestion") return false;
  return isDeepSeekModel(modelForTask(task, appState));
}

export function normalizeOpenRouterModel(model: string) {
  const trimmed = model.trim();
  const aliases: Record<string, string> = {
    "MiniMax-M2.7": "minimax/minimax-m2.7",
    "minimax-m2.7": "minimax/minimax-m2.7",
    "MiniMax M2.7": "minimax/minimax-m2.7",
    "MiniMax-M2": "minimax/minimax-m2",
    "minimax-m2": "minimax/minimax-m2",
    "MiniMax M2": "minimax/minimax-m2"
  };
  return aliases[trimmed] ?? trimmed;
}

export function shouldUseOpenRouter(task: string, appState: AppStateRecord) {
  const baseUrl = appState.settings.openRouterBaseUrl;
  return Boolean(baseUrl) && modelForTask(task, appState).includes("/");
}
