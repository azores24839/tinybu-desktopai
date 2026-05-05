import { defaultSettings } from "./defaults";

type InvokeFn = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

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
    return;
  }

  localStorage.setItem("nomi-dev-openai-key", key);
}

export async function loadUserApiKey() {
  const invoke = await getInvoke();
  if (invoke) {
    return invoke<string | null>("load_api_key");
  }

  return localStorage.getItem("nomi-dev-openai-key");
}

export async function clearUserApiKey() {
  const invoke = await getInvoke();
  if (invoke) {
    await invoke("clear_api_key");
    return;
  }

  localStorage.removeItem("nomi-dev-openai-key");
}

export function providerLabel(mode: string) {
  if (mode === "user-key") return "用户 API Key";
  if (mode === "cloud-proxy") return "云端代理";
  return defaultSettings.aiProviderMode === "rules" ? "本地规则" : "本地规则";
}
