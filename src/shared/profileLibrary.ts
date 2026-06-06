import {
  backupPayloadToSavedProfilePartial,
  isAppSettings,
  isCoverLetterTemplate,
  isJobApplication,
  isLearnedField,
  isUserProfile,
  parseBackupFile,
} from './backup';
import {
  DEFAULT_JOB_PREFERENCES,
  DEFAULT_SETTINGS,
  normalizeLearnedFieldsStorage,
} from './storage';
import type {
  AppSettings,
  CoverLetterTemplate,
  JobApplication,
  JobPreferences,
  LearnedField,
  ProfileImportPreview,
  SavedProfile,
  SavedProfileSummary,
  SerializableFillResult,
  UserProfile,
} from './types';
import { generateId } from './utils';

const ACTIVE_PROFILE_KEYS = [
  'profile',
  'coverLetters',
  'applications',
  'learnedFields',
  'jobPreferences',
  'settings',
  'lastFillResult',
] as const;

export interface SavedProfileExport {
  name: string;
  exportedAt: number;
  profile: UserProfile | null;
  coverLetters: CoverLetterTemplate[];
  applications: JobApplication[];
  learnedFields: Record<string, LearnedField>;
  jobPreferences: JobPreferences;
  settings: AppSettings;
  lastFillResult: SerializableFillResult | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isJobPreferences(value: unknown): value is JobPreferences {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.desiredRole === 'string' &&
    Array.isArray(value.preferredLocations) &&
    (value.minSalary === null || typeof value.minSalary === 'number') &&
    (value.adzunaAppId === null || typeof value.adzunaAppId === 'string') &&
    (value.adzunaAppKey === null || typeof value.adzunaAppKey === 'string') &&
    typeof value.adzunaCountry === 'string'
  );
}

function isSerializableFillResult(value: unknown): value is SerializableFillResult {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.filled === 'number' &&
    typeof value.skipped === 'number' &&
    Array.isArray(value.unknown) &&
    value.unknown.every((item) => typeof item === 'string') &&
    Array.isArray(value.errors) &&
    value.errors.every((item) => typeof item === 'string')
  );
}

function stripApiKeyFromSettings(settings: AppSettings): AppSettings {
  return { ...settings, apiKey: null };
}

export function inferProfileName(
  profile: UserProfile | null | undefined,
  explicitName?: string,
): string {
  const trimmed = explicitName?.trim();
  if (trimmed) {
    return trimmed;
  }

  const fullName = profile?.personal.fullName.trim();
  if (fullName) {
    return fullName;
  }

  const email = profile?.personal.email.trim();
  if (email) {
    const localPart = email.split('@')[0]?.trim();
    if (localPart) {
      return localPart;
    }
  }

  return 'Imported profile';
}

function hasImportableContent(partial: Partial<SavedProfile>): boolean {
  return (
    partial.profile !== undefined ||
    partial.settings !== undefined ||
    (partial.coverLetters?.length ?? 0) > 0 ||
    (partial.applications?.length ?? 0) > 0 ||
    Object.keys(partial.learnedFields ?? {}).length > 0 ||
    partial.jobPreferences !== undefined ||
    partial.lastFillResult !== undefined
  );
}

export function parseFlexibleProfileImport(
  data: unknown,
): Partial<SavedProfile> | null {
  if (!isRecord(data)) {
    return null;
  }

  const backupPayload = parseBackupFile(data);
  if (backupPayload) {
    return backupPayloadToSavedProfilePartial(backupPayload);
  }

  if (isUserProfile(data)) {
    return { profile: data };
  }

  const partial: Partial<SavedProfile> = {};

  if ('name' in data && typeof data.name === 'string') {
    partial.name = data.name.trim();
  }

  if ('profile' in data) {
    if (data.profile === null || isUserProfile(data.profile)) {
      partial.profile = data.profile;
    } else {
      return null;
    }
  }

  if ('settings' in data) {
    if (!isAppSettings(data.settings)) {
      return null;
    }
    partial.settings = stripApiKeyFromSettings(data.settings);
  }

  if ('coverLetters' in data) {
    if (
      !Array.isArray(data.coverLetters) ||
      !data.coverLetters.every((item) => isCoverLetterTemplate(item))
    ) {
      return null;
    }
    partial.coverLetters = data.coverLetters;
  }

  if ('applications' in data) {
    if (
      !Array.isArray(data.applications) ||
      !data.applications.every((item) => isJobApplication(item))
    ) {
      return null;
    }
    partial.applications = data.applications;
  }

  if ('learnedFields' in data) {
    if (!isRecord(data.learnedFields)) {
      return null;
    }
    partial.learnedFields = normalizeLearnedFieldsStorage(data.learnedFields);
  }

  if ('jobPreferences' in data) {
    if (!isJobPreferences(data.jobPreferences)) {
      return null;
    }
    partial.jobPreferences = data.jobPreferences;
  }

  if ('lastFillResult' in data) {
    if (data.lastFillResult !== null && !isSerializableFillResult(data.lastFillResult)) {
      return null;
    }
    partial.lastFillResult = data.lastFillResult as SerializableFillResult | null;
  }

  return hasImportableContent(partial) ? partial : null;
}

