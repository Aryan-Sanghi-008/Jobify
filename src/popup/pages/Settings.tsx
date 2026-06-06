import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import ConfirmDialog from '@/popup/components/ConfirmDialog';
import { useEscapeKey } from '@/popup/hooks/useEscapeKey';
import Spinner from '@/popup/components/Spinner';
import { useToast } from '@/popup/components/Toast';
import {
  applyBackupImport,
  buildBackupPayload,
  getBackupPreview,
  hasExistingBackupData,
  parseBackupFile,
  type BackupPayload,
  type BackupPreview,
  type ImportMode,
} from '@/shared/backup';
import { GITHUB_URL, ISSUE_URL, VERSION } from '@/shared/constants';
import { generateDiagnosticReport, Logger } from '@/shared/logger';
import { checkStorageSize, validateApiKey } from '@/shared/security';
import {
  clearAllData,
  getApplications,
  getCoverLetters,
  getJobPreferences,
  getLearnedFieldStats,
  getSettings,
  saveJobPreferences,
  saveSettings,
} from '@/shared/storage';
import { getSelectorHealth } from '@/shared/selectorHealth';
import type {
  AppSettings,
  CoverLetterTemplate,
  JobPreferences,
  PortalName,
  TestAiConnectionResponse,
  Theme,
} from '@/shared/types';
import { exportApplicationsToCSV, formatByteSize } from '@/shared/utils';

const INPUT_CLASS =
  'w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';
const SECTION_TITLE_CLASS =
  'text-xs font-semibold uppercase tracking-wide text-gray-500';
const LABEL_CLASS = 'text-sm text-gray-800';

