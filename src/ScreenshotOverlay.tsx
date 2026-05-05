import { useEffect, useMemo, useState } from "react";
import type { PointerEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invokeTauri } from "./lib/tauriBridge";

type Point = {
  x: number;
  y: number;
};

type ScreenshotResult = {
  imageDataUrl: string;
  width: number;
  height: number;
};

export default function ScreenshotOverlay() {
  const [start, setStart] = useState<Point | null>(null);
  const [current, setCurrent] = useState<Point | null>(null);
  const [message, setMessage] = useState("拖拽选择要让 TinyBu 看的区域");

  const rect = useMemo(() => {
    if (!start || !current) return null;
    const left = Math.min(start.x, current.x);
    const top = Math.min(start.y, current.y);
    const width = Math.abs(start.x - current.x);
    const height = Math.abs(start.y - current.y);
    return { left, top, width, height };
  }, [current, start]);

  useEffect(() => {
    document.documentElement.classList.add("tinybu-screenshot-html");
    document.body.classList.add("tinybu-screenshot-body");

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        void getCurrentWindow().close();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.documentElement.classList.remove("tinybu-screenshot-html");
      document.body.classList.remove("tinybu-screenshot-body");
    };
  }, []);

  function handlePointerDown(event: PointerEvent<HTMLElement>) {
    const point = { x: event.clientX, y: event.clientY };
    setStart(point);
    setCurrent(point);
    setMessage("松开鼠标开始识别");
  }

  function handlePointerMove(event: PointerEvent<HTMLElement>) {
    if (!start) return;
    setCurrent({ x: event.clientX, y: event.clientY });
  }

  async function handlePointerUp() {
    if (!rect || rect.width < 12 || rect.height < 12) {
      setStart(null);
      setCurrent(null);
      setMessage("区域太小了，重新拖拽选择一块文字区域");
      return;
    }

    setMessage("正在截取区域...");

    try {
      const window = getCurrentWindow();
      const [position, scaleFactor] = await Promise.all([window.outerPosition(), window.scaleFactor()]);
      const area = {
        x: Math.round(position.x + rect.left * scaleFactor),
        y: Math.round(position.y + rect.top * scaleFactor),
        width: Math.round(rect.width * scaleFactor),
        height: Math.round(rect.height * scaleFactor)
      };
      await window.hide();
      await new Promise((resolve) => globalThis.setTimeout(resolve, 120));
      const screenshot = await invokeTauri<ScreenshotResult>("capture_screen_area", { area });
      if (!screenshot?.imageDataUrl) throw new Error("截图失败");

      setMessage("TinyBu 正在读取截图...");
      await invokeTauri("submit_screenshot_capture", {
        payload: {
          ...screenshot,
          capturedAt: new Date().toISOString()
        }
      });
      await window.close();
    } catch (error) {
      console.warn("Screenshot capture failed", error);
      await getCurrentWindow().show().catch(() => {});
      setMessage("截图失败，请重新试一次");
      setStart(null);
      setCurrent(null);
    }
  }

  return (
    <main
      className="screenshot-overlay"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div className="screenshot-hint">{message}</div>
      {rect && (
        <>
          <div
            className="screenshot-selection"
            style={{
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height
            }}
          />
          <div className="screenshot-size" style={{ left: rect.left, top: Math.max(8, rect.top - 34) }}>
            {Math.round(rect.width)} x {Math.round(rect.height)}
          </div>
        </>
      )}
    </main>
  );
}
