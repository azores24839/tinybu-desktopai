
const MESSAGE_TYPE = { FULL_CLIENT: 1, AUDIO_ONLY_CLIENT: 2, FULL_SERVER: 9, AUDIO_ONLY_SERVER: 11, ERROR: 15 } as const;
const FLAG_EVENT = 0x04;
const FLAG_SEQ_NON_TERM = 0x01;
const FLAG_SEQ_LAST = 0x02;

export const EVENT_ID = {
  StartConnection: 1,
  FinishConnection: 2,
  StartSession: 100,
  FinishSession: 102,
  TaskRequest: 200,
} as const;

export const SERVER_EVENT: Record<number, string> = {
  50: "ConnectionStarted",
  51: "ConnectionFailed",
  52: "ConnectionFinished",
  150: "SessionStarted",
  152: "SessionFinished",
  153: "SessionFailed",
  154: "UsageResponse",
  350: "TTSSentenceStart",
  351: "TTSSentenceEnd",
  352: "TTSResponse",
  359: "TTSEnded",
  450: "ASRInfo",
  451: "ASRResponse",
  459: "ASREnded",
  550: "ChatResponse",
  559: "ChatEnded",
  599: "DialogCommonError",
};

export interface DecodedFrame {
  messageType: number;
  eventId?: number;
  sessionId?: string;
  connectId?: number;
  errorCode?: number;
  payload: Uint8Array;
}

function writeU32BE(buf: number[], v: number) {
  buf.push((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);
}

export function encodeFrame(opts: {
  messageType: number;
  eventId?: number;
  sessionId?: string;
  connectId?: string;
  payload?: Uint8Array | string;
}): ArrayBuffer {
  const { messageType, eventId, sessionId, connectId, payload } = opts;
  const header: number[] = [0x11, 0, 0, 0];
  let flags = 0;
  if (eventId !== undefined) flags |= FLAG_EVENT;
  header[1] = (messageType << 4) | flags;
  header[2] = (messageType === MESSAGE_TYPE.AUDIO_ONLY_CLIENT ? 0x00 : 0x10); // Raw for audio, JSON for client
  const bytes = [...header];

  if (eventId !== undefined) writeU32BE(bytes, eventId);
  if (connectId) {
    const enc = new TextEncoder().encode(connectId);
    writeU32BE(bytes, enc.length);
    bytes.push(...enc);
  }
  if (sessionId) {
    const enc = new TextEncoder().encode(sessionId);
    writeU32BE(bytes, enc.length);
    bytes.push(...enc);
  }

  let payloadBytes: Uint8Array;
  if (payload instanceof Uint8Array) {
    payloadBytes = payload;
  } else if (typeof payload === "string") {
    payloadBytes = new TextEncoder().encode(payload);
  } else {
    payloadBytes = new Uint8Array(0);
  }
  writeU32BE(bytes, payloadBytes.length);
  bytes.push(...payloadBytes);
  return new Uint8Array(bytes).buffer;
}

export function decodeFrame(data: ArrayBuffer | Uint8Array): DecodedFrame | null {
  const buf = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (buf.length < 4) return null;

  const messageType = (buf[1] >>> 4) & 0x0f;
  const flags = buf[1] & 0x0f;
  let pos = 4;

  let errorCode: number | undefined;
  if (messageType === MESSAGE_TYPE.ERROR) {
    errorCode = (buf[pos] << 24) | (buf[pos + 1] << 16) | (buf[pos + 2] << 8) | buf[pos + 3];
    pos += 4;
  }

  let eventId: number | undefined;
  if (flags & FLAG_EVENT) {
    eventId = (buf[pos] << 24) | (buf[pos + 1] << 16) | (buf[pos + 2] << 8) | buf[pos + 3];
    pos += 4;
  }

  let connectId: number | undefined;
  let sessionId: string | undefined;
  const isClientConnect = eventId === 1 || eventId === 2;
  const isSessionEvent = eventId !== undefined && eventId >= 100;
  if (isClientConnect && pos + 4 <= buf.length) {
    const idSize = (buf[pos] << 24) | (buf[pos + 1] << 16) | (buf[pos + 2] << 8) | buf[pos + 3];
    pos += 4;
    if (idSize > 0) connectId = idSize;
    pos += idSize;
  } else if (isSessionEvent && pos + 4 <= buf.length) {
    const idSize = (buf[pos] << 24) | (buf[pos + 1] << 16) | (buf[pos + 2] << 8) | buf[pos + 3];
    pos += 4;
    if (idSize > 0 && pos + idSize <= buf.length) {
      sessionId = new TextDecoder().decode(buf.slice(pos, pos + idSize));
      pos += idSize;
    }
  }

  const payloadSize = (buf[pos] << 24) | (buf[pos + 1] << 16) | (buf[pos + 2] << 8) | buf[pos + 3];
  pos += 4;
  const payload = buf.slice(pos, pos + payloadSize);

  return { messageType, eventId, sessionId, connectId, errorCode, payload };
}
