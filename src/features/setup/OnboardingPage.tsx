import { useState } from "react";
import { NomiOrb } from "../../components/NomiOrb";
import { goalOptions, languageOptions, targetLanguageOptions } from "../../lib/appOptions";
import type { UserProfile } from "../../types";

export function OnboardingPage({
  initialProfile,
  submit,
  skip
}: {
  initialProfile: UserProfile;
  submit: (profile: UserProfile) => void;
  skip: () => void;
}) {
  const [profile, setProfile] = useState<UserProfile>(initialProfile);
  const toggleGoal = (goal: string) => {
    setProfile((current) => ({
      ...current,
      goals: current.goals.includes(goal) ? current.goals.filter((item) => item !== goal) : [...current.goals, goal]
    }));
  };

  return (
    <section className="setup-card">
      <div className="setup-header">
        <NomiOrb state="encouraging" />
        <div>
          <p className="eyebrow">TinyBu setup</p>
          <h1>先告诉 TinyBu 你想怎么学。</h1>
        </div>
      </div>
      <div className="form-grid">
        <label>
          Native language
          <select value={profile.nativeLanguage} onChange={(event) => setProfile({ ...profile, nativeLanguage: event.target.value })}>
            {languageOptions.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          Target language
          <select value={profile.targetLanguage} onChange={(event) => setProfile({ ...profile, targetLanguage: event.target.value })}>
            {targetLanguageOptions.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          Level
          <select value={profile.level} onChange={(event) => setProfile({ ...profile, level: event.target.value as UserProfile["level"] })}>
            <option>A1</option>
            <option>A2</option>
            <option>B1</option>
            <option>B2</option>
          </select>
        </label>
        <label>
          Support style
          <select
            value={profile.supportPreference}
            onChange={(event) => setProfile({ ...profile, supportPreference: event.target.value as UserProfile["supportPreference"] })}
          >
            <option>Gentle</option>
            <option>Balanced</option>
            <option>Direct</option>
          </select>
        </label>
      </div>
      <div className="chip-field">
        {goalOptions.map((goal) => (
          <button key={goal} className={profile.goals.includes(goal) ? "chip selected" : "chip"} onClick={() => toggleGoal(goal)}>
            {goal}
          </button>
        ))}
      </div>
      <label>
        Speaking pressure: {profile.anxiety}
        <input
          type="range"
          min="1"
          max="5"
          value={profile.anxiety}
          onChange={(event) => setProfile({ ...profile, anxiety: Number(event.target.value) })}
        />
      </label>
      <div className="bottom-actions">
        <button className="secondary" onClick={skip}>
          Skip
        </button>
        <button className="primary" onClick={() => submit(profile)}>
          Continue
        </button>
      </div>
    </section>
  );
}