interface ImportPreviewDialogProps {
  preview: BackupPreview;
  hasExistingData: boolean;
  importMode: ImportMode;
  isImporting: boolean;
  onImportModeChange: (mode: ImportMode) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

function ImportPreviewDialog({
  preview,
  hasExistingData,
  importMode,
  isImporting,
  onImportModeChange,
  onConfirm,
  onCancel,
}: ImportPreviewDialogProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEscapeKey(onCancel, !isImporting);

  useEffect(() => {
    cancelButtonRef.current?.focus();
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-preview-title"
        className="w-full max-w-sm rounded-lg bg-white p-4 shadow-xl"
      >
        <h2
          id="import-preview-title"
          className="text-sm font-semibold text-gray-900"
        >
          Import backup
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          This backup contains:
        </p>
        <ul className="mt-2 space-y-1 text-sm text-gray-700">
          <li>{preview.applicationCount} application(s)</li>
          <li>{preview.coverLetterCount} cover letter(s)</li>
          <li>Profile: {preview.hasProfile ? 'Yes' : 'No'}</li>
          <li>{preview.learnedFieldCount} learned field(s)</li>
        </ul>

        {hasExistingData ? (
          <fieldset className="mt-4">
            <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Existing data found
            </legend>
            <div className="mt-2 space-y-2">
              <label className="flex items-start gap-2 text-sm text-gray-700">
                <input
                  type="radio"
                  name="import-mode"
                  value="merge"
                  checked={importMode === 'merge'}
                  onChange={() => onImportModeChange('merge')}
                  className="mt-0.5 h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span>
                  <span className="font-medium">Merge</span>
                  <span className="mt-0.5 block text-xs text-gray-500">
                    Combine lists and keep the newer profile.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm text-gray-700">
                <input
                  type="radio"
                  name="import-mode"
                  value="replace"
                  checked={importMode === 'replace'}
                  onChange={() => onImportModeChange('replace')}
                  className="mt-0.5 h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span>
                  <span className="font-medium">Replace</span>
                  <span className="mt-0.5 block text-xs text-gray-500">
                    Overwrite all local data with this backup.
                  </span>
                </span>
              </label>
            </div>
          </fieldset>
        ) : null}

        <div className="mt-4 flex gap-2">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={onCancel}
            disabled={isImporting}
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-70"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isImporting}
            className="flex-1 rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-70"
          >
            {isImporting ? 'Importing…' : 'Confirm import'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface ToggleRowProps {
  label: string;
  description?: string;
  warning?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function handleSwitchKeyDown(
  event: KeyboardEvent<HTMLButtonElement>,
  checked: boolean,
  onChange: (checked: boolean) => void,
): void {
  if (event.key === ' ' || event.key === 'Enter') {
    event.preventDefault();
    onChange(!checked);
  }
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
        aria-label={label}
        onClick={() => onChange(!checked)}
        onKeyDown={(event) => handleSwitchKeyDown(event, checked, onChange)}
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
  const [importError, setImportError] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [pendingImport, setPendingImport] = useState<BackupPayload | null>(null);
  const [importPreview, setImportPreview] = useState<BackupPreview | null>(null);
  const [importHasExistingData, setImportHasExistingData] = useState(false);
  const [importMode, setImportMode] = useState<ImportMode>('merge');
  const [learnedStats, setLearnedStats] = useState<{
    totalLearned: number;
  } | null>(null);
  const [isCopyingDiagnostics, setIsCopyingDiagnostics] = useState(false);
  const [selectorHealth, setSelectorHealth] = useState<
    { portal: PortalName; failures: Record<string, number> }[]
  >([]);
  const [aiApiKeyDraft, setAiApiKeyDraft] = useState('');
  const [aiProviderDraft, setAiProviderDraft] = useState<'anthropic' | 'openai'>(
    'anthropic',
  );
  const [hasSavedApiKey, setHasSavedApiKey] = useState(false);
  const [isTestingAiConnection, setIsTestingAiConnection] = useState(false);
  const [isSavingAiSettings, setIsSavingAiSettings] = useState(false);
  const [jobPreferences, setJobPreferences] = useState<JobPreferences | null>(
    null,
  );
  const [jobPrefsDraft, setJobPrefsDraft] = useState({
    desiredRole: '',
    preferredLocations: '',
    minSalary: '',
    adzunaAppId: '',
    adzunaAppKey: '',
    adzunaCountry: 'gb',
  });
  const [hasSavedAdzunaKey, setHasSavedAdzunaKey] = useState(false);
  const [isSavingJobPrefs, setIsSavingJobPrefs] = useState(false);

  const importInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  const persistSettings = useCallback(
    async (updates: Partial<AppSettings>) => {
      await saveSettings(updates);
      setSettings((current) => (current ? { ...current, ...updates } : current));
      showToast('Saved', 'success');
    },
    [showToast],
  );

  useEffect(() => {
    void (async () => {
      const [loadedSettings, templates, stats, storageSize, loadedJobPrefs] =
        await Promise.all([
          getSettings(),
          getCoverLetters(),
          getLearnedFieldStats(),
          checkStorageSize(),
          getJobPreferences(),
        ]);
      setSettings(loadedSettings);
      setCoverLetters(templates);
      setLearnedStats({ totalLearned: stats.totalLearned });
      setJobPreferences(loadedJobPrefs);
      setHasSavedAdzunaKey(Boolean(loadedJobPrefs.adzunaAppKey));
      setJobPrefsDraft({
        desiredRole: loadedJobPrefs.desiredRole,
        preferredLocations: loadedJobPrefs.preferredLocations.join(', '),
        minSalary:
          loadedJobPrefs.minSalary === null
            ? ''
            : String(loadedJobPrefs.minSalary),
        adzunaAppId: loadedJobPrefs.adzunaAppId ?? '',
        adzunaAppKey: '',
        adzunaCountry: loadedJobPrefs.adzunaCountry,
      });
      setHasSavedApiKey(Boolean(loadedSettings.apiKey));
      setAiProviderDraft(loadedSettings.aiProvider ?? 'anthropic');
      setAiApiKeyDraft('');
      Logger.setDebugMode(loadedSettings.debugMode);
      if (loadedSettings.debugMode) {
        setSelectorHealth(await getSelectorHealth());
      }
      setIsLoading(false);

      if (storageSize.exceedsWarningThreshold) {
        showToast(
          'Storage is over 4MB. Export or clear old data to avoid hitting the 5MB limit.',
          'info',
        );
      }
    })();
  }, [showToast]);

  const handleExport = async () => {
    const payload = await buildBackupPayload();
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const date = new Date().toISOString().slice(0, 10);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `job-autofill-backup-${date}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${formatByteSize(blob.size)}`, 'success');
  };

  const handleExportApplicationsCsv = async () => {
    const applications = await getApplications();
    const csv = exportApplicationsToCSV(applications);
    const date = new Date().toISOString().slice(0, 10);
    const dataUri = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
    const anchor = document.createElement('a');
    anchor.href = dataUri;
    anchor.download = `job-applications-${date}.csv`;
    anchor.click();
    showToast(
      applications.length === 0
        ? 'Exported empty CSV'
        : `Exported ${applications.length} application(s)`,
      'success',
    );
  };

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    setImportError(null);

    try {
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);
      const payload = parseBackupFile(parsed);

      if (!payload) {
        setImportError('Invalid backup file. Check version and required fields.');
        return;
      }

      const [preview, hasExistingData] = await Promise.all([
        Promise.resolve(getBackupPreview(payload)),
        hasExistingBackupData(),
      ]);

      setPendingImport(payload);
      setImportPreview(preview);
      setImportHasExistingData(hasExistingData);
      setImportMode(hasExistingData ? 'merge' : 'replace');
    } catch {
      setImportError('Could not read or parse the backup file.');
    }
  };

  const handleCancelImport = () => {
    setPendingImport(null);
    setImportPreview(null);
    setImportHasExistingData(false);
    setImportMode('merge');
  };

  const handleConfirmImport = async () => {
    if (!pendingImport) {
      return;
    }

    setIsImporting(true);
    setImportError(null);

    try {
      await applyBackupImport(
        pendingImport,
        importHasExistingData ? importMode : 'replace',
      );
      window.location.reload();
    } catch {
      setImportError('Import failed. Try again or use a different backup file.');
      setIsImporting(false);
    }
  };

  const handleClearData = async () => {
    await clearAllData();
    window.location.reload();
  };

  const getAiKeyForAction = (): string | null => {
    const draft = aiApiKeyDraft.trim();
    if (draft) {
      return draft;
    }

    return settings?.apiKey?.trim() ? settings.apiKey : null;
  };

  const handleTestAiConnection = async () => {
    const apiKey = getAiKeyForAction();

    if (!apiKey) {
      showToast('Enter an API key to test the connection', 'error');
      return;
    }

    if (!validateApiKey(apiKey, aiProviderDraft)) {
      showToast('API key format is invalid for the selected provider', 'error');
      return;
    }

    setIsTestingAiConnection(true);

    try {
      const response = (await chrome.runtime.sendMessage({
        type: 'TEST_AI_CONNECTION',
        apiKey,
        provider: aiProviderDraft,
      })) as TestAiConnectionResponse | undefined;

      if (response?.success) {
        showToast(response.message, 'success');
      } else {
        showToast(response?.message ?? 'Connection test failed', 'error');
      }
    } catch {
      showToast('Connection test failed', 'error');
    } finally {
      setIsTestingAiConnection(false);
    }
  };

  const handleSaveAiSettings = async () => {
    const draft = aiApiKeyDraft.trim();

    if (draft) {
      if (!validateApiKey(draft, aiProviderDraft)) {
        showToast('API key format is invalid for the selected provider', 'error');
        return;
      }
    } else if (!hasSavedApiKey) {
      showToast('Enter an API key to enable AI integration', 'error');
      return;
    } else {
      await saveSettings({ aiProvider: aiProviderDraft });
      setSettings((current) =>
        current ? { ...current, aiProvider: aiProviderDraft } : current,
      );
      showToast('Saved', 'success');
      return;
    }

    setIsSavingAiSettings(true);

    try {
      await saveSettings({
        apiKey: draft,
        aiProvider: aiProviderDraft,
      });
      setSettings((current) =>
        current
          ? { ...current, apiKey: draft, aiProvider: aiProviderDraft }
          : current,
      );
      setHasSavedApiKey(true);
      setAiApiKeyDraft('');
      showToast('Saved', 'success');
    } catch {
      showToast('Could not save AI settings', 'error');
    } finally {
      setIsSavingAiSettings(false);
    }
  };

  const handleClearAiSettings = async () => {
    setIsSavingAiSettings(true);

    try {
      await saveSettings({ apiKey: null, aiProvider: null });
      setSettings((current) =>
        current ? { ...current, apiKey: null, aiProvider: null } : current,
      );
      setHasSavedApiKey(false);
      setAiApiKeyDraft('');
      showToast('AI integration disabled', 'success');
    } catch {
      showToast('Could not clear AI settings', 'error');
    } finally {
      setIsSavingAiSettings(false);
    }
  };

  const handleSaveJobPreferences = async () => {
    const desiredRole = jobPrefsDraft.desiredRole.trim();
    const preferredLocations = jobPrefsDraft.preferredLocations
      .split(',')
      .map((location) => location.trim())
      .filter(Boolean);
    const minSalary =
      jobPrefsDraft.minSalary.trim() === ''
        ? null
        : Number.parseInt(jobPrefsDraft.minSalary, 10);

    if (minSalary !== null && Number.isNaN(minSalary)) {
      showToast('Minimum salary must be a number', 'error');
      return;
    }

    setIsSavingJobPrefs(true);

    try {
      const updates: Partial<JobPreferences> = {
        desiredRole,
        preferredLocations,
        minSalary,
        adzunaCountry: jobPrefsDraft.adzunaCountry,
      };

      if (jobPrefsDraft.adzunaAppId.trim()) {
        updates.adzunaAppId = jobPrefsDraft.adzunaAppId.trim();
      }

      if (jobPrefsDraft.adzunaAppKey.trim()) {
        updates.adzunaAppKey = jobPrefsDraft.adzunaAppKey.trim();
        setHasSavedAdzunaKey(true);
      }

      await saveJobPreferences(updates);
      const saved = await getJobPreferences();
      setJobPreferences(saved);
      setJobPrefsDraft((current) => ({ ...current, adzunaAppKey: '' }));
      showToast('Job preferences saved', 'success');
    } catch {
      showToast('Could not save job preferences', 'error');
    } finally {
      setIsSavingJobPrefs(false);
    }
  };

  const handleCopyDiagnosticReport = async () => {
    setIsCopyingDiagnostics(true);

    try {
      const report = await generateDiagnosticReport();
      await navigator.clipboard.writeText(report);
      showToast('Diagnostic report copied to clipboard', 'success');
    } catch {
      showToast('Could not copy diagnostic report', 'error');
    } finally {
      setIsCopyingDiagnostics(false);
    }
  };

  if (isLoading || !settings) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner size="md" className="text-blue-600" />
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

      <SettingsSection title="Job Preferences">
        <p className="mb-3 text-xs leading-relaxed text-gray-500">
          Jobs are fetched from public feeds every 4 hours when a desired role is
          set. Sources: RemoteOK, Arbeitnow, and optional Adzuna.
        </p>

        <label className={LABEL_CLASS}>Desired role</label>
        <input
          type="text"
          value={jobPrefsDraft.desiredRole}
          onChange={(event) =>
            setJobPrefsDraft((current) => ({
              ...current,
              desiredRole: event.target.value,
            }))
          }
          placeholder="e.g. software engineer"
          className={`${INPUT_CLASS} mt-1`}
        />

        <label className={`${LABEL_CLASS} mt-3 block`}>Preferred locations</label>
        <input
          type="text"
          value={jobPrefsDraft.preferredLocations}
          onChange={(event) =>
            setJobPrefsDraft((current) => ({
              ...current,
              preferredLocations: event.target.value,
            }))
          }
          placeholder="remote, Berlin, London"
          className={`${INPUT_CLASS} mt-1`}
        />

        <label className={`${LABEL_CLASS} mt-3 block`}>
          Minimum salary (USD, optional)
        </label>
        <input
          type="number"
          min="0"
          value={jobPrefsDraft.minSalary}
          onChange={(event) =>
            setJobPrefsDraft((current) => ({
              ...current,
              minSalary: event.target.value,
            }))
          }
          placeholder="80000"
          className={`${INPUT_CLASS} mt-1`}
        />

        <label className={`${LABEL_CLASS} mt-3 block`}>Adzuna App ID (optional)</label>
        <input
          type="text"
          value={jobPrefsDraft.adzunaAppId}
          onChange={(event) =>
            setJobPrefsDraft((current) => ({
              ...current,
              adzunaAppId: event.target.value,
            }))
          }
          placeholder={jobPreferences?.adzunaAppId ? 'Saved' : 'App ID'}
          autoComplete="off"
          className={`${INPUT_CLASS} mt-1`}
        />

        <label className={`${LABEL_CLASS} mt-3 block`}>Adzuna App Key (optional)</label>
        <input
          type="password"
          value={jobPrefsDraft.adzunaAppKey}
          onChange={(event) =>
            setJobPrefsDraft((current) => ({
              ...current,
              adzunaAppKey: event.target.value,
            }))
          }
          placeholder={hasSavedAdzunaKey ? 'Saved (enter to replace)' : 'App key'}
          autoComplete="off"
          className={`${INPUT_CLASS} mt-1`}
        />

        <label className={`${LABEL_CLASS} mt-3 block`}>Adzuna country</label>
        <select
          value={jobPrefsDraft.adzunaCountry}
          onChange={(event) =>
            setJobPrefsDraft((current) => ({
              ...current,
              adzunaCountry: event.target.value,
            }))
          }
          className={`${INPUT_CLASS} mt-1`}
        >
          <option value="gb">United Kingdom</option>
          <option value="us">United States</option>
          <option value="in">India</option>
          <option value="de">Germany</option>
          <option value="au">Australia</option>
        </select>

        <button
          type="button"
          onClick={() => void handleSaveJobPreferences()}
          disabled={isSavingJobPrefs}
          className="mt-3 w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-70"
        >
          {isSavingJobPrefs ? 'Saving…' : 'Save job preferences'}
        </button>
      </SettingsSection>

      <SettingsSection title="AI Integration">
        <p className="mb-3 text-xs leading-relaxed text-gray-500">
          Optional AI cover letter generation. When enabled, job description and
          profile summary are sent to your chosen provider. API keys stay on this
          device only.
        </p>

        <label className={LABEL_CLASS}>API key</label>
        <input
          type="password"
          value={aiApiKeyDraft}
          onChange={(event) => setAiApiKeyDraft(event.target.value)}
          placeholder={hasSavedApiKey ? 'Saved (enter to replace)' : 'sk-...'}
          autoComplete="off"
          className={`${INPUT_CLASS} mt-1`}
        />

        <label className={`${LABEL_CLASS} mt-3 block`}>Provider</label>
        <select
          value={aiProviderDraft}
          onChange={(event) =>
            setAiProviderDraft(event.target.value as 'anthropic' | 'openai')
          }
          className={`${INPUT_CLASS} mt-1`}
        >
          <option value="anthropic">Anthropic</option>
          <option value="openai">OpenAI</option>
        </select>

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => void handleTestAiConnection()}
            disabled={isTestingAiConnection || isSavingAiSettings}
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-70"
          >
            {isTestingAiConnection ? 'Testing…' : 'Test connection'}
          </button>
          <button
            type="button"
            onClick={() => void handleSaveAiSettings()}
            disabled={isSavingAiSettings || isTestingAiConnection}
            className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-70"
          >
            {isSavingAiSettings ? 'Saving…' : 'Save'}
          </button>
        </div>
        {hasSavedApiKey ? (
          <button
            type="button"
            onClick={() => void handleClearAiSettings()}
            disabled={isSavingAiSettings || isTestingAiConnection}
            className="mt-2 w-full rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-70"
          >
            Remove API key
          </button>
        ) : null}
      </SettingsSection>

      <SettingsSection title="Developer">
        <ToggleRow
          label="Debug mode"
          description="Verbose logs in the console. Never includes email, phone, CTC, or cover letter text."
          checked={settings.debugMode}
          onChange={(checked) => {
            Logger.setDebugMode(checked);
            void persistSettings({ debugMode: checked });
            if (checked) {
              void getSelectorHealth().then(setSelectorHealth);
            } else {
              setSelectorHealth([]);
            }
          }}
        />
        {settings.debugMode ? (
          <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Selector Health
            </h3>
            {selectorHealth.length === 0 ? (
              <p className="mt-2 text-xs text-gray-500">
                No selector failures recorded yet.
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {selectorHealth.map(({ portal, failures }) => (
                  <li key={portal}>
                    <p className="text-sm font-medium capitalize text-gray-800">
                      {portal}
                    </p>
                    <ul className="mt-1 space-y-0.5 pl-3">
                      {Object.entries(failures)
                        .sort(([left], [right]) => left.localeCompare(right))
                        .map(([selectorKey, count]) => (
                          <li
                            key={selectorKey}
                            className="text-xs text-gray-600"
                          >
                            {selectorKey}: {count} failure{count === 1 ? '' : 's'}
                          </li>
                        ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => void handleCopyDiagnosticReport()}
          disabled={isCopyingDiagnostics}
          className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-70"
        >
          {isCopyingDiagnostics ? 'Copying…' : 'Copy diagnostic report'}
        </button>
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

          <button
            type="button"
            onClick={() => void handleExportApplicationsCsv()}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Export applications as CSV
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
            Import data
          </button>
          {importError ? (
            <p className="text-xs text-red-600">{importError}</p>
          ) : null}

          <button
            type="button"
            onClick={() => setShowClearConfirm(true)}
            className="w-full rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Clear all data
          </button>
        </div>
      </SettingsSection>

      <SettingsSection title="About">
        <div className="space-y-2 text-sm text-gray-700">
          {learnedStats !== null ? (
            <p>
              You&apos;ve taught the extension {learnedStats.totalLearned} custom
              fields.
            </p>
          ) : null}
          <p>
            <span className="font-medium">Version</span> {VERSION}
          </p>
          <p className="text-xs leading-relaxed text-gray-600">
            All your data is stored locally on your device using Chrome&apos;s storage
            API. Nothing is sent to our servers. If you enable AI Integration,
            cover letter requests go directly to your chosen AI provider.
          </p>
          <p className="text-xs leading-relaxed text-gray-600">
            Released under the MIT License. See the LICENSE file in the project
            repository.
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

      {showClearConfirm ? (
        <ConfirmDialog
          title="Clear all data"
          message="Clear all extension data? This cannot be undone."
          confirmLabel="Yes, clear everything"
          onConfirm={() => void handleClearData()}
          onCancel={() => setShowClearConfirm(false)}
        />
      ) : null}

      {pendingImport && importPreview ? (
        <ImportPreviewDialog
          preview={importPreview}
          hasExistingData={importHasExistingData}
          importMode={importMode}
          isImporting={isImporting}
          onImportModeChange={setImportMode}
          onConfirm={() => void handleConfirmImport()}
          onCancel={handleCancelImport}
        />
      ) : null}
    </div>
  );
}
