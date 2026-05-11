type ToastType = "info" | "error" | "success";

export type ToastItem = {
  id: number;
  message: string;
  type: ToastType;
};

let toastId = 0;
let toasts: ToastItem[] = [];
let listener: (() => void) | null = null;

function notify() {
  listener?.();
}

function removeToast(id: number) {
  toasts = toasts.filter((item) => item.id !== id);
  notify();
}

export function dismissToast(id: number) {
  removeToast(id);
}

export function showToast(message: string, type: ToastType = "error") {
  const id = ++toastId;
  toasts = [...toasts, { id, message, type }];
  notify();
  setTimeout(() => removeToast(id), 4500);
}

export function subscribeToasts(callback: () => void) {
  listener = callback;
  return () => {
    listener = null;
  };
}

export function getToasts(): ToastItem[] {
  return toasts;
}
