import crypto from "node:crypto";
import https from "node:https";
import { WebSocket, WebSocketServer } from "ws";

const volcResourceId = "volc.speech.dialog";
const volcAppKey = "PlgvMymc7f3tQnJ6";

function encodeWsFrame(payload, opcode = 2) {
  const len = payload.length;
  const maskKey = crypto.randomBytes(4);
  let header;
  if (len < 126) {
    header = Buffer.alloc(6);
    header[0] = 0x80 | opcode;
    header[1] = len | 0x80;
  } else if (len < 65536) {
    header = Buffer.alloc(8);
    header[0] = 0x80 | opcode;
    header[1] = 126 | 0x80;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(14);
    header[0] = 0x80 | opcode;
    header[1] = 127 | 0x80;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  maskKey.copy(header, header.length - 4);
  const masked = Buffer.alloc(len);
  for (let i = 0; i < len; i++) {
    masked[i] = payload[i] ^ maskKey[i % 4];
  }
  return Buffer.concat([header, masked]);
}

function createWsFrameParser() {
  let buffered = Buffer.alloc(0);

  return function parseWsFrames(data) {
    const frames = [];
    let pos = 0;
    buffered = buffered.length ? Buffer.concat([buffered, data]) : Buffer.from(data);
    const buf = buffered;

    while (pos < buf.length) {
      if (pos + 2 > buf.length) break;
      const firstByte = buf[pos];
      const secondByte = buf[pos + 1];
      const fin = (firstByte & 0x80) !== 0;
      const opcode = firstByte & 0x0f;
      const masked = (secondByte & 0x80) !== 0;
      let payloadLen = secondByte & 0x7f;
      let headerLen = 2;

      if (payloadLen === 126) {
        if (pos + 4 > buf.length) break;
        payloadLen = buf.readUInt16BE(pos + 2);
        headerLen = 4;
      } else if (payloadLen === 127) {
        if (pos + 10 > buf.length) break;
        payloadLen = Number(buf.readBigUInt64BE(pos + 2));
        headerLen = 10;
      }

      const maskLen = masked ? 4 : 0;
      const totalLen = headerLen + maskLen + payloadLen;
      if (pos + totalLen > buf.length) break;

      const maskStart = pos + headerLen;
      const payloadStart = maskStart + maskLen;
      let payload = buf.slice(payloadStart, payloadStart + payloadLen);

      if (masked) {
        const mask = buf.slice(maskStart, maskStart + 4);
        for (let i = 0; i < payload.length; i++) {
          payload[i] ^= mask[i % 4];
        }
      }

      frames.push({ fin, opcode, payload });
      pos += totalLen;
    }

    buffered = buf.slice(pos);
    return frames;
  };
}

function decodeV1Event(buf) {
  if (buf.length < 8) return null;
  const flags = buf[1] & 0x0f;
  if (!(flags & 0x04)) return null;
  return (buf[4] << 24) | (buf[5] << 16) | (buf[6] << 8) | buf[7];
}

function handleVolcConnection(browserWs, { appId, accessKey }) {
  if (!appId || !accessKey) {
    console.log("Volc WS: missing VOLC_APP_ID or VOLC_ACCESS_KEY env vars");
    browserWs.close(1011, "Server config missing");
    return;
  }

  console.log(`Volc WS: connecting App-ID=${appId} Token=${accessKey.slice(0, 8)}...`);

  const pending = [];
  const parseWsFrames = createWsFrameParser();
  let upstreamSocket = null;
  let upstreamReady = false;
  let sessionStarted = false;
  let msgCount = 0;

  function flushNextToUpstream() {
    if (!upstreamSocket || upstreamSocket.destroyed) return;
    if (pending.length === 0) return;
    const buf = pending.shift();
    const ev = decodeV1Event(buf);
    if (ev !== null) {
      if (ev === 100 && !sessionStarted) {
        // Flush StartSession even before SessionStarted.
      }
    }
    msgCount++;
    const wsFrame = encodeWsFrame(buf);
    const hex = buf.length <= 40 ? buf.toString("hex") : `${buf.slice(0, 40).toString("hex")}...`;
    console.log(`Volc WS: sent #${msgCount} v1-len=${buf.length} ws-len=${wsFrame.length} hex=${hex}`);
    upstreamSocket.write(wsFrame);
  }

  browserWs.on("message", (data, isBinary) => {
    const buf = Buffer.from(data);
    if (upstreamReady && upstreamSocket && !upstreamSocket.destroyed && sessionStarted) {
      msgCount++;
      if (msgCount <= 5) {
        const hex = buf.length <= 40 ? buf.toString("hex") : `${buf.slice(0, 40).toString("hex")}...`;
        console.log(`Volc WS: msg #${msgCount} len=${buf.length} hex=${hex}`);
      }
      upstreamSocket.write(encodeWsFrame(buf, isBinary ? 2 : 1));
    } else {
      pending.push(buf);
    }
  });

  browserWs.on("close", () => {
    upstreamReady = false;
    if (upstreamSocket && !upstreamSocket.destroyed) upstreamSocket.destroy();
  });

  browserWs.on("error", () => {
    upstreamReady = false;
    if (upstreamSocket && !upstreamSocket.destroyed) upstreamSocket.destroy();
  });

  const wsKey = crypto.randomBytes(16).toString("base64");

  const req = https.request({
    hostname: "openspeech.bytedance.com",
    path: "/api/v3/realtime/dialogue",
    method: "GET",
    headers: {
      "Connection": "Upgrade",
      "Upgrade": "websocket",
      "Sec-WebSocket-Version": "13",
      "Sec-WebSocket-Key": wsKey,
      "X-Api-App-ID": appId,
      "X-Api-Access-Key": accessKey,
      "X-Api-Resource-Id": volcResourceId,
      "X-Api-App-Key": volcAppKey
    }
  });

  req.on("upgrade", (res, socket) => {
    console.log(`Volc WS: upstream connected (status ${res.statusCode})`);
    socket.setNoDelay(true);
    upstreamSocket = socket;
    upstreamReady = true;

    flushNextToUpstream();

    socket.on("data", (data) => {
      const frames = parseWsFrames(data);
      for (const frame of frames) {
        if (frame.opcode === 8) {
          const code = frame.payload.length >= 2 ? frame.payload.readUInt16BE(0) : 0;
          const reason = frame.payload.length > 2 ? frame.payload.slice(2).toString() : "";
          console.log(`Volc WS: server closed (code=${code} reason=${reason.slice(0, 100)})`);
          browserWs.close();
          return;
        }
        if (frame.opcode === 9) {
          socket.write(encodeWsFrame(Buffer.alloc(0), 10));
          return;
        }

        const ev = decodeV1Event(frame.payload);
        if (ev === 50) {
          console.log("Volc WS: received ConnectionStarted, flushing next...");
          flushNextToUpstream();
        } else if (ev === 150) {
          console.log("Volc WS: received SessionStarted, flushing audio...");
          sessionStarted = true;
          while (pending.length > 0) flushNextToUpstream();
        } else if (ev !== null && frame.opcode === 1) {
          const text = frame.payload.toString().slice(0, 300);
          console.log(`Volc WS: received text (ev=${ev}): ${text}`);
        }

        if (frame.opcode === 2 || frame.opcode === 1) {
          if (browserWs.readyState === WebSocket.OPEN) {
            browserWs.send(frame.payload, { binary: frame.opcode === 2 });
          }
        }
      }
    });

    socket.on("close", () => {
      console.log("Volc WS: upstream socket closed");
      upstreamReady = false;
      browserWs.close();
    });

    socket.on("error", (err) => {
      console.log("Volc WS: upstream socket error:", err.message);
      upstreamReady = false;
      browserWs.close();
    });
  });

  req.on("error", (err) => {
    console.log("Volc WS: upstream error:", err.message);
    browserWs.close();
  });

  req.on("response", (res) => {
    let body = "";
    res.on("data", (chunk) => {
      body += chunk;
    });
    res.on("end", () => {
      console.log(`Volc WS: upstream rejected (${res.statusCode}):`, body.slice(0, 200));
      browserWs.close();
    });
  });

  req.end();
}

export function attachVolcWsProxy(server, { path, appId, accessKey }) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    if (request.url === path) {
      wss.handleUpgrade(request, socket, head, (browserWs) => {
        wss.emit("connection", browserWs, request);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on("connection", (browserWs) => {
    handleVolcConnection(browserWs, { appId, accessKey });
  });

  return wss;
}
