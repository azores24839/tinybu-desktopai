import { useEffect, useState } from "react";
import { AppHeader } from "../../components/AppHeader";
import { interfaceLanguageOptions, languageOptions, targetLanguageOptions } from "../../lib/appOptions";
import { uiCopy } from "../../lib/uiCopy";
import type { AppStateRecord, UserProfile } from "../../types";

type SettingsPageProps = {
  appState: AppStateRecord;
  apiKeyDraft: string;
  apiKeyStatus: string;
  setApiKeyDraft: (value: string) => void;
  saveSettings: (state: AppStateRecord, key?: string) => void;
  checkUserKey: () => void;
  clearUserKey: () => void;
  clearMemory: () => void;
  clearAllData: () => void;
  resetOnboarding: () => void;
};

export function SettingsPage({
  appState,
  apiKeyDraft,
  apiKeyStatus,
  setApiKeyDraft,
  saveSettings,
  checkUserKey,
  clearUserKey,
  clearMemory,
  clearAllData,
  resetOnboarding
}: SettingsPageProps) {
  const [draft, setDraft] = useState(appState);

  useEffect(() => setDraft(appState), [appState]);
  const copy = uiCopy[draft.profile.interfaceLanguage].settings;

  return (
    <section className="page">
      <AppHeader title={copy.title} description={copy.description} />
      <div className="settings-grid">
        <section className="panel">
          <h2>{copy.language}</h2>
          <label>
            {copy.interfaceLanguage}
            <select
              value={draft.profile.interfaceLanguage}
              onChange={(event) =>
                setDraft({ ...draft, profile: { ...draft.profile, interfaceLanguage: event.target.value as UserProfile["interfaceLanguage"] } })
              }
            >
              {interfaceLanguageOptions.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            {copy.sourceLanguage}
            <select value={draft.profile.nativeLanguage} onChange={(event) => setDraft({ ...draft, profile: { ...draft.profile, nativeLanguage: event.target.value } })}>
              {languageOptions.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            {copy.targetLanguage}
            <select value={draft.profile.targetLanguage} onChange={(event) => setDraft({ ...draft, profile: { ...draft.profile, targetLanguage: event.target.value } })}>
              {targetLanguageOptions.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            {copy.supportStrength}
            <select
              value={draft.settings.supportStrength}
              onChange={(event) =>
                setDraft({ ...draft, settings: { ...draft.settings, supportStrength: event.target.value as AppStateRecord["settings"]["supportStrength"] } })
              }
            >
              <option>Gentle</option>
              <option>Balanced</option>
              <option>Direct</option>
            </select>
          </label>
        </section>
        <section className="panel">
          <h2>API settings</h2>
          <label>
            Provider mode
            <select
              value={draft.settings.aiProviderMode}
              onChange={(event) =>
                setDraft({ ...draft, settings: { ...draft.settings, aiProviderMode: event.target.value as AppStateRecord["settings"]["aiProviderMode"] } })
              }
            >
              <option value="rules">Rules fallback</option>
              <option value="user-key">User API key</option>
              <option value="cloud-proxy">Cloud proxy</option>
            </select>
          </label>
          <label>
            Chat / learning model
            <input value={draft.settings.aiModel} onChange={(event) => setDraft({ ...draft, settings: { ...draft.settings, aiModel: event.target.value } })} />
          </label>
          <label>
            Screenshot / vision model
            <input value={draft.settings.visionModel} onChange={(event) => setDraft({ ...draft, settings: { ...draft.settings, visionModel: event.target.value } })} />
          </label>
          <label>
            OpenRouter base URL
            <input value={draft.settings.openRouterBaseUrl} onChange={(event) => setDraft({ ...draft, settings: { ...draft.settings, openRouterBaseUrl: event.target.value } })} />
          </label>
          <label>
            Cloud proxy URL
            <input value={draft.settings.cloudProxyUrl} onChange={(event) => setDraft({ ...draft, settings: { ...draft.settings, cloudProxyUrl: event.target.value } })} />
          </label>
          <label>
            API key
            <input type="password" value={apiKeyDraft} onChange={(event) => setApiKeyDraft(event.target.value)} placeholder={draft.settings.apiKeySaved ? "Saved" : "Paste key"} />
          </label>
          {apiKeyStatus && <p className="settings-note">{apiKeyStatus}</p>}
          <div className="button-row">
            <button className="secondary" onClick={checkUserKey}>
              Check saved key
            </button>
            <button className="secondary" onClick={clearUserKey}>
              Clear saved key
            </button>
          </div>
        </section>
        <section className="panel">
          <h2>Data / local storage</h2>
          <button className="secondary" onClick={clearMemory}>
            Clear Bu&apos;s Memory
          </button>
          <button className="danger" onClick={clearAllData}>
            Clear learning data
          </button>
          <button className="secondary" onClick={resetOnboarding}>
            Reset onboarding
          </button>
        </section>
        <section className="panel">
          <h2>Desktop / extension</h2>
          <p>Desktop capture and browser extension captures land in Inbox automatically.</p>
          <label className="check-row">
            <input
              type="checkbox"
              checked={draft.settings.screenshotRecognitionEnabled}
              onChange={(event) =>
                setDraft({ ...draft, settings: { ...draft.settings, screenshotRecognitionEnabled: event.target.checked } })
              }
            />
            Enable screenshot recognition
          </label>
        </section>
      </div>
      <div className="bottom-actions">
        <button className="primary" onClick={() => saveSettings(draft, apiKeyDraft)}>
          {copy.save}
        </button>
      </div>
    </section>
  );
}
