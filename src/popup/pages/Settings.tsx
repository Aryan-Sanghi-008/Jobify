import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from 'react';
import { VERSION } from '@/shared/constants';
import {
  clearAllData,
  getApplications,
  getCoverLetters,
  getProfile,
  getSettings,
  saveSettings,
} from '@/shared/storage';
import type {
  AppSettings,
  CoverLetterTemplate,
  JobApplication,
  Theme,
  UserProfile,
} from '@/shared/types';

const INPUT_CLASS =
  'w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';
const SECTION_TITLE_CLASS =
  'text-xs font-semibold uppercase tracking-wide text-gray-500';
const LABEL_CLASS = 'text-sm text-gray-800';
const GITHUB_URL = 'https://github.com/your-org/job-autofill';
const ISSUE_URL = 'https://github.com/your-org/job-autofill/issues';

interface ImportPayload {
  profile: UserProfile | null;
  coverLetters: CoverLetterTemplate[];
  applications: JobApplication[];
  settings: AppSettings;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark' || value === 'system';
}

function isUserProfile(value: unknown): value is UserProfile {
  if (!isRecord(value)) {
    return false;
  }

  return isRecord(value.personal) && isRecord(value.professional);
}

function isCoverLetterTemplate(value: unknown): value is CoverLetterTemplate {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.body === 'string' &&
    typeof value.createdAt === 'number' &&
    typeof value.updatedAt === 'number'
  );
}

function isJobApplication(value: unknown): value is JobApplication {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === 'string' &&
    typeof value.company === 'string' &&
    typeof value.role === 'string' &&
    typeof value.portal === 'string' &&
    typeof value.url === 'string' &&
    typeof value.appliedAt === 'number' &&
    typeof value.status === 'string'
  );
}

function isAppSettings(value: unknown): value is AppSettings {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.autoFillOnLoad === 'boolean' &&
    typeof value.pauseBeforeSubmit === 'boolean' &&
    typeof value.highlightUnknownFields === 'boolean' &&
    (value.defaultCoverLetterId === null || typeof value.defaultCoverLetterId === 'string') &&
    isTheme(value.theme)
  );
}

function validateImportPayload(data: unknown): data is ImportPayload {
  if (!isRecord(data)) {
    return false;
  }

  const profileValid = data.profile === null || isUserProfile(data.profile);
  const coverLettersValid =
    Array.isArray(data.coverLetters) &&
    data.coverLetters.every((item) => isCoverLetterTemplate(item));
  const applicationsValid =
    Array.isArray(data.applications) &&
    data.applications.every((item) => isJobApplication(item));

  return (
    profileValid &&
    coverLettersValid &&
    applicationsValid &&
    isAppSettings(data.settings)
  );
}

