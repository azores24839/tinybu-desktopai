import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle, Info, X } from "lucide-react";
import { dismissToast, getToasts, subscribeToasts, type ToastItem } from "../lib/toast";

export function ToastContainer() {
  const [, setTick] = useState(0);

  useEffect(() => {
    return subscribeToasts(() => setTick((prev) => prev + 1));
  }, []);

  const toasts = getToasts();
  if (!toasts.length) return null;

  return (
    <div className="toast-container">
      {toasts.map((toast: ToastItem) => {
        const Icon = toast.type === "error" ? AlertCircle : toast.type === "success" ? CheckCircle : Info;
        return (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            <Icon size={16} />
            <span>{toast.message}</span>
            <button className="toast-close" onClick={() => dismissToast(toast.id)}>
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