export function getProfileImportPreview(
  partial: Partial<SavedProfile>,
): ProfileImportPreview {
  const uniqueLearned = new Set(
    Object.values(partial.learnedFields ?? {}).map(
      (field) => field.normalizedLabel || field.value,
    ),
  );

  return {
    name: inferProfileName(partial.profile, partial.name),
    hasProfile:
      partial.profile !== undefined &&
      partial.profile !== null &&
      partial.profile.personal.email.trim() !== '',
    coverLetterCount: partial.coverLetters?.length ?? 0,
    applicationCount: partial.applications?.length ?? 0,
    learnedFieldCount: uniqueLearned.size,
    hasSettings: partial.settings !== undefined,
    hasJobPreferences: partial.jobPreferences !== undefined,
    hasLastFillResult: partial.lastFillResult !== undefined,
  };
}

function normalizeDefaultCoverLetterId(
  settings: AppSettings,
  coverLetters: CoverLetterTemplate[],
): AppSettings {
  if (
    settings.defaultCoverLetterId &&
    coverLetters.some((letter) => letter.id === settings.defaultCoverLetterId)
  ) {
    return settings;
  }

  return {
    ...settings,
    defaultCoverLetterId: coverLetters[0]?.id ?? null,
  };
}

function buildSavedProfile(
  partial: Partial<SavedProfile>,
  name: string,
): SavedProfile {
  const now = Date.now();

  return {
    id: generateId(),
    name,
    createdAt: now,
    updatedAt: now,
    profile: partial.profile ?? null,
    coverLetters: partial.coverLetters ?? [],
    applications: partial.applications ?? [],
    learnedFields: partial.learnedFields ?? {},
    jobPreferences: partial.jobPreferences ?? DEFAULT_JOB_PREFERENCES,
    settings: normalizeDefaultCoverLetterId(
      partial.settings ?? DEFAULT_SETTINGS,
      partial.coverLetters ?? [],
    ),
    lastFillResult: partial.lastFillResult ?? null,
  };
}

async function readLibraryState(): Promise<{
  savedProfiles: SavedProfile[];
  activeProfileId: string | null;
}> {
  const result = await chrome.storage.local.get(['savedProfiles', 'activeProfileId']);

  return {
    savedProfiles: (result.savedProfiles as SavedProfile[] | undefined) ?? [],
    activeProfileId: (result.activeProfileId as string | null | undefined) ?? null,
  };
}

async function readActiveState(): Promise<{
  profile: UserProfile | null;
  coverLetters: CoverLetterTemplate[];
  applications: JobApplication[];
  learnedFields: Record<string, LearnedField>;
  jobPreferences: JobPreferences;
  settings: AppSettings;
  lastFillResult: SerializableFillResult | null;
}> {
  const result = await chrome.storage.local.get(ACTIVE_PROFILE_KEYS);

  return {
    profile: (result.profile as UserProfile | null | undefined) ?? null,
    coverLetters: (result.coverLetters as CoverLetterTemplate[] | undefined) ?? [],
    applications: (result.applications as JobApplication[] | undefined) ?? [],
    learnedFields: normalizeLearnedFieldsStorage(
      result.learnedFields as Record<string, unknown> | undefined,
    ),
    jobPreferences: {
      ...DEFAULT_JOB_PREFERENCES,
      ...(result.jobPreferences as JobPreferences | undefined),
    },
    settings: {
      ...DEFAULT_SETTINGS,
      ...(result.settings as AppSettings | undefined),
    },
    lastFillResult:
      (result.lastFillResult as SerializableFillResult | null | undefined) ?? null,
  };
}

