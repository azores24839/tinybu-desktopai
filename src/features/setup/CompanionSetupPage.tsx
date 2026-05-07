import { useState } from "react";
import { NomiOrb } from "../../components/NomiOrb";
import type { CompanionProfile } from "../../types";

export function CompanionSetupPage({
  initialCompanion,
  submit,
  skip
}: {
  initialCompanion: CompanionProfile;
  submit: (companion: CompanionProfile) => void;
  skip: () => void;
}) {
  const [companion, setCompanion] = useState(initialCompanion);
  return (
    <section className="setup-card">
      <div className="setup-header">
        <NomiOrb state="speaking" />
        <div>
          <p className="eyebrow">Companion</p>
          <h1>选择 TinyBu 的陪伴方式。</h1>
        </div>
      </div>
      <div className="form-grid">
        <label>
          Name
          <input value={companion.name} onChange={(event) => setCompanion({ ...companion, name: event.target.value })} />
        </label>
        <label>
          Style
          <select
            value={companion.style}
            onChange={(event) => setCompanion({ ...companion, style: event.target.value as CompanionProfile["style"] })}
          >
            <option>Warm Friend</option>
            <option>Gentle Coach</option>
            <option>Native Buddy</option>
            <option>Calm Listener</option>
          </select>
        </label>
        <label>
          Feedback timing
          <select
            value={companion.feedbackTiming}
            onChange={(event) => setCompanion({ ...companion, feedbackTiming: event.target.value as CompanionProfile["feedbackTiming"] })}
          >
            <option value="after-talk">After I talk</option>
            <option value="when-stuck">When I get stuck</option>
            <option value="light-live">Light live support</option>
            <option value="direct-natural">Direct natural rewrite</option>
          </select>
        </label>
        <label>
          Speaking pace
          <select
            value={companion.speakingPace}
            onChange={(event) => setCompanion({ ...companion, speakingPace: event.target.value as CompanionProfile["speakingPace"] })}
          >
            <option>slow</option>
            <option>normal</option>
            <option>fast</option>
          </select>
        </label>
      </div>
      <div className="bottom-actions">
        <button className="secondary" onClick={skip}>
          Skip
        </button>
        <button className="primary" onClick={() => submit(companion)}>
          Enter TinyBu
        </button>
      </div>
    </section>
  );
}
