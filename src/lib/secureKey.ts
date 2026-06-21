import { defaultSettings } from "./defaults";

type InvokeFn = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
const LEGACY_API_KEY_STORAGE_KEYS = ["tinybu-dev-openai-key", atob("bm9taS1kZXYtb3BlbmFpLWtleQ==")];
let browserSessionApiKey: string | null = null;

function clearLegacyApiKeys() {
  for (const key of LEGACY_API_KEY_STORAGE_KEYS) localStorage.removeItem(key);
}

async function getInvoke(): Promise<InvokeFn | null> {
  if (!("__TAURI_INTERNALS__" in window)) {
    return null;
  }

  try {
    const mod = await import("@tauri-apps/api/core");
    return mod.invoke as InvokeFn;
  } catch {
    return null;
  }
}

export async function saveUserApiKey(key: string) {
  const invoke = await getInvoke();
  if (invoke) {
    await invoke("save_api_key", { key });
    clearLegacyApiKeys();
    return;
  }
  browserSessionApiKey = key;
  clearLegacyApiKeys();
}

export async function loadUserApiKey() {
  const invoke = await getInvoke();
  if (invoke) {
    const key = await invoke<string | null>("load_api_key");
    if (key) {
      clearLegacyApiKeys();
      return key;
    }

    const legacyKey = LEGACY_API_KEY_STORAGE_KEYS
      .map((storageKey) => localStorage.getItem(storageKey))
      .find((value): value is string => Boolean(value));
    if (legacyKey) {
      await invoke("save_api_key", { key: legacyKey });
      clearLegacyApiKeys();
      return legacyKey;
    }
    return null;
  }

  return browserSessionApiKey;
}

export async function clearUserApiKey() {
  browserSessionApiKey = null;
  clearLegacyApiKeys();
  const invoke = await getInvoke();
  if (invoke) {
    await invoke("clear_api_key");
    return;
  }
}

export function providerLabel(mode: string) {
  if (mode === "user-key") return "用户 API Key";
  if (mode === "cloud-proxy") return "云端代理";
  return defaultSettings.aiProviderMode === "rules" ? "本地规则" : "本地规则";
}