interface ToggleRowProps {
  label: string;
  description?: string;
  warning?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function ToggleRow({ label, description, warning, checked, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <div className="min-w-0 flex-1">
        <p className={LABEL_CLASS}>{label}</p>
        {description ? (
          <p className="mt-0.5 text-xs text-gray-500">{description}</p>
        ) : null}
        {warning ? (
          <p className="mt-0.5 text-xs text-amber-600">{warning}</p>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-blue-600' : 'bg-gray-300'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

interface SettingsSectionProps {
  title: string;
  children: ReactNode;
}

function SettingsSection({ title, children }: SettingsSectionProps) {
  return (
    <section className="border-b border-gray-200 py-3">
      <h2 className={`${SECTION_TITLE_CLASS} mb-2`}>{title}</h2>
      {children}
    </section>
  );
}

export default function Settings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [coverLetters, setCoverLetters] = useState<CoverLetterTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const importInputRef = useRef<HTMLInputElement>(null);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((message: string) => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }

    setToast(message);
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 2200);
  }, []);

  const persistSettings = useCallback(
    async (updates: Partial<AppSettings>) => {
      await saveSettings(updates);
      setSettings((current) => (current ? { ...current, ...updates } : current));
      showToast('Saved');
    },
    [showToast],
  );

  useEffect(() => {
    void (async () => {
      const [loadedSettings, templates] = await Promise.all([
        getSettings(),
        getCoverLetters(),
      ]);
      setSettings(loadedSettings);
      setCoverLetters(templates);
      setIsLoading(false);
    })();

    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const handleExport = async () => {
    const [profile, letters, applications, currentSettings] = await Promise.all([
      getProfile(),
      getCoverLetters(),
      getApplications(),
      getSettings(),
    ]);

    const payload: ImportPayload = {
      profile,
      coverLetters: letters,
      applications,
      settings: currentSettings,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const date = new Date().toISOString().slice(0, 10);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `job-autofill-backup-${date}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    showToast('Data exported');
  };

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    setIsImporting(true);
    setImportError(null);

    try {
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);

      if (!validateImportPayload(parsed)) {
        setImportError('Invalid backup file structure.');
        setIsImporting(false);
        return;
      }

      await chrome.storage.local.set({
        profile: parsed.profile,
        coverLetters: parsed.coverLetters,
        applications: parsed.applications,
        settings: parsed.settings,
      });

      window.location.reload();
    } catch {
      setImportError('Could not read or parse the backup file.');
      setIsImporting(false);
    }
  };

  const handleClearData = async () => {
    await clearAllData();
    window.location.reload();
  };

  if (isLoading || !settings) {
    return (
      <div className="flex items-center justify-center py-16">
        <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-r-transparent" />
      </div>
    );
  }

  return (
    <div className="relative px-4 pb-4">
      <SettingsSection title="Auto-fill behaviour">
        <ToggleRow
          label="Auto-fill when page loads"
          warning="May cause issues on some sites"
          checked={settings.autoFillOnLoad}
          onChange={(checked) => void persistSettings({ autoFillOnLoad: checked })}
        />
        <ToggleRow
          label="Pause before submitting"
          checked={settings.pauseBeforeSubmit}
          onChange={(checked) => void persistSettings({ pauseBeforeSubmit: checked })}
        />
        <ToggleRow
          label="Highlight unknown fields in orange"
          checked={settings.highlightUnknownFields}
          onChange={(checked) =>
            void persistSettings({ highlightUnknownFields: checked })
          }
        />
      </SettingsSection>

      <SettingsSection title="Cover Letter">
        <label className={LABEL_CLASS}>Default cover letter template</label>
        <select
          value={settings.defaultCoverLetterId ?? ''}
          onChange={(event) => {
            const value = event.target.value;
            void persistSettings({
              defaultCoverLetterId: value === '' ? null : value,
            });
          }}
          className={`${INPUT_CLASS} mt-1`}
        >
          <option value="">None</option>
          {coverLetters.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
      </SettingsSection>

      <SettingsSection title="Appearance">
        <fieldset>
          <legend className={`${LABEL_CLASS} mb-2`}>Theme</legend>
          <div className="space-y-2">
            {(['light', 'dark', 'system'] as Theme[]).map((theme) => (
              <label key={theme} className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="radio"
                  name="theme"
                  value={theme}
                  checked={settings.theme === theme}
                  onChange={() => void persistSettings({ theme })}
                  className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                {theme.charAt(0).toUpperCase() + theme.slice(1)}
              </label>
            ))}
          </div>
        </fieldset>
      </SettingsSection>

      <SettingsSection title="Data management">
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => void handleExport()}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Export my data
          </button>

          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => void handleImportFile(event)}
          />
          <button
            type="button"
            onClick={() => importInputRef.current?.click()}
            disabled={isImporting}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-70"
          >
            {isImporting ? 'Importing…' : 'Import data'}
          </button>
          {importError ? (
            <p className="text-xs text-red-600">{importError}</p>
          ) : null}

          {showClearConfirm ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3">
              <p className="text-sm font-medium text-red-800">
                Clear all extension data? This cannot be undone.
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleClearData()}
                  className="flex-1 rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
                >
                  Yes, clear everything
                </button>
                <button
                  type="button"
                  onClick={() => setShowClearConfirm(false)}
                  className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-white"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowClearConfirm(true)}
              className="w-full rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
            >
              Clear all data
            </button>
          )}
        </div>
      </SettingsSection>

      <SettingsSection title="About">
        <div className="space-y-2 text-sm text-gray-700">
          <p>
            <span className="font-medium">Version</span> {VERSION}
          </p>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-blue-600 hover:text-blue-800"
          >
            GitHub
          </a>
          <a
            href={ISSUE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-blue-600 hover:text-blue-800"
          >
            Report an issue
          </a>
        </div>
      </SettingsSection>

      {toast ? (
        <div
          role="status"
          className="pointer-events-none fixed bottom-16 left-1/2 z-50 -translate-x-1/2 rounded-full bg-gray-900 px-4 py-1.5 text-xs font-medium text-white shadow-lg"
        >
          {toast}
        </div>
      ) : null}
    </div>
  );
}
