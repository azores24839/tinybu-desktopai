import { invoke } from "@tauri-apps/api/core";
import { listen, type Event, type UnlistenFn } from "@tauri-apps/api/event";

export interface CaptureBridgeState {
  count: number;
  pendingCount: number;
}

export function isRunningInTauri() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function invokeTauri<T>(command: string, args?: Record<string, unknown>): Promise<T | null> {
  if (!isRunningInTauri()) return null;

  try {
    return await invoke<T>(command, args);
  } catch (error) {
    console.warn(`Tauri command failed: ${command}`, error);
    return null;
  }
}

export async function listenTauri<T>(
  eventName: string,
  handler: (event: Event<T>) => void
): Promise<UnlistenFn> {
  if (!isRunningInTauri()) return () => {};

  try {
    return await listen<T>(eventName, handler);
  } catch (error) {
    console.warn(`Tauri event listen failed: ${eventName}`, error);
    return () => {};
  }
}
