
import { Mic, MicOff, Phone, PhoneOff, Loader2 } from "lucide-react";
import type { CallBuState } from "./useCallBu";

const labels: Record<string, Record<string, string>> = {
  中文: {
    callBu: "打电话",
    connecting: "连接中...",
    listening: "正在听...",
    thinking: "思考中...",
    speaking: "说话中...",
    ended: "通话结束",
    endCall: "结束通话",
    callAgain: "重新打电话",
    micError: "无法访问麦克风。请在系统设置 > 隐私与安全性 > 麦克风 中允许本应用访问麦克风。",
    you: "你",
    bu: "Bu",
  },
  English: {
    callBu: "Call Bu",
    connecting: "Connecting...",
    listening: "Listening...",
    thinking: "Thinking...",
    speaking: "Speaking...",
    ended: "Call ended",
    endCall: "End Call",
    callAgain: "Call Again",
    micError: "Microphone access denied. Please allow microphone access in System Settings > Privacy & Security > Microphone.",
    you: "You",
    bu: "Bu",
  },
};

export function CallBu({
  state,
  error,
  userText,
  buText,
  onStart,
  onEnd,
  interfaceLanguage,
  compact,
}: {
  state: CallBuState;
  error: string | null;
  userText: string;
  buText: string;
  onStart: () => void;
  onEnd: () => void;
  interfaceLanguage: "中文" | "English";
  compact?: boolean;
}) {
  const t = labels[interfaceLanguage] || labels.English;

  if (compact) {
    if (state === "idle" || state === "ended") {
      return (
        <button className="primary call-compact-btn" onClick={onStart} title={state === "ended" ? t.callAgain : t.callBu}>
          <Phone size={16} />
        </button>
      );
    }
    if (state === "error") {
      return (
        <button className="primary call-compact-btn" onClick={onStart} title={t.callAgain}>
          <Phone size={16} />
        </button>
      );
    }
    return (
      <div className="call-compact-status">
        <Loader2 size={14} className="spin" />
        <span>{state === "connecting" ? t.connecting : state === "listening" ? t.listening : state === "thinking" ? t.thinking : t.speaking}</span>
      </div>
    );
  }

  if (state === "idle") {
    return (
      <button className="primary bu-call-btn" onClick={onStart}>
        <Phone size={18} />
        {t.callBu}
      </button>
    );
  }

  if (state === "ended") {
    return (
      <button className="primary bu-call-btn" onClick={onStart}>
        <Phone size={18} />
        {t.callAgain}
      </button>
    );
  }

  const statusIcon = (() => {
    switch (state) {
      case "connecting":
        return <Loader2 size={14} className="spin" />;
      case "listening":
        return <Mic size={14} className="pulse" />;
      case "thinking":
        return <Loader2 size={14} className="spin" />;
      case "speaking":
        return <MicOff size={14} />;
      default:
        return null;
    }
  })();

  const statusText = (() => {
    switch (state) {
      case "connecting": return t.connecting;
      case "listening": return t.listening;
      case "thinking": return t.thinking;
      case "speaking": return t.speaking;
      case "error": return error || "Error";
      default: return "";
    }
  })();

  return (
    <div className="call-bu-panel">
      <div className={`call-status ${state}`}>
        {statusIcon}
        <span className="call-status-text">{statusText}</span>
      </div>

      {(userText || buText || state === "listening" || state === "thinking" || state === "speaking") && (
        <div className="call-subtitles">
          {userText && (
            <p className="call-subtitle user">
              <strong>{t.you}:</strong> {userText}
            </p>
          )}
          {buText && (
            <p className="call-subtitle bu">
              <strong>{t.bu}:</strong> {buText}
            </p>
          )}
        </div>
      )}

      {state !== "error" && state !== "connecting" && (
        <button className="secondary bu-end-call-btn" onClick={onEnd}>
          <PhoneOff size={14} />
          {t.endCall}
        </button>
      )}

      {state === "connecting" && (
        <button className="secondary bu-end-call-btn" onClick={onEnd}>
          Cancel
        </button>
      )}

      {state === "error" && (
        <button className="primary bu-call-btn" onClick={onStart}>
          <Phone size={16} />
          {t.callAgain}
        </button>
      )}
    </div>
  );
}
