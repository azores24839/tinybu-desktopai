(() => {
  function extractPayload(kind) {
    if (kind === "youtube") return extractYouTube();
    if (kind === "article") return extractArticle();
    return extractSelection();
  }

  function basePayload(kind, text) {
    return {
      kind,
      title: document.title.replace(/\s+-\s+YouTube$/, "").trim() || "Captured Web Content",
      url: location.href,
      text: cleanText(text),
      capturedAt: new Date().toISOString()
    };
  }

  function extractSelection() {
    const selection = window.getSelection()?.toString() || "";

    if (selection.trim()) {
      return basePayload("selection", selection);
    }

    const visibleCaption = getVisibleCaptions();
    if (visibleCaption) {
      return basePayload(location.hostname.includes("youtube") ? "youtube" : "video", visibleCaption);
    }

    const activeParagraph = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
    const nearestText = activeParagraph?.closest("p, li, blockquote, h1, h2, h3")?.textContent || "";
    return basePayload("selection", nearestText);
  }

  function extractArticle() {
    const article = document.querySelector("article");
    const main = document.querySelector("main");
    const root = article || scoreReadableContainers()[0] || main || document.body;
    const chunks = Array.from(root.querySelectorAll("h1, h2, h3, p, li, blockquote"))
      .filter((node) => isLikelyMainContentNode(node, root))
      .map((node) => cleanText(node.textContent || ""))
      .filter(isUsefulArticleLine);

    if (chunks.length) {
      return basePayload("article", chunks.join("\n\n"));
    }

    return basePayload("article", cleanText(root.innerText || ""));
  }

  function extractYouTube() {
    const transcriptLines = getYouTubeTranscriptLines();

    const dedupedTranscript = dedupeLines(transcriptLines);
    if (dedupedTranscript.length >= 3) {
      return basePayload("youtube", dedupedTranscript.join("\n"));
    }

    const visibleCaption = getVisibleCaptions();
    if (visibleCaption) {
      return basePayload("youtube", visibleCaption);
    }

    const selection = window.getSelection()?.toString() || "";
    if (selection.trim()) {
      return basePayload("youtube", selection);
    }

    return {
      ...basePayload("youtube", ""),
      text: ""
    };
  }

  function scoreReadableContainers() {
    const containers = Array.from(document.querySelectorAll("article, main, section, div"))
      .filter((node) => !isRejectedContainer(node))
      .map((node) => {
        const paragraphs = Array.from(node.querySelectorAll("p, li, blockquote")).filter((child) =>
          isLikelyMainContentNode(child, node)
        );
        const textLength = paragraphs.reduce((sum, paragraph) => sum + cleanText(paragraph.textContent || "").length, 0);
        const linkTextLength = Array.from(node.querySelectorAll("a")).reduce(
          (sum, link) => sum + cleanText(link.textContent || "").length,
          0
        );
        const linkPenalty = linkTextLength / Math.max(textLength, 1);
        return { node, score: paragraphs.length * 160 + textLength - linkPenalty * 420 };
      })
      .filter((item) => item.score > 500)
      .sort((a, b) => b.score - a.score);

    return containers.map((item) => item.node);
  }

  function getVisibleCaptions() {
    return dedupeLines(
      Array.from(document.querySelectorAll(".ytp-caption-window-container .ytp-caption-segment, .ytp-caption-segment"))
        .map((node) => cleanText(node.textContent || ""))
        .map(normalizeSubtitleText)
        .filter(isUsefulSubtitleLine)
    ).join("\n");
  }

  function getYouTubeTranscriptLines() {
    const fromTranscriptPanel = getTranscriptLinesFromVisiblePanel();
    if (fromTranscriptPanel.length >= 3) return fromTranscriptPanel;

    const segmentNodes = Array.from(document.querySelectorAll("ytd-transcript-segment-renderer"));
    const fromSegments = segmentNodes
      .map((node) => {
        const textNode =
          node.querySelector("#content yt-formatted-string") ||
          node.querySelector("yt-formatted-string.segment-text") ||
          node.querySelector(".segment-text") ||
          node.querySelector("yt-formatted-string:not([class*='time'])");
        return normalizeSubtitleText(cleanText(textNode?.textContent || ""));
      })
      .filter(isUsefulSubtitleLine);

    if (fromSegments.length >= 3) return fromSegments;

    const transcriptPanel = document.querySelector("ytd-transcript-renderer, ytd-engagement-panel-section-list-renderer[target-id='engagement-panel-searchable-transcript']");
    if (!transcriptPanel) return [];

    return Array.from(transcriptPanel.querySelectorAll("yt-formatted-string, .segment-text"))
      .map((node) => cleanText(node.textContent || ""))
      .map(stripLeadingTimestamp)
      .map(normalizeSubtitleText)
      .filter(isUsefulSubtitleLine);
  }

  function deliverToPage(payload) {
    let count = 0;
    const message = {
      type: "TINYBU_EXTENSION_CAPTURE",
      payload
    };

    const interval = setInterval(() => {
      window.postMessage(message, window.location.origin);
      count += 1;
      if (count >= 20) clearInterval(interval);
    }, 150);

    window.postMessage(message, window.location.origin);
  }

  function getTranscriptLinesFromVisiblePanel() {
    const panels = Array.from(
      document.querySelectorAll(
        "ytd-engagement-panel-section-list-renderer[target-id='engagement-panel-searchable-transcript'], ytd-engagement-panel-section-list-renderer, ytd-transcript-renderer, tp-yt-paper-dialog"
      )
    ).filter((node) => {
      const text = cleanText(node.textContent || "");
      return /(转写文稿|文字记录|transcript)/i.test(text);
    });

    for (const panel of panels) {
      const rows = Array.from(
        panel.querySelectorAll(
          "ytd-transcript-segment-renderer, [class*='segment'], [class*='Segment'], div, button"
        )
      )
        .map((node) => cleanText(node.textContent || ""))
        .map(normalizeTranscriptRow)
        .filter(isUsefulSubtitleLine);

      const deduped = dedupeLines(rows);
      if (deduped.length >= 3) return deduped;

      const fromText = extractTimestampedLinesFromText(cleanText(panel.textContent || ""));
      if (fromText.length >= 3) return fromText;
    }

    return [];
  }

  function extractTimestampedLinesFromText(text) {
    const matches = Array.from(
      text.matchAll(/(?:^|\s)(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+?)(?=\s+\d{1,2}:\d{2}(?::\d{2})?\s+|$)/g)
    );

    return dedupeLines(
      matches
        .map((match) => normalizeSubtitleText(cleanText(match[2] || "")))
        .filter(isUsefulSubtitleLine)
    );
  }

  function normalizeTranscriptRow(text) {
    const cleaned = cleanText(text);
    const timestampMatches = cleaned.match(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g) || [];

    if (!timestampMatches.length) return cleaned;

    const lastTimestamp = timestampMatches[timestampMatches.length - 1];
    const afterTimestamp = cleaned.slice(cleaned.lastIndexOf(lastTimestamp) + lastTimestamp.length);
    return normalizeSubtitleText(afterTimestamp.replace(/^[-–—•\s]+/, ""));
  }

  function stripLeadingTimestamp(text) {
    return normalizeSubtitleText(text.replace(/^\d{1,2}:\d{2}(?::\d{2})?\s*/, ""));
  }

  function normalizeSubtitleText(text) {
    return cleanText(
      text
        .replace(/^\s*\d{1,2}:\d{2}(?::\d{2})?\s*\d*\s*(?:分钟)?\d*\s*秒钟\s*/g, "")
        .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b\s*\d*\s*(?:分钟)?\d*\s*秒钟\s*/g, " ")
        .replace(/^\s*\d+\s*(?:分钟)?\d*\s*秒钟\s*/g, "")
        .replace(/\s+\d+\s*(?:分钟)?\d*\s*秒钟\s*/g, " ")
        .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, " ")
        .replace(/^\s*\d+\s*(seconds?|secs?)\s*/gi, "")
    );
  }

  function isRejectedContainer(node) {
    const text = [
      node.id,
      node.className,
      node.getAttribute("role"),
      node.getAttribute("aria-label")
    ]
      .join(" ")
      .toLowerCase();

    return /nav|menu|sidebar|aside|footer|header|comment|related|recommend|popular|trending|promo|advert|share|social|breadcrumb|pagination|newsletter|subscribe/.test(
      text
    );
  }

  function isLikelyMainContentNode(node, root) {
    if (!root.contains(node)) return false;
    if (node.closest("nav, aside, footer, header, form, button, [role='navigation'], [role='complementary']")) return false;
    if (node.closest("[class*='related'], [class*='recommend'], [class*='popular'], [class*='sidebar'], [class*='footer'], [class*='comment'], [class*='share'], [class*='advert'], [id*='related'], [id*='recommend'], [id*='sidebar']")) return false;

    const text = cleanText(node.textContent || "");
    if (!isUsefulArticleLine(text)) return false;

    const linkText = Array.from(node.querySelectorAll("a")).reduce(
      (sum, link) => sum + cleanText(link.textContent || "").length,
      0
    );

    return linkText / Math.max(text.length, 1) < 0.65;
  }

  function isUsefulArticleLine(text) {
    if (text.length < 40) return false;
    if (text.length > 1800) return false;
    if (/^(related|recommended|more from|read more|advertisement|subscribe|share|sign up|follow us)$/i.test(text)) {
      return false;
    }
    return /[.!?。！？]/.test(text) || text.split(/\s+/).length >= 8;
  }

  function isUsefulSubtitleLine(text) {
    if (!text) return false;
    if (text.length < 2 || text.length > 260) return false;
    if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(text)) return false;
    if (/(转写文稿|文字记录|搜索转写内容|transcript|search transcript)/i.test(text)) return false;
    if (/^\d+(\.\d+)?[万千百亿]?(次观看| views?)\b/i.test(text)) return false;
    if (/^\d+\s*(years?|months?|weeks?|days?|hours?) ago$/i.test(text)) return false;
    if (/^[\d,.\s]+$/.test(text)) return false;
    if (/[|•]/.test(text) && !/[.!?。！？]/.test(text)) return false;
    if (/(subscribe|liked|share|download|save|clip|thanks|join|replay|autoplay|views|watch later)/i.test(text)) {
      return false;
    }
    if (/[\u4e00-\u9fff].*(次观看|年前|个月前|直播|已订阅)/.test(text)) return false;
    return /[a-zA-Z\u4e00-\u9fff]/.test(text);
  }

  function dedupeLines(lines) {
    const seen = new Set();
    return lines.filter((line) => {
      const key = line.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function cleanText(text) {
    return text
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s+/g, "\n")
      .replace(/\s+\n/g, "\n")
      .trim();
  }

  globalThis.TinyBuContentExtractors = {
    cleanText,
    deliverToPage,
    extractPayload
  };
})();
