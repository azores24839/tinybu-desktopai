import { ChevronRight } from "lucide-react";
import { TinyBuOrb } from "../../components/TinyBuOrb";

export function WelcomePage({ start, demo }: { start: () => void; demo: () => void }) {
  return (
    <section className="welcome-layout">
      <div className="hero-copy">
        <div className="brand-mark">
          <TinyBuOrb state="speaking" />
          <span>TinyBu</span>
        </div>
        <h1>Turn real captures into language practice.</h1>
        <p>把网页、视频、文章和截图里的零散外语内容，整理成可以理解、练习和沉淀的学习工作台。</p>
        <div className="hero-actions">
          <button className="primary" onClick={start}>
            Start with TinyBu <ChevronRight size={18} />
          </button>
          <button className="secondary" onClick={demo}>
            Try Demo
          </button>
        </div>
      </div>
      <div className="preview-window">
        <div className="preview-toolbar">
          <span />
          <span />
          <span />
        </div>
        <div className="preview-content">
          <div className="preview-sidebar" />
          <div className="preview-card wide" />
          <div className="preview-card" />
          <div className="preview-card" />
        </div>
      </div>
    </section>
  );
}