function activeStateToSavedProfileFields(
  state: Awaited<ReturnType<typeof readActiveState>>,
): Omit<SavedProfile, 'id' | 'name' | 'createdAt' | 'updatedAt'> {
  return {
    profile: state.profile,
    coverLetters: state.coverLetters,
    applications: state.applications,
    learnedFields: state.learnedFields,
    jobPreferences: state.jobPreferences,
    settings: stripApiKeyFromSettings(state.settings),
    lastFillResult: state.lastFillResult,
  };
}

export async function snapshotActiveToLibrary(): Promise<void> {
  const { savedProfiles, activeProfileId } = await readLibraryState();

  if (!activeProfileId) {
    return;
  }

  const index = savedProfiles.findIndex((profile) => profile.id === activeProfileId);
  if (index < 0) {
    return;
  }

  const active = await readActiveState();
  const updated: SavedProfile = {
    ...savedProfiles[index],
    ...activeStateToSavedProfileFields(active),
    updatedAt: Date.now(),
  };

  const nextProfiles = [...savedProfiles];
  nextProfiles[index] = updated;

  await chrome.storage.local.set({ savedProfiles: nextProfiles });
}

export async function syncActiveToLibrary(): Promise<void> {
  await snapshotActiveToLibrary();
}

export async function ensureProfileLibrary(): Promise<void> {
  const { savedProfiles, activeProfileId } = await readLibraryState();

  if (savedProfiles.length > 0) {
    if (!activeProfileId || !savedProfiles.some((profile) => profile.id === activeProfileId)) {
      await chrome.storage.local.set({ activeProfileId: savedProfiles[0].id });
    }
    return;
  }

  const active = await readActiveState();
  const hasData =
    (active.profile !== null && active.profile.personal.email.trim() !== '') ||
    active.coverLetters.length > 0 ||
    active.applications.length > 0 ||
    Object.keys(active.learnedFields).length > 0;

  const defaultProfile = buildSavedProfile(
    activeStateToSavedProfileFields(active),
    hasData ? 'Default' : 'Profile 1',
  );

  await chrome.storage.local.set({
    savedProfiles: [defaultProfile],
    activeProfileId: defaultProfile.id,
  });
}

export async function listSavedProfiles(): Promise<SavedProfileSummary[]> {
  const { savedProfiles, activeProfileId } = await readLibraryState();

  return savedProfiles.map((profile) => ({
    id: profile.id,
    name: profile.name,
    email: profile.profile?.personal.email.trim() ?? '',
    updatedAt: profile.updatedAt,
    isActive: profile.id === activeProfileId,
  }));
}

async function writeSavedProfileToActiveStorage(savedProfile: SavedProfile): Promise<void> {
  const current = await readActiveState();
  const mergedSettings = normalizeDefaultCoverLetterId(
    {
      ...savedProfile.settings,
      apiKey: current.settings.apiKey,
      aiProvider: current.settings.aiProvider,
    },
    savedProfile.coverLetters,
  );

  await chrome.storage.local.set({
    activeProfileId: savedProfile.id,
    profile: savedProfile.profile,
    coverLetters: savedProfile.coverLetters,
    applications: savedProfile.applications,
    learnedFields: normalizeLearnedFieldsStorage(savedProfile.learnedFields),
    jobPreferences: savedProfile.jobPreferences,
    settings: mergedSettings,
    lastFillResult: savedProfile.lastFillResult,
  });
}

export async function applySavedProfile(id: string): Promise<void> {
  const { savedProfiles, activeProfileId } = await readLibraryState();
  const target = savedProfiles.find((profile) => profile.id === id);

  if (!target) {
    throw new Error('Saved profile not found');
  }

  if (target.id === activeProfileId) {
    return;
  }

  await snapshotActiveToLibrary();
  await writeSavedProfileToActiveStorage(target);
}

