import { useEffect, useState } from "react";
import { AppHeader } from "../../components/AppHeader";
import { interfaceLanguageOptions, languageOptions, targetLanguageOptions } from "../../lib/appOptions";
import { uiCopy } from "../../lib/uiCopy";
import type { AiProviderMode, AppStateRecord, DesktopCompanionMode, SupportPreference, UserProfile } from "../../types";

type SettingsPageProps = {
  appState: AppStateRecord;
  apiKeyDraft: string;
  apiKeyStatus: string;
  setApiKeyDraft: (value: string) => void;
  saveSettings: (state: AppStateRecord, key?: string) => Promise<boolean>;
  checkUserKey: () => void;
  clearUserKey: () => void;
  clearMemory: () => void;
  clearAllData: () => void;
  resetOnboarding: () => void;
};

type OptionControlProps<T extends string> = {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
  columns?: "two" | "three" | "auto";
  labels?: Partial<Record<T, string>>;
};

function OptionControl<T extends string>({ label, value, options, onChange, columns = "auto", labels = {} }: OptionControlProps<T>) {
  return (
    <div className="settings-control">
      <span>{label}</span>
      <div className={`settings-pill-grid ${columns}`}>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            className={`settings-pill${option === value ? " selected" : ""}`}
            onClick={() => onChange(option)}
          >
            {labels[option] ?? option}
          </button>
        ))}
      </div>
    </div>
  );
}

type SettingsSelectProps = {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
};

function SettingsSelect({ label, value, options, onChange }: SettingsSelectProps) {
  return (
    <label className="settings-select-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

const supportOptions: SupportPreference[] = ["Gentle", "Balanced", "Direct"];
const providerOptions: AiProviderMode[] = ["rules", "user-key", "cloud-proxy"];
const desktopCompanionOptions: DesktopCompanionMode[] = ["pet", "swift-notch"];

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
  const isChinese = draft.profile.interfaceLanguage === "中文";

  return (
    <section className="page settings-page">
      <AppHeader title={copy.title} description={copy.description} />
      <div className="settings-workbench">
        <section className="panel settings-card settings-language-card">
          <h2>{copy.language}</h2>
          <OptionControl<UserProfile["interfaceLanguage"]>
            label={copy.interfaceLanguage}
            value={draft.profile.interfaceLanguage}
            options={interfaceLanguageOptions}
            columns="two"
            onChange={(interfaceLanguage) => setDraft({ ...draft, profile: { ...draft.profile, interfaceLanguage } })}
          />
          <SettingsSelect
            label={copy.sourceLanguage}
            value={draft.profile.nativeLanguage}
            options={languageOptions}
            onChange={(nativeLanguage) => setDraft({ ...draft, profile: { ...draft.profile, nativeLanguage } })}
          />
          <SettingsSelect
            label={copy.targetLanguage}
            value={draft.profile.targetLanguage}
            options={targetLanguageOptions}
            onChange={(targetLanguage) => setDraft({ ...draft, profile: { ...draft.profile, targetLanguage } })}
          />
          <OptionControl
            label={copy.supportStrength}
            value={draft.settings.supportStrength}
            options={supportOptions}
            columns="three"
            onChange={(supportStrength) => setDraft({ ...draft, settings: { ...draft.settings, supportStrength } })}
          />
        </section>
        <section className="panel settings-card settings-ai-card">
          <h2>API settings</h2>
          <OptionControl
            label="Provider mode"
            value={draft.settings.aiProviderMode}
            options={providerOptions}
            columns="three"
            labels={{ rules: "Rules", "user-key": "API key", "cloud-proxy": "Cloud" }}
            onChange={(aiProviderMode) => setDraft({ ...draft, settings: { ...draft.settings, aiProviderMode } })}
          />
          <p className="settings-note">Rules is the offline mock mode for testing practice UI without API usage.</p>
          <label className="settings-field">
            Chat / learning model
            <input value={draft.settings.aiModel} onChange={(event) => setDraft({ ...draft, settings: { ...draft.settings, aiModel: event.target.value } })} />
          </label>
          <p className="settings-note">DeepSeek text models use the OpenAI-compatible Chat Completions API. Recommended: deepseek-v4-flash.</p>
          <label className="settings-field">
            Screenshot / vision model
            <input value={draft.settings.visionModel} onChange={(event) => setDraft({ ...draft, settings: { ...draft.settings, visionModel: event.target.value } })} />
          </label>
          <label className="settings-field">
            DeepSeek base URL
            <input value={draft.settings.deepSeekBaseUrl} onChange={(event) => setDraft({ ...draft, settings: { ...draft.settings, deepSeekBaseUrl: event.target.value } })} />
          </label>
          <label className="settings-field">
            OpenRouter base URL
            <input value={draft.settings.openRouterBaseUrl} onChange={(event) => setDraft({ ...draft, settings: { ...draft.settings, openRouterBaseUrl: event.target.value } })} />
          </label>
          <label className="settings-field">
            Cloud proxy URL
            <input value={draft.settings.cloudProxyUrl} onChange={(event) => setDraft({ ...draft, settings: { ...draft.settings, cloudProxyUrl: event.target.value } })} />
          </label>
          <label className="settings-field">
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
        <div className="settings-side-stack">
          <section className="panel settings-card settings-desktop-card">
            <h2>Desktop / extension</h2>
            <p>Desktop capture and browser extension captures land in Inbox automatically.</p>
            <OptionControl<DesktopCompanionMode>
              label={isChinese ? "桌面形态" : "Desktop companion"}
              value={draft.settings.desktopCompanionMode}
              options={desktopCompanionOptions}
              columns="two"
              labels={{
                pet: isChinese ? "宠物模式" : "Pet mode",
                "swift-notch": isChinese ? "Swift 小黑岛" : "Swift notch"
              }}
              onChange={(desktopCompanionMode) =>
                setDraft({ ...draft, settings: { ...draft.settings, desktopCompanionMode } })
              }
            />
            <p className="settings-note">
              {isChinese ? "保存后立即切换，重启 TinyBu 后保持上次选择。" : "Applies when saved and is restored after restarting TinyBu."}
            </p>
            <label className="settings-toggle-row">
              <input
                type="checkbox"
                checked={draft.settings.screenshotRecognitionEnabled}
                onChange={(event) =>
                  setDraft({ ...draft, settings: { ...draft.settings, screenshotRecognitionEnabled: event.target.checked } })
                }
              />
              <span>Enable screenshot recognition</span>
            </label>
          </section>
          <section className="panel settings-card settings-data-card">
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
        </div>
      </div>
      <div className="bottom-actions settings-actions">
        <button
          className="primary"
          onClick={async () => {
            if (!(await saveSettings(draft, apiKeyDraft))) setDraft(appState);
          }}
        >
          {copy.save}
        </button>
      </div>
    </section>
  );
}
