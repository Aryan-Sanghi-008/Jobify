import { VERSION } from '@/shared/constants';
import {
  getApplications,
  getCoverLetters,
  getLastFillResult,
  getLearnedFieldStats,
  getProfile,
  getSettings,
} from '@/shared/storage';
import type {
  SerializableFillResult,
  UserProfile,
} from '@/shared/types';

const SENSITIVE_VALUE_KEYS = new Set([
  'email',
  'phone',
  'fullName',
  'firstName',
  'lastName',
  'currentCTC',
  'expectedCTC',
  'body',
  'notes',
  'coverLetterUsed',
  'linkedinUrl',
  'githubUrl',
  'portfolioUrl',
  'twitterUrl',
  'description',
  'value',
  'password',
  'token',
  'secret',
]);

export interface ProfileCompleteness {
  percent: number;
  filledFieldCount: number;
  totalFieldCount: number;
  filledKeys: string[];
}

export interface DiagnosticReport {
  extensionVersion: string;
  chromeVersion: string;
  userAgent: string;
  generatedAt: string;
  profileCompleteness: ProfileCompleteness;
  coverLetterTemplateCount: number;
  applicationCount: number;
  learnedFieldCount: number;
  portalDetection: {
    portal: string;
    hasCompany: boolean;
    hasJobTitle: boolean;
  } | null;
  lastFillResult: SerializableFillResult | null;
  debugMode: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function isFilledNumber(value: unknown): boolean {
  return typeof value === 'number' && !Number.isNaN(value) && value > 0;
}

export function getFilledProfileKeys(profile: UserProfile): string[] {
  const filledKeys: string[] = [];
  const { personal, professional, education, experience, skills, languages } =
    profile;

  for (const [key, value] of Object.entries(personal)) {
    if (isNonEmptyString(value)) {
      filledKeys.push(`personal.${key}`);
    }
  }

  for (const [key, value] of Object.entries(professional)) {
    if (key === 'willingToRelocate') {
      filledKeys.push(`professional.${key}`);
      continue;
    }

    if (key === 'preferredLocations' && Array.isArray(value) && value.length > 0) {
      filledKeys.push(`professional.${key}`);
      continue;
    }

    if (typeof value === 'number' && isFilledNumber(value)) {
      filledKeys.push(`professional.${key}`);
      continue;
    }

    if (isNonEmptyString(value)) {
      filledKeys.push(`professional.${key}`);
    }
  }

  education.forEach((entry, index) => {
    for (const [key, value] of Object.entries(entry)) {
      if (key === 'graduationYear' && isFilledNumber(value)) {
        filledKeys.push(`education.${index}.${key}`);
      } else if (isNonEmptyString(value)) {
        filledKeys.push(`education.${index}.${key}`);
      }
    }
  });

  experience.forEach((entry, index) => {
    for (const [key, value] of Object.entries(entry)) {
      if (key === 'current') {
        if (value) {
          filledKeys.push(`experience.${index}.${key}`);
        }
        continue;
      }

      if (isNonEmptyString(value)) {
        filledKeys.push(`experience.${index}.${key}`);
      }
    }
  });

  if (skills.length > 0) {
    filledKeys.push('skills');
  }

  if (languages.length > 0) {
    filledKeys.push('languages');
  }

  return filledKeys;
}

export function getProfileCompleteness(
  profile: UserProfile | null,
): ProfileCompleteness {
  if (!profile) {
    return {
      percent: 0,
      filledFieldCount: 0,
      totalFieldCount: 0,
      filledKeys: [],
    };
  }

  const totalFieldCount =
    Object.keys(profile.personal).length +
    Object.keys(profile.professional).length +
    profile.education.length * 5 +
    profile.experience.length * 6 +
    2;

  const filledKeys = getFilledProfileKeys(profile);
  const filledFieldCount = filledKeys.length;
  const percent =
    totalFieldCount === 0
      ? 0
      : Math.min(100, Math.round((filledFieldCount / totalFieldCount) * 100));

  return {
    percent,
    filledFieldCount,
    totalFieldCount,
    filledKeys,
  };
}

function anonymizeLogData(data: unknown, parentKey = ''): unknown {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'string') {
    if (SENSITIVE_VALUE_KEYS.has(parentKey)) {
      return '[redacted]';
    }
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => anonymizeLogData(item, parentKey));
  }

  if (!isRecord(data)) {
    return data;
  }

  if ('personal' in data && 'professional' in data) {
    const profile = data as unknown as UserProfile;
    return {
      filledKeys: getFilledProfileKeys(profile),
      completeness: getProfileCompleteness(profile).percent,
    };
  }

  const anonymized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_VALUE_KEYS.has(key)) {
      anonymized[key] = '[redacted]';
      continue;
    }

    anonymized[key] = anonymizeLogData(value, key);
  }

  return anonymized;
}