export async function createProfileFromImport(
  partial: Partial<SavedProfile>,
  options?: { name?: string; activate?: boolean },
): Promise<SavedProfile> {
  const name = inferProfileName(partial.profile, options?.name ?? partial.name);
  const created = buildSavedProfile(partial, name);
  const { savedProfiles } = await readLibraryState();

  await chrome.storage.local.set({
    savedProfiles: [...savedProfiles, created],
  });

  if (options?.activate) {
    await applySavedProfile(created.id);
  }

  return created;
}

export async function replaceActiveProfileFromImport(
  partial: Partial<SavedProfile>,
  name?: string,
): Promise<SavedProfile> {
  await snapshotActiveToLibrary();

  const { savedProfiles, activeProfileId } = await readLibraryState();
  const index = savedProfiles.findIndex((profile) => profile.id === activeProfileId);

  if (index < 0) {
    return createProfileFromImport(partial, { name, activate: true });
  }

  const existing = savedProfiles[index];
  const merged: SavedProfile = {
    ...existing,
    name: name?.trim() || inferProfileName(partial.profile, partial.name) || existing.name,
    profile: partial.profile ?? existing.profile,
    coverLetters: partial.coverLetters ?? existing.coverLetters,
    applications: partial.applications ?? existing.applications,
    learnedFields: partial.learnedFields ?? existing.learnedFields,
    jobPreferences: partial.jobPreferences ?? existing.jobPreferences,
    settings: normalizeDefaultCoverLetterId(
      partial.settings ?? existing.settings,
      partial.coverLetters ?? existing.coverLetters,
    ),
    lastFillResult: partial.lastFillResult ?? existing.lastFillResult,
    updatedAt: Date.now(),
  };

  const nextProfiles = [...savedProfiles];
  nextProfiles[index] = merged;

  await chrome.storage.local.set({ savedProfiles: nextProfiles });
  await writeSavedProfileToActiveStorage(merged);

  return merged;
}

export async function saveCurrentAsNewProfile(name: string): Promise<SavedProfile> {
  await snapshotActiveToLibrary();
  const active = await readActiveState();

  return createProfileFromImport(
    {
      ...activeStateToSavedProfileFields(active),
      name,
    },
    { name, activate: false },
  );
}

export async function renameSavedProfile(id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('Profile name is required');
  }

  const { savedProfiles } = await readLibraryState();
  const index = savedProfiles.findIndex((profile) => profile.id === id);

  if (index < 0) {
    throw new Error('Saved profile not found');
  }

  const nextProfiles = [...savedProfiles];
  nextProfiles[index] = {
    ...nextProfiles[index],
    name: trimmed,
    updatedAt: Date.now(),
  };

  await chrome.storage.local.set({ savedProfiles: nextProfiles });
}

export async function deleteSavedProfile(id: string): Promise<void> {
  const { savedProfiles, activeProfileId } = await readLibraryState();

  if (savedProfiles.length <= 1) {
    throw new Error('Cannot delete the last saved profile');
  }

  const index = savedProfiles.findIndex((profile) => profile.id === id);
  if (index < 0) {
    throw new Error('Saved profile not found');
  }

  const nextProfiles = savedProfiles.filter((profile) => profile.id !== id);

  if (id === activeProfileId) {
    const fallback = nextProfiles[0];
    await chrome.storage.local.set({ savedProfiles: nextProfiles });
    await applySavedProfile(fallback.id);
    return;
  }

  await chrome.storage.local.set({ savedProfiles: nextProfiles });
}

export async function exportSavedProfilePayload(
  id: string,
): Promise<SavedProfileExport> {
  const { savedProfiles } = await readLibraryState();
  const profile = savedProfiles.find((entry) => entry.id === id);

  if (!profile) {
    throw new Error('Saved profile not found');
  }

  return {
    name: profile.name,
    exportedAt: Date.now(),
    profile: profile.profile,
    coverLetters: profile.coverLetters,
    applications: profile.applications,
    learnedFields: profile.learnedFields,
    jobPreferences: profile.jobPreferences,
    settings: stripApiKeyFromSettings(profile.settings),
    lastFillResult: profile.lastFillResult,
  };
}
