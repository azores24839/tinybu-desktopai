
import { useRef, useState, useCallback } from "react";
import { encodeFrame, decodeFrame, EVENT_ID, SERVER_EVENT } from "../../lib/volcengine/binaryProtocol";

export type CallBuState = "idle" | "connecting" | "listening" | "thinking" | "speaking" | "ended" | "error";

export function useCallBu(topic: { title: string; summary: string }) {
  const [state, setState] = useState<CallBuState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [userText, setUserText] = useState("");
  const [buText, setBuText] = useState("");

  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const audioQueueRef = useRef<ArrayBuffer[]>([]);
  const playingRef = useRef(false);
  const callingRef = useRef(false);
  const stateRef = useRef<CallBuState>("idle");

  const updateState = useCallback((s: CallBuState) => {
    stateRef.current = s;
    setState(s);
  }, []);

  function stopMic() {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }

  function stopAudio() {
    audioQueueRef.current = [];
    playingRef.current = false;
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
  }

  function playNextChunk() {
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") return;
    const queue = audioQueueRef.current;
    if (queue.length === 0) {
      playingRef.current = false;
      return;
    }
    playingRef.current = true;
    const chunk = queue.shift()!;
    const int16 = new Int16Array(chunk);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768;
    }
    const buffer = audioCtxRef.current.createBuffer(1, float32.length, 24000);
    buffer.getChannelData(0).set(float32);
    const source = audioCtxRef.current.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtxRef.current.destination);
    source.onended = () => playNextChunk();
    source.start();
  }

  function enqueueAudio(data: ArrayBuffer) {
    audioQueueRef.current.push(data);
    if (!playingRef.current) playNextChunk();
  }

  function startAudioPipeline(stream: MediaStream) {
    const audioCtx = new AudioContext();
    audioCtxRef.current = audioCtx;
    const source = audioCtx.createMediaStreamSource(stream);

    const processor = audioCtx.createScriptProcessor(2048, 1, 1);
    processorRef.current = processor;

    let leftover = new Float32Array(0);

    processor.onaudioprocess = (e) => {
      if (stateRef.current !== "listening" && stateRef.current !== "thinking" && stateRef.current !== "speaking") return;

      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      const input = e.inputBuffer.getChannelData(0);
      const combined = new Float32Array(leftover.length + input.length);
      combined.set(leftover);
      combined.set(input, leftover.length);

      const inRate = audioCtx.sampleRate;
      const outRate = 16000;
      const ratio = inRate / outRate;
      const outLen = Math.floor(combined.length / ratio);

      const resampled = new Float32Array(outLen);
      for (let i = 0; i < outLen; i++) {
        const srcIdx = i * ratio;
        const i0 = Math.floor(srcIdx);
        const i1 = Math.min(i0 + 1, combined.length - 1);
        const frac = srcIdx - i0;
        resampled[i] = combined[i0] * (1 - frac) + combined[i1] * frac;
      }

      const remainderIdx = Math.ceil(outLen * ratio);
      leftover = combined.slice(remainderIdx);

      const int16 = new Int16Array(resampled.length);
      for (let i = 0; i < resampled.length; i++) {
        const s = Math.max(-1, Math.min(1, resampled[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }

      const buf = new ArrayBuffer(int16.length * 2);
      const view = new DataView(buf);
      for (let i = 0; i < int16.length; i++) {
        view.setInt16(i * 2, int16[i], true);
      }

      const frame = encodeFrame({
        messageType: 2,
        eventId: EVENT_ID.TaskRequest,
        payload: new Uint8Array(buf),
      });
      ws.send(frame);
    };

    source.connect(processor);
    processor.connect(audioCtx.destination);
  }

  function handleServerMessage(data: ArrayBuffer) {
    const frame = decodeFrame(data);
    if (!frame) return;

    const eventName = frame.eventId ? SERVER_EVENT[frame.eventId] : undefined;
    const payloadStr = frame.payload.length > 0 ? new TextDecoder().decode(frame.payload) : "";

    switch (eventName) {
      case "ConnectionStarted":
        break;
      case "SessionStarted":
        updateState("listening");
        break;
      case "SessionFinished":
        break;
      case "ConnectionFinished":
        break;

      case "ConnectionFailed":
      case "SessionFailed": {
        let msg = "";
        try { msg = JSON.parse(payloadStr).error || payloadStr; } catch { msg = payloadStr; }
        setError(msg);
        updateState("error");
        cleanup();
        break;
      }

      case "DialogCommonError": {
        let msg = "";
        try { msg = JSON.parse(payloadStr).message || payloadStr; } catch { msg = payloadStr; }
        setError(msg);
        updateState("error");
        break;
      }

      case "ASRInfo":
        break;

      case "ASRResponse": {
        try {
          const asr = JSON.parse(payloadStr);
          if (asr.results?.length) {
            const text = asr.results[asr.results.length - 1].text || "";
            if (text && !asr.results[0].is_interim) setUserText(text);
          }
        } catch { /* ignore */ }
        break;
      }

      case "ASREnded":
        updateState("thinking");
        break;

      case "ChatResponse": {
        try {
          const chat = JSON.parse(payloadStr);
          if (chat.content) setBuText(chat.content);
        } catch { /* ignore */ }
        break;
      }

      case "TTSSentenceStart": {
        updateState("speaking");
        try {
          const tts = JSON.parse(payloadStr);
          if (tts.text) setBuText(tts.text);
        } catch { /* ignore */ }
        break;
      }

      case "TTSResponse":
        enqueueAudio(new Uint8Array(frame.payload).buffer.slice(0));
        break;

      case "TTSEnded":
        updateState("listening");
        break;

      case "ChatEnded":
        break;

      case "UsageResponse":
        break;

      default:
        if (frame.messageType === 15) {
          let msg = "";
          try { msg = JSON.parse(payloadStr).error || payloadStr; } catch { msg = payloadStr; }
          setError(msg);
          updateState("error");
          cleanup();
        }
        break;
    }
  }

  function cleanup() {
    callingRef.current = false;
    stopMic();
    stopAudio();
    const ws = wsRef.current;
    if (ws) {
      wsRef.current = null;
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close(1000);
      }
    }
  }

  const startCall = useCallback(async () => {
    if (callingRef.current) return;
    callingRef.current = true;
    const wsUrl = (import.meta.env.VITE_VOLC_WS_URL as string) || "ws://127.0.0.1:8787/v1/volc-ws";

    setError(null);
    setUserText("");
    setBuText("");
    updateState("connecting");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 } });
      streamRef.current = stream;
    } catch {
      setError("Microphone access denied. Please allow microphone access in System Settings > Privacy & Security > Microphone.");
      updateState("error");
      callingRef.current = false;
      return;
    }

    const connectId = crypto.randomUUID();
    const sessionId = crypto.randomUUID();
    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(encodeFrame({
        messageType: 1,
        eventId: EVENT_ID.StartConnection,
        connectId,
        payload: "{}",
      }));

      const topicTitle = topic.title.replace(/"/g, "'");
      const topicSummary = (topic.summary || "").replace(/"/g, "'");

      ws.send(encodeFrame({
        messageType: 1,
        eventId: EVENT_ID.StartSession,
        sessionId,
        payload: JSON.stringify({
          tts: {
            audio_config: { channel: 1, format: "pcm_s16le", sample_rate: 24000 },
            speaker: "zh_female_vv_jupiter_bigtts",
          },
          asr: {
            audio_info: { format: "pcm", sample_rate: 16000, channel: 1 },
          },
          dialog: {
            bot_name: "Bu",
            system_role: `You are Bu, a gentle language practice buddy. Topic: ${topicTitle}. Summary: ${topicSummary}. Keep replies short (1-3 sentences) and friendly.`,
            speaking_style: "You speak warmly and encouragingly, in short sentences.",
            extra: { model: "1.2.1.1" },
          },
        }),
      }));

      startAudioPipeline(stream);
    };

    ws.onmessage = (e) => {
      if (e.data instanceof ArrayBuffer) handleServerMessage(e.data);
    };

    ws.onerror = () => {
      if (stateRef.current === "connecting") {
        setError("WebSocket connection failed. Is the API proxy running? (npm run api:dev)");
        updateState("error");
        cleanup();
      }
    };

    ws.onclose = () => {
      cleanup();
      if (stateRef.current !== "ended" && stateRef.current !== "error") {
        updateState("ended");
      }
    };
  }, [topic.title, topic.summary, updateState]);

  const endCall = useCallback(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      const sessionId = crypto.randomUUID();
      ws.send(encodeFrame({
        messageType: 1,
        eventId: EVENT_ID.FinishSession,
        sessionId,
        payload: "{}",
      }));
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(encodeFrame({
            messageType: 1,
            eventId: EVENT_ID.FinishConnection,
            payload: "{}",
          }));
        }
      }, 300);
    }
    stopMic();
    stopAudio();
    updateState("ended");
    wsRef.current = null;
  }, [updateState]);

  return { state, error, userText, buText, startCall, endCall };
}
