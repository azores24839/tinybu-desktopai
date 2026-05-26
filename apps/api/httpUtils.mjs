export function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  });
  res.end(JSON.stringify(body));
}

export function log(level, ...args) {
  const ts = new Date().toISOString().slice(11, 23);
  const prefix = `[${ts} ${level}]`;
  if (level === "ERROR") {
    console.error(prefix, ...args);
  } else if (level === "WARN") {
    console.warn(prefix, ...args);
  } else {
    console.log(prefix, ...args);
  }
}

export function logReq(label, body) {
  if (typeof body !== "string") {
    log("REQ", label, JSON.stringify(body).slice(0, 400));
  } else {
    log("REQ", label, body.slice(0, 400));
  }
}

export function logRes(label, status, body) {
  const preview = typeof body === "string" ? body.slice(0, 200) : JSON.stringify(body).slice(0, 200);
  log("RES", label, `status=${status}`, preview);
}

export function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 8_000_000) {
        reject(new Error("Request too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

export async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}
