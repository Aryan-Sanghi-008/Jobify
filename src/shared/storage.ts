import {
  checkStorageSize,
  containsForbiddenCredentials,
  sanitizeJobApplication,
  sanitizeProfile,
  sanitizeStorageData,
  sanitizeString,
  validateProfile,
} from './security';
import type {
  AppSettings,
  CoverLetterTemplate,
  FlatProfile,
  JobApplication,
  LearnedField,
  SerializableFillResult,
  StorageSchema,
  UserProfile,
} from './types';
import { hashString } from './utils';

export const DEFAULT_SETTINGS: AppSettings = {
  autoFillOnLoad: false,
  pauseBeforeSubmit: true,
  highlightUnknownFields: true,
  defaultCoverLetterId: null,
  theme: 'system',
  debugMode: false,
};

export const DEFAULT_PROFILE: UserProfile = {
  personal: {
    fullName: '',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    city: '',
    state: '',
    country: '',
    linkedinUrl: '',
    githubUrl: '',
    portfolioUrl: '',
    twitterUrl: '',
  },
  professional: {
    currentTitle: '',
    currentCompany: '',
    totalYearsExp: 0,
    noticePeriod: 0,
    currentCTC: 0,
    expectedCTC: 0,
    workAuthorization: '',
    willingToRelocate: false,
    preferredLocations: [],
  },
  education: [],
  experience: [],
  skills: [],
  languages: [],
};

function logStorageError(operation: string, error: unknown): void {
  console.error('[JobAutofill Storage]', operation, error);
}

async function storageGet<K extends keyof StorageSchema>(
  key: K,
): Promise<StorageSchema[K] | undefined> {
  try {
    const result = await chrome.storage.local.get(key);
    return result[key] as StorageSchema[K] | undefined;
  } catch (error) {
    logStorageError(`storageGet(${key})`, error);
    throw error;
  }
}

async function warnIfStorageNearLimit(): Promise<void> {
  const { bytesInUse, exceedsWarningThreshold } = await checkStorageSize();

  if (exceedsWarningThreshold) {
    console.warn(
      `[JobAutofill Storage] Storage usage is ${bytesInUse} bytes (>= 4MB). ` +
        'Consider exporting and clearing old data before hitting the 5MB limit.',
    );
  }
}

async function storageSet(partial: Partial<StorageSchema>): Promise<void> {
  try {
    if (containsForbiddenCredentials(partial)) {
      throw new Error('Cannot store passwords or auth tokens');
    }

    const sanitized = sanitizeStorageData(partial);
    await chrome.storage.local.set(sanitized);
    await warnIfStorageNearLimit();
  } catch (error) {
    logStorageError('storageSet', error);
    throw error;
  }
}

export function flattenProfile(profile: UserProfile): FlatProfile {
  const { personal, professional, education, experience, skills, languages } =
    profile;
  const edu = education[0];
  const exp = experience[0];

  return {
    fullName: personal.fullName,
    firstName: personal.firstName,
    lastName: personal.lastName,
    email: personal.email,
    phone: personal.phone,
    city: personal.city,
    state: personal.state,
    country: personal.country,
    linkedinUrl: personal.linkedinUrl,
    githubUrl: personal.githubUrl,
    portfolioUrl: personal.portfolioUrl,
    twitterUrl: personal.twitterUrl,
    currentTitle: professional.currentTitle,
    currentCompany: professional.currentCompany,
    totalYearsExp: professional.totalYearsExp,
    noticePeriod: professional.noticePeriod,
    currentCTC: professional.currentCTC,
    expectedCTC: professional.expectedCTC,
    workAuthorization: professional.workAuthorization,
    willingToRelocate: professional.willingToRelocate,
    preferredLocations: professional.preferredLocations.join(', '),
    skills: skills.join(', '),
    languages: languages.join(', '),
    degree: edu?.degree ?? '',
    field: edu?.field ?? '',
    institution: edu?.institution ?? '',
    graduationYear: edu?.graduationYear ?? 0,
    percentage: edu?.percentage ?? '',
    title: exp?.title ?? '',
    company: exp?.company ?? '',
    startDate: exp?.startDate ?? '',
    endDate: exp?.endDate ?? '',
    current: exp?.current ?? false,
    description: exp?.description ?? '',
  };
}

export async function getProfile(): Promise<UserProfile | null> {
  try {
    const profile = await storageGet('profile');
    return profile ?? null;
  } catch (error) {
    logStorageError('getProfile', error);
    throw error;
  }
}

export async function saveProfile(profile: UserProfile): Promise<void> {
  try {
    if (containsForbiddenCredentials(profile)) {
      throw new Error('Cannot store passwords or auth tokens');
    }

    const validation = validateProfile(profile);
    if (!validation.valid) {
      throw new Error('Invalid profile data');
    }

    await storageSet({ profile: sanitizeProfile(profile) });
  } catch (error) {
    logStorageError('saveProfile', error);
    throw error;
  }
}

