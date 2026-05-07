import { defaultSettings } from "./defaults";

type InvokeFn = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
const USER_API_KEY_STORAGE = "tinybu-dev-openai-key";

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
  localStorage.setItem(USER_API_KEY_STORAGE, key);
  const invoke = await getInvoke();
  if (invoke) {
    try {
      await invoke("save_api_key", { key });
    } catch (error) {
      console.warn("Unable to save API key to system keychain; local backup was saved.", error);
    }
    return;
  }
}

export async function loadUserApiKey() {
  const invoke = await getInvoke();
  if (invoke) {
    try {
      const key = await invoke<string | null>("load_api_key");
      if (key) return key;
    } catch (error) {
      console.warn("Unable to load API key from system keychain; trying local backup.", error);
    }
  }

  return localStorage.getItem(USER_API_KEY_STORAGE);
}

export async function clearUserApiKey() {
  localStorage.removeItem(USER_API_KEY_STORAGE);
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
