import { X } from "lucide-react";
import type { CaptureItem } from "../../types";
import { captureText } from "./captureUtils";

export type MaterialKind = "text" | "image" | "video";

function materialKind(capture: CaptureItem): MaterialKind {
  if (capture.sourceKind === "screenshot") return "image";
  if (capture.sourceKind === "youtube" || capture.sourceKind === "video") return "video";
  return "text";
}

function kindLabel(kind: MaterialKind, isChinese: boolean) {
  if (kind === "image") return isChinese ? "图文识别" : "Image OCR";
  if (kind === "video") return isChinese ? "视频字幕" : "Video captions";
  return isChinese ? "文字复制" : "Copied text";
}

export function MaterialLibraryPanel({
  captures,
  isChinese,
  activeKind,
  setActiveKind,
  close,
  openCapture
}: {
  captures: CaptureItem[];
  isChinese: boolean;
  activeKind: MaterialKind;
  setActiveKind: (kind: MaterialKind) => void;
  close: () => void;
  openCapture: (capture: CaptureItem) => void;
}) {
  const availableCaptures = captures.filter((capture) => capture.status !== "archived");
  const visibleCaptures = availableCaptures.filter((capture) => materialKind(capture) === activeKind);
  const kinds: MaterialKind[] = ["text", "image", "video"];

  return (
    <div className="material-library-panel" role="dialog" aria-label={isChinese ? "素材库" : "Material library"}>
      <header className="material-library-header">
        <h2>{isChinese ? "素材库" : "Material Library"}</h2>
        <button onClick={close} aria-label={isChinese ? "关闭" : "Close"}>
          <X size={20} />
        </button>
      </header>

      <div className="material-library-tabs">
        {kinds.map((kind) => (
          <button key={kind} className={kind === activeKind ? "active" : ""} onClick={() => setActiveKind(kind)}>
            {kindLabel(kind, isChinese)}
          </button>
        ))}
      </div>

      <div className="material-library-list">
        {visibleCaptures.map((capture) => {
          const text = captureText(capture).replace(/\s+/g, " ").trim();
          return (
            <button key={capture.id} className="material-library-item" onClick={() => openCapture(capture)}>
              <span>{kindLabel(materialKind(capture), isChinese)}</span>
              <strong>{capture.title || (isChinese ? "未命名素材" : "Untitled source")}</strong>
              <p>{text || capture.summary || (isChinese ? "暂无可预览文本" : "No preview text yet")}</p>
            </button>
          );
        })}
        {!visibleCaptures.length && (
          <div className="material-library-empty">
            {isChinese ? "这里还没有对应类型的素材。" : "No sources in this category yet."}
          </div>
        )}
      </div>
    </div>
  );
}