export function parseChromeVersion(userAgent: string): string {
  const match = userAgent.match(/Chrome\/([\d.]+)/);
  return match?.[1] ?? 'unknown';
}

function formatPrefix(module: string): string {
  return `[JobAutofill:${module}]`;
}

export class Logger {
  private static debugModeEnabled = false;

  static setDebugMode(enabled: boolean): void {
    Logger.debugModeEnabled = enabled;
  }

  static async refreshDebugMode(): Promise<void> {
    const settings = await getSettings();
    Logger.debugModeEnabled = settings.debugMode;
  }

  static debug(module: string, message: string, data?: unknown): void {
    if (!Logger.debugModeEnabled) {
      return;
    }

    if (data === undefined) {
      console.log(formatPrefix(module), message);
      return;
    }

    console.log(formatPrefix(module), message, anonymizeLogData(data));
  }

  static info(module: string, message: string, data?: unknown): void {
    if (!Logger.debugModeEnabled) {
      return;
    }

    if (data === undefined) {
      console.info(formatPrefix(module), message);
      return;
    }

    console.info(formatPrefix(module), message, anonymizeLogData(data));
  }

  static warn(module: string, message: string, data?: unknown): void {
    if (!Logger.debugModeEnabled) {
      return;
    }

    if (data === undefined) {
      console.warn(formatPrefix(module), message);
      return;
    }

    console.warn(formatPrefix(module), message, anonymizeLogData(data));
  }

  static error(module: string, message: string, error?: Error): void {
    if (error) {
      console.error(formatPrefix(module), message, error.message);
      return;
    }

    console.error(formatPrefix(module), message);
  }
}

function anonymizeFillResult(
  result: SerializableFillResult | null,
): SerializableFillResult | null {
  if (!result) {
    return null;
  }

  return {
    filled: result.filled,
    skipped: result.skipped,
    unknown: result.unknown.map((label) => label.trim()).filter(Boolean),
    errors: result.errors,
  };
}

async function getActiveTabPortalDetection(): Promise<DiagnosticReport['portalDetection']> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id) {
    return null;
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_INFO' });

    if (!isRecord(response)) {
      return null;
    }

    return {
      portal: typeof response.portal === 'string' ? response.portal : 'generic',
      hasCompany: isNonEmptyString(response.company),
      hasJobTitle: isNonEmptyString(response.jobTitle),
    };
  } catch {
    return null;
  }
}

export async function generateDiagnosticReport(): Promise<string> {
  const [
    profile,
    coverLetters,
    applications,
    learnedStats,
    lastFillResult,
    settings,
    portalDetection,
  ] = await Promise.all([
    getProfile(),
    getCoverLetters(),
    getApplications(),
    getLearnedFieldStats(),
    getLastFillResult(),
    getSettings(),
    getActiveTabPortalDetection(),
  ]);

  const report: DiagnosticReport = {
    extensionVersion: VERSION,
    chromeVersion: parseChromeVersion(navigator.userAgent),
    userAgent: navigator.userAgent,
    generatedAt: new Date().toISOString(),
    profileCompleteness: getProfileCompleteness(profile),
    coverLetterTemplateCount: coverLetters.length,
    applicationCount: applications.length,
    learnedFieldCount: learnedStats.totalLearned,
    portalDetection,
    lastFillResult: anonymizeFillResult(lastFillResult),
    debugMode: settings.debugMode,
  };

  return JSON.stringify(report, null, 2);
}