export async function getCoverLetters(): Promise<CoverLetterTemplate[]> {
  try {
    const coverLetters = await storageGet('coverLetters');
    return coverLetters ?? [];
  } catch (error) {
    logStorageError('getCoverLetters', error);
    throw error;
  }
}

export async function saveCoverLetter(
  template: CoverLetterTemplate,
): Promise<void> {
  try {
    const existing = await getCoverLetters();
    const index = existing.findIndex((item) => item.id === template.id);
    const updated =
      index >= 0
        ? existing.map((item, i) => (i === index ? template : item))
        : [...existing, template];
    await storageSet({ coverLetters: updated });
  } catch (error) {
    logStorageError('saveCoverLetter', error);
    throw error;
  }
}

export async function deleteCoverLetter(id: string): Promise<void> {
  try {
    const existing = await getCoverLetters();
    await storageSet({
      coverLetters: existing.filter((item) => item.id !== id),
    });
  } catch (error) {
    logStorageError('deleteCoverLetter', error);
    throw error;
  }
}

export async function getApplications(): Promise<JobApplication[]> {
  try {
    const applications = await storageGet('applications');
    return applications ?? [];
  } catch (error) {
    logStorageError('getApplications', error);
    throw error;
  }
}

const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000;

export function normalizeApplicationKey(company: string, role: string): string {
  return `${company.trim().toLowerCase()}::${role.trim().toLowerCase()}`;
}

export async function hasRecentApplication(
  company: string,
  role: string,
  withinMs = DEDUP_WINDOW_MS,
): Promise<boolean> {
  const targetKey = normalizeApplicationKey(company, role);
  const cutoff = Date.now() - withinMs;
  const applications = await getApplications();

  return applications.some((application) => {
    if (application.appliedAt < cutoff) {
      return false;
    }

    return (
      normalizeApplicationKey(application.company, application.role) === targetKey
    );
  });
}

export async function logApplication(app: JobApplication): Promise<void> {
  try {
    const existing = await getApplications();
    await storageSet({
      applications: [...existing, sanitizeJobApplication(app)],
    });
  } catch (error) {
    logStorageError('logApplication', error);
    throw error;
  }
}

export async function updateApplicationStatus(
  id: string,
  status: JobApplication['status'],
): Promise<void> {
  try {
    const existing = await getApplications();
    const updated = existing.map((app) =>
      app.id === id ? { ...app, status } : app,
    );
    await storageSet({ applications: updated });
  } catch (error) {
    logStorageError('updateApplicationStatus', error);
    throw error;
  }
}

export async function updateApplicationNotes(
  id: string,
  notes: string,
): Promise<void> {
  try {
    const existing = await getApplications();
    const updated = existing.map((app) =>
      app.id === id ? { ...app, notes } : app,
    );
    await storageSet({ applications: updated });
  } catch (error) {
    logStorageError('updateApplicationNotes', error);
    throw error;
  }
}

function isLearnedField(value: unknown): value is LearnedField {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.value === 'string' &&
    typeof record.normalizedLabel === 'string' &&
    typeof record.learnedAt === 'number' &&
    typeof record.timesUsed === 'number' &&
    Array.isArray(record.sites) &&
    record.sites.every((site) => typeof site === 'string')
  );
}

export function normalizeLearnedFieldsStorage(
  raw: Record<string, unknown> | undefined,
): Record<string, LearnedField> {
  if (!raw) {
    return {};
  }

  const normalized: Record<string, LearnedField> = {};

  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') {
      normalized[key] = {
        value,
        normalizedLabel: '',
        learnedAt: 0,
        timesUsed: 0,
        sites: [],
      };
      continue;
    }

    if (isLearnedField(value)) {
      normalized[key] = value;
    }
  }

  return normalized;
}

export function getUniqueLearnedEntries(
  map: Record<string, LearnedField>,
): LearnedField[] {
  const seen = new Set<string>();
  const unique: LearnedField[] = [];

  for (const [key, entry] of Object.entries(map)) {
    const dedupeKey = entry.normalizedLabel
      ? hashString(entry.normalizedLabel)
      : key;

    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    unique.push(entry);
  }

  return unique;
}

function parseSiteHostname(site?: string): string | undefined {
  if (!site?.trim()) {
    return undefined;
  }

  try {
    return new URL(site).hostname;
  } catch {
    return site.trim();
  }
}

function writeLearnedEntry(
  map: Record<string, LearnedField>,
  labelHash: string,
  normalizedLabel: string,
  entry: LearnedField,
): Record<string, LearnedField> {
  const next = { ...map, [labelHash]: entry };

  if (normalizedLabel) {
    next[normalizedLabel] = entry;
  }

  return next;
}

