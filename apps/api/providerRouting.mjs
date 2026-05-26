export function normalizeOpenRouterModel(model = "") {
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

export function normalizeAnthropicModel(model = "") {
  const trimmed = model.trim();
  const aliases = {
    "minimax/minimax-m2.7": "MiniMax-M2.7",
    "minimax-m2.7": "MiniMax-M2.7",
    "MiniMax M2.7": "MiniMax-M2.7",
    "minimax/minimax-m2": "MiniMax-M2",
    "minimax-m2": "MiniMax-M2",
    "MiniMax M2": "MiniMax-M2"
  };
  return aliases[trimmed] ?? trimmed;
}

export function isAnthropicCompatibleModel(model = "") {
  const trimmed = model.trim().toLowerCase();
  return trimmed.startsWith("minimax") || trimmed.startsWith("claude") || trimmed.startsWith("anthropic/");
}

export function isDeepSeekModel(model = "") {
  return model.trim().toLowerCase().startsWith("deepseek");
}

export function shouldUseOpenRouterModel(model = "", options = {}) {
  const normalized = normalizeOpenRouterModel(model);
  const token = options.anthropicAuthToken;
  return normalized.includes("/") && (!token || !isAnthropicCompatibleModel(normalized));
}

export function isProviderQualifiedModel(model = "") {
  return normalizeOpenRouterModel(model).includes("/");
}
