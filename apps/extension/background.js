const NOMI_URL = "http://127.0.0.1:1420/";
const DESKTOP_BRIDGE_URL = "http://127.0.0.1:1421/v1/captures";
const PENDING_CAPTURES_KEY = "nomiPendingCaptures";
const CAPTURE_COUNT_KEY = "nomiCaptureCount";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "nomi-selection",
    title: "Send selection to TinyBu",
    contexts: ["selection"]
  });

  chrome.contextMenus.create({
    id: "nomi-page",
    title: "Save page to TinyBu",
    contexts: ["page"]
  });

  chrome.contextMenus.create({
    id: "nomi-youtube",
    title: "Capture YouTube transcript to TinyBu",
    contexts: ["page"],
    documentUrlPatterns: ["https://www.youtube.com/*", "https://youtube.com/*"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;

  const kindByMenu = {
    "nomi-selection": "selection",
    "nomi-page": "article",
    "nomi-youtube": "youtube"
  };

  try {
    await captureFromTab(tab.id, kindByMenu[info.menuItemId] ?? "selection", tab.url);
  } catch (error) {
    console.error("TinyBu capture failed", error);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "NOMI_CAPTURE_ACTIVE_TAB") {
    getActiveTab()
      .then((tab) => captureFromTab(tab.id, message.kind, tab.url))
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "NOMI_OPEN_CAPTURE") {
    saveCapture(message.payload)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  return false;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !isNomiUrl(tab.url)) return;
  flushPendingCapturesToTab(tabId).catch((error) => {
    console.error("TinyBu pending capture delivery failed", error);
  });
});

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab found");
  return tab;
}

async function captureFromTab(tabId, kind, tabUrl = "") {
  if (!canInjectIntoUrl(tabUrl)) {
    throw new Error("TinyBu 不能读取这个页面。请在普通网页、文章页或 YouTube 视频页使用。");
  }

  const response = await sendExtractMessage(tabId, kind);

  if (!response?.ok || !response.payload?.text) {
    throw new Error(response?.error || "TinyBu could not extract useful text from this page.");
  }

  await saveCapture(response.payload);
  return { ok: true, payload: response.payload };
}

async function sendExtractMessage(tabId, kind) {
  try {
    return await chrome.tabs.sendMessage(tabId, {
      type: "NOMI_EXTRACT",
      kind
    });
  } catch (error) {
    if (!isMissingReceiverError(error)) throw error;
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"]
  });

  await wait(80);

  return chrome.tabs.sendMessage(tabId, {
    type: "NOMI_EXTRACT",
    kind
  });
}

async function saveCapture(payload) {
  const normalized = normalizePayload(payload);
  const bridgeResult = await saveCaptureThroughDesktopBridge(normalized);

  if (bridgeResult?.ok && Number.isFinite(bridgeResult.count)) {
    await setCaptureCount(bridgeResult.count);
    return { count: bridgeResult.count };
  }

  const delivered = await deliverCaptureToOpenNomiTab(normalized);
  const count = await incrementCaptureCount();

  if (!delivered) {
    await queuePendingCapture(normalized);
  }

  return { count };
}

async function saveCaptureThroughDesktopBridge(payload) {
  await flushPendingCapturesToDesktopBridge();
  return postCaptureToDesktopBridge(payload);
}

async function flushPendingCapturesToDesktopBridge() {
  const pending = await readPendingCaptures();
  if (!pending.length) return;

  const undelivered = [];

  for (let index = 0; index < pending.length; index += 1) {
    const payload = pending[index];
    const result = await postCaptureToDesktopBridge(payload);
    if (!result?.ok) {
      undelivered.push(...pending.slice(index));
      break;
    }
  }

  await chrome.storage.local.set({
    [PENDING_CAPTURES_KEY]: undelivered
  });
}

async function postCaptureToDesktopBridge(payload) {
  try {
    const response = await fetch(DESKTOP_BRIDGE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

async function setCaptureCount(count) {
  await chrome.storage.local.set({ [CAPTURE_COUNT_KEY]: count });
}

async function incrementCaptureCount() {
  const result = await chrome.storage.local.get(CAPTURE_COUNT_KEY);
  const count = Number.isFinite(result[CAPTURE_COUNT_KEY]) ? result[CAPTURE_COUNT_KEY] + 1 : 1;
  await chrome.storage.local.set({ [CAPTURE_COUNT_KEY]: count });
  return count;
}

async function deliverCaptureToOpenNomiTab(payload) {
  const tabs = await chrome.tabs.query({ url: `${NOMI_URL}*` });
  const tab = tabs.find((item) => item.id && item.status === "complete");

  if (!tab?.id) return false;

  try {
    await deliverCaptureToNomiTab(tab.id, payload);
    return true;
  } catch (error) {
    console.warn("TinyBu capture delivery deferred", error);
    return false;
  }
}

async function queuePendingCapture(payload) {
  const pending = await readPendingCaptures();
  pending.push(payload);
  await chrome.storage.local.set({
    [PENDING_CAPTURES_KEY]: pending.slice(-100)
  });
}

async function readPendingCaptures() {
  const result = await chrome.storage.local.get(PENDING_CAPTURES_KEY);
  return Array.isArray(result[PENDING_CAPTURES_KEY]) ? result[PENDING_CAPTURES_KEY] : [];
}

async function flushPendingCapturesToTab(tabId) {
  const pending = await readPendingCaptures();
  if (!pending.length) return;

  const undelivered = [];

  for (const payload of pending) {
    try {
      await deliverCaptureToNomiTab(tabId, payload);
    } catch (error) {
      undelivered.push(payload);
      console.warn("TinyBu pending capture delivery deferred", error);
    }
  }

  await chrome.storage.local.set({
    [PENDING_CAPTURES_KEY]: undelivered
  });
}

async function deliverCaptureToNomiTab(tabId, payload) {
  await ensureContentScript(tabId);
  await chrome.tabs.sendMessage(tabId, {
    type: "NOMI_DELIVER_TO_PAGE",
    payload
  });
}

async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "NOMI_PING" });
    return;
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"]
    });
    await wait(120);
  }
}

function normalizePayload(payload) {
  const maxChars = payload.kind === "article" ? 14000 : 9000;
  const text = String(payload.text || "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxChars);

  return {
    kind: payload.kind || "selection",
    title: String(payload.title || "Captured Web Content").slice(0, 160),
    url: String(payload.url || ""),
    text,
    capturedAt: new Date().toISOString()
  };
}

function canInjectIntoUrl(url) {
  return /^(https?:|file:)/.test(url || "");
}

function isNomiUrl(url) {
  return typeof url === "string" && url.startsWith(NOMI_URL);
}

function isMissingReceiverError(error) {
  return /Receiving end does not exist|Could not establish connection/i.test(error?.message || "");
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
