import {
  DEFAULT_JOB_PREFERENCES,
  exportLearnedFields,
  getApplications,
  getCoverLetters,
  getLearnedFields,
  getProfile,
  getSettings,
  importLearnedFields,
  normalizeLearnedFieldsStorage,
} from './storage';
import type {
  AppSettings,
  CoverLetterTemplate,
  JobApplication,
  LearnedField,
  SavedProfile,
  UserProfile,
} from './types';

export const BACKUP_VERSION = '1.0';

export const BACKUP_REQUIRED_KEYS = [
  'version',
  'exportedAt',
  'profile',
  'coverLetters',
  'applications',
  'learnedFields',
  'settings',
] as const;

export interface BackupPayload {
  version: string;
  exportedAt: number;
  profile: UserProfile | null;
  coverLetters: CoverLetterTemplate[];
  applications: JobApplication[];
  learnedFields: Record<string, LearnedField>;
  settings: AppSettings;
}

export interface BackupPreview {
  applicationCount: number;
  coverLetterCount: number;
  learnedFieldCount: number;
  hasProfile: boolean;
}

export type ImportMode = 'merge' | 'replace';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isTheme(value: unknown): value is AppSettings['theme'] {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function isUserProfile(value: unknown): value is UserProfile {
  if (!isRecord(value)) {
    return false;
  }

  return isRecord(value.personal) && isRecord(value.professional);
}

export function isCoverLetterTemplate(value: unknown): value is CoverLetterTemplate {
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

export function isJobApplication(value: unknown): value is JobApplication {
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

export function isLearnedField(value: unknown): value is LearnedField {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.value === 'string' &&
    typeof value.normalizedLabel === 'string' &&
    typeof value.learnedAt === 'number' &&
    typeof value.timesUsed === 'number' &&
    Array.isArray(value.sites) &&
    value.sites.every((site) => typeof site === 'string')
  );
}

export function isAppSettings(value: unknown): value is AppSettings {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.autoFillOnLoad === 'boolean' &&
    typeof value.pauseBeforeSubmit === 'boolean' &&
    typeof value.highlightUnknownFields === 'boolean' &&
    (value.defaultCoverLetterId === null ||
      typeof value.defaultCoverLetterId === 'string') &&
    isTheme(value.theme) &&
    (value.debugMode === undefined || typeof value.debugMode === 'boolean') &&
    (value.onboardingComplete === undefined ||
      typeof value.onboardingComplete === 'boolean') &&
    (value.apiKey === undefined ||
      value.apiKey === null ||
      typeof value.apiKey === 'string') &&
    (value.aiProvider === undefined ||
      value.aiProvider === null ||
      value.aiProvider === 'anthropic' ||
      value.aiProvider === 'openai')
  );
}

function isValidBackupData(data: Record<string, unknown>): boolean {
  if (data.version !== BACKUP_VERSION) {
    return false;
  }

  if (typeof data.exportedAt !== 'number') {
    return false;
  }

  const profileValid = data.profile === null || isUserProfile(data.profile);
  const coverLettersValid =
    Array.isArray(data.coverLetters) &&
    data.coverLetters.every((item) => isCoverLetterTemplate(item));
  const applicationsValid =
    Array.isArray(data.applications) &&
    data.applications.every((item) => isJobApplication(item));
  const learnedFieldsValid =
    isRecord(data.learnedFields) &&
    Object.values(data.learnedFields).every((item) => isLearnedField(item));

  return (
    profileValid &&
    coverLettersValid &&
    applicationsValid &&
    learnedFieldsValid &&
    isAppSettings(data.settings)
  );
}

function validateLegacyBackupData(
  data: Record<string, unknown>,
): data is Omit<BackupPayload, 'version' | 'exportedAt' | 'learnedFields'> {
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

export function getBackupPreview(payload: BackupPayload): BackupPreview {
  const uniqueLearned = new Set(
    Object.values(payload.learnedFields).map(
      (field) => field.normalizedLabel || field.value,
    ),
  );

  return {
    applicationCount: payload.applications.length,
    coverLetterCount: payload.coverLetters.length,
    learnedFieldCount: uniqueLearned.size,
    hasProfile:
      payload.profile !== null && payload.profile.personal.email.trim() !== '',
  };
}

export function parseBackupFile(data: unknown): BackupPayload | null {
  if (!isRecord(data)) {
    return null;
  }

  if ('version' in data && data.version !== BACKUP_VERSION) {
    return null;
  }

  const missingKeys = BACKUP_REQUIRED_KEYS.filter((key) => !(key in data));
  if (missingKeys.length === 0 && isValidBackupData(data)) {
    return {
      version: data.version as string,
      exportedAt: data.exportedAt as number,
      profile: data.profile as UserProfile | null,
      coverLetters: data.coverLetters as CoverLetterTemplate[],
      applications: data.applications as JobApplication[],
      learnedFields: data.learnedFields as Record<string, LearnedField>,
      settings: data.settings as AppSettings,
    };
  }

  if ('version' in data) {
    return null;
  }

  if (validateLegacyBackupData(data)) {
    return {
      version: BACKUP_VERSION,
      exportedAt: Date.now(),
      profile: data.profile,
      coverLetters: data.coverLetters,
      applications: data.applications,
      learnedFields: {},
      settings: data.settings,
    };
  }

  return null;
}

export async function buildBackupPayload(): Promise<BackupPayload> {
  const [profile, coverLetters, applications, learnedFields, settings] =
    await Promise.all([
      getProfile(),
      getCoverLetters(),
      getApplications(),
      exportLearnedFields(),
      getSettings(),
    ]);

  return {
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    profile,
    coverLetters,
    applications,
    learnedFields,
    settings: { ...settings, apiKey: null },
  };
}

export function mergeApplications(
  existing: JobApplication[],
  incoming: JobApplication[],
): JobApplication[] {
  const byId = new Map<string, JobApplication>();

  for (const application of existing) {
    byId.set(application.id, application);
  }

  for (const application of incoming) {
    const previous = byId.get(application.id);
    if (!previous || application.appliedAt >= previous.appliedAt) {
      byId.set(application.id, application);
    }
  }

  return Array.from(byId.values()).sort(
    (left, right) => right.appliedAt - left.appliedAt,
  );
}

export function mergeCoverLetters(
  existing: CoverLetterTemplate[],
  incoming: CoverLetterTemplate[],
): CoverLetterTemplate[] {
  const byId = new Map<string, CoverLetterTemplate>();

  for (const template of existing) {
    byId.set(template.id, template);
  }

  for (const template of incoming) {
    const previous = byId.get(template.id);
    if (!previous || template.updatedAt >= previous.updatedAt) {
      byId.set(template.id, template);
    }
  }

  return Array.from(byId.values()).sort(
    (left, right) => right.updatedAt - left.updatedAt,
  );
}

export function mergeLearnedFields(
  existing: Record<string, LearnedField>,
  incoming: Record<string, LearnedField>,
): Record<string, LearnedField> {
  const merged = { ...existing };

  for (const [key, field] of Object.entries(incoming)) {
    const previous = merged[key];
    if (!previous || field.learnedAt >= previous.learnedAt) {
      merged[key] = field;
    }
  }

  return merged;
}

export function mergeProfile(
  existing: UserProfile | null,
  incoming: UserProfile | null,
  incomingExportedAt: number,
  localDataTimestamp: number,
): UserProfile | null {
  if (!incoming) {
    return existing;
  }

  if (!existing || existing.personal.email.trim() === '') {
    return incoming;
  }

  if (incoming.personal.email.trim() === '') {
    return existing;
  }

  return incomingExportedAt > localDataTimestamp ? incoming : existing;
}

export async function getLocalDataTimestamp(): Promise<number> {
  const [coverLetters, applications] = await Promise.all([
    getCoverLetters(),
    getApplications(),
  ]);

  const coverLetterMax = coverLetters.reduce(
    (max, template) => Math.max(max, template.updatedAt),
    0,
  );
  const applicationMax = applications.reduce(
    (max, application) => Math.max(max, application.appliedAt),
    0,
  );

  return Math.max(coverLetterMax, applicationMax);
}

export async function hasExistingBackupData(): Promise<boolean> {
  const [profile, coverLetters, applications, learnedFields] = await Promise.all([
    getProfile(),
    getCoverLetters(),
    getApplications(),
    getLearnedFields(),
  ]);

  return (
    (profile !== null && profile.personal.email.trim() !== '') ||
    coverLetters.length > 0 ||
    applications.length > 0 ||
    Object.keys(learnedFields).length > 0
  );
}

function stripApiKeyFromSettings(settings: AppSettings): AppSettings {
  return { ...settings, apiKey: null };
}

export function backupPayloadToSavedProfilePartial(
  payload: BackupPayload,
): Partial<SavedProfile> {
  return {
    profile: payload.profile,
    coverLetters: payload.coverLetters,
    applications: payload.applications,
    learnedFields: payload.learnedFields,
    settings: stripApiKeyFromSettings(payload.settings),
    jobPreferences: DEFAULT_JOB_PREFERENCES,
    lastFillResult: null,
  };
}

export async function applyBackupImport(
  payload: BackupPayload,
  mode: ImportMode,
): Promise<void> {
  const importedSettings = stripApiKeyFromSettings(payload.settings);

  if (mode === 'replace') {
    await chrome.storage.local.set({
      profile: payload.profile,
      coverLetters: payload.coverLetters,
      applications: payload.applications,
      learnedFields: normalizeLearnedFieldsStorage(payload.learnedFields),
      settings: importedSettings,
    });
    return;
  }

  const [
    existingProfile,
    existingCoverLetters,
    existingApplications,
    existingSettings,
    localDataTimestamp,
  ] = await Promise.all([
    getProfile(),
    getCoverLetters(),
    getApplications(),
    getSettings(),
    getLocalDataTimestamp(),
  ]);

  await chrome.storage.local.set({
    profile: mergeProfile(
      existingProfile,
      payload.profile,
      payload.exportedAt,
      localDataTimestamp,
    ),
    coverLetters: mergeCoverLetters(existingCoverLetters, payload.coverLetters),
    applications: mergeApplications(existingApplications, payload.applications),
    settings: existingSettings,
  });

  await importLearnedFields(payload.learnedFields);
}