export async function getLearnedFields(): Promise<Record<string, LearnedField>> {
  try {
    const learnedFields = await storageGet('learnedFields');
    return normalizeLearnedFieldsStorage(
      learnedFields as Record<string, unknown> | undefined,
    );
  } catch (error) {
    logStorageError('getLearnedFields', error);
    throw error;
  }
}

export async function learnField(
  labelHash: string,
  value: string,
  normalizedLabel: string,
  site?: string,
): Promise<void> {
  try {
    const existing = await getLearnedFields();
    const hostname = parseSiteHostname(site);
    const previous =
      existing[labelHash] ?? (normalizedLabel ? existing[normalizedLabel] : undefined);

    const entry: LearnedField = {
      value: sanitizeString(value),
      normalizedLabel: sanitizeString(normalizedLabel),
      learnedAt: previous?.learnedAt ?? Date.now(),
      timesUsed: previous?.timesUsed ?? 0,
      sites: [...(previous?.sites ?? [])],
    };

    if (hostname && !entry.sites.includes(hostname)) {
      entry.sites.push(hostname);
    }

    await storageSet({
      learnedFields: writeLearnedEntry(existing, labelHash, normalizedLabel, entry),
    });
  } catch (error) {
    logStorageError('learnField', error);
    throw error;
  }
}

export async function recordLearnedFieldUse(
  labelHash: string,
  site?: string,
): Promise<void> {
  try {
    const existing = await getLearnedFields();
    const entry = existing[labelHash];

    if (!entry) {
      return;
    }

    const hostname = parseSiteHostname(site);
    const updated: LearnedField = {
      ...entry,
      timesUsed: entry.timesUsed + 1,
      sites: [...entry.sites],
    };

    if (hostname && !updated.sites.includes(hostname)) {
      updated.sites.push(hostname);
    }

    await storageSet({
      learnedFields: writeLearnedEntry(
        existing,
        labelHash,
        entry.normalizedLabel,
        updated,
      ),
    });
  } catch (error) {
    logStorageError('recordLearnedFieldUse', error);
  }
}

export async function getLearnedFieldStats(): Promise<{
  totalLearned: number;
  mostUsed: { label: string; count: number }[];
}> {
  const map = await getLearnedFields();
  const unique = getUniqueLearnedEntries(map);

  const mostUsed = unique
    .map((entry) => ({
      label: entry.normalizedLabel || entry.value,
      count: entry.timesUsed,
    }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 5);

  return {
    totalLearned: unique.length,
    mostUsed,
  };
}

export async function exportLearnedFields(): Promise<Record<string, LearnedField>> {
  const map = await getLearnedFields();
  const exported: Record<string, LearnedField> = {};

  for (const entry of getUniqueLearnedEntries(map)) {
    const key = entry.normalizedLabel
      ? hashString(entry.normalizedLabel)
      : Object.keys(map).find((mapKey) => map[mapKey] === entry) ?? hashString(entry.value);

    exported[key] = entry;
  }

  return exported;
}

export async function importLearnedFields(
  data: Record<string, LearnedField>,
): Promise<void> {
  const existing = await getLearnedFields();
  let merged = { ...existing };

  for (const entry of Object.values(data)) {
    if (!isLearnedField(entry)) {
      continue;
    }

    const labelHash = entry.normalizedLabel
      ? hashString(entry.normalizedLabel)
      : Object.keys(data).find((key) => data[key] === entry) ?? hashString(entry.value);

    merged = writeLearnedEntry(merged, labelHash, entry.normalizedLabel, entry);
  }

  await storageSet({ learnedFields: merged });
}

export async function getSettings(): Promise<AppSettings> {
  try {
    const settings = await storageGet('settings');
    return { ...DEFAULT_SETTINGS, ...settings };
  } catch (error) {
    logStorageError('getSettings', error);
    throw error;
  }
}

export async function saveSettings(settings: Partial<AppSettings>): Promise<void> {
  try {
    const current = await getSettings();
    await storageSet({ settings: { ...current, ...settings } });
  } catch (error) {
    logStorageError('saveSettings', error);
    throw error;
  }
}

export async function getLastFillResult(): Promise<SerializableFillResult | null> {
  try {
    const result = await storageGet('lastFillResult');
    return result ?? null;
  } catch (error) {
    logStorageError('getLastFillResult', error);
    throw error;
  }
}

export async function saveLastFillResult(
  result: SerializableFillResult,
): Promise<void> {
  try {
    await storageSet({ lastFillResult: sanitizeStorageData(result) });
  } catch (error) {
    logStorageError('saveLastFillResult', error);
    throw error;
  }
}

export async function clearAllData(): Promise<void> {
  try {
    await chrome.storage.local.clear();
  } catch (error) {
    logStorageError('clearAllData', error);
    throw error;
  }
}
