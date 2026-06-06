import Fuse from 'fuse.js';
import { FIELD_LABEL_MAP } from '@/shared/constants';
import { flattenProfile, recordLearnedFieldUse } from '@/shared/storage';
import type {
  FlatProfile,
  FormField,
  LearnedField,
  ProfileMatchKey,
  UserProfile,
} from '@/shared/types';
import { formatCTC, hashString, normalizeLabel } from '@/shared/utils';

interface LabelIndexEntry {
  key: keyof FlatProfile;
  label: string;
}

interface LearnedFuseEntry {
  label: string;
  hash: string;
  value: string;
}

const FUSE_THRESHOLD = 0.3;
const LEARNED_FUSE_THRESHOLD = 0.35;
const CONFIDENCE_THRESHOLD = 0.5;

const FLAT_PROFILE_KEYS = Object.keys(FIELD_LABEL_MAP) as Array<keyof FlatProfile>;

let cachedFuseIndex: Fuse<LabelIndexEntry> | null = null;
let cachedLearnedFieldsVersion: string | null = null;
let cachedLearnedFuse: Fuse<LearnedFuseEntry> | null = null;

function isFlatProfileKey(key: string): key is keyof FlatProfile {
  return FLAT_PROFILE_KEYS.includes(key as keyof FlatProfile);
}

function isProfileMatchKey(key: string): key is ProfileMatchKey {
  return key === 'resumeFile' || isFlatProfileKey(key);
}

function buildFuseIndex(): Fuse<LabelIndexEntry> {
  const entries: LabelIndexEntry[] = [];

  for (const key of FLAT_PROFILE_KEYS) {
    for (const label of FIELD_LABEL_MAP[key]) {
      entries.push({ key, label: normalizeLabel(label) });
    }
  }

  return new Fuse(entries, {
    keys: ['label'],
    threshold: FUSE_THRESHOLD,
    includeScore: true,
    ignoreLocation: true,
  });
}

function getFuseIndex(): Fuse<LabelIndexEntry> {
  if (!cachedFuseIndex) {
    cachedFuseIndex = buildFuseIndex();
  }

  return cachedFuseIndex;
}

function computeLearnedFieldsVersion(
  learnedFields: Record<string, LearnedField>,
): string {
  const serialized = Object.entries(learnedFields)
    .map(
      ([key, entry]) =>
        `${key}:${entry.normalizedLabel}:${entry.value}:${entry.learnedAt}:${entry.timesUsed}`,
    )
    .sort()
    .join('|');

  return hashString(serialized);
}

function getLearnedFuseIndex(
  learnedFields: Record<string, LearnedField>,
): Fuse<LearnedFuseEntry> {
  const version = computeLearnedFieldsVersion(learnedFields);

  if (cachedLearnedFuse && cachedLearnedFieldsVersion === version) {
    return cachedLearnedFuse;
  }

  const uniqueLearned = Object.values(learnedFields).filter(
    (entry, index, array) =>
      array.findIndex(
        (other) =>
          other.normalizedLabel === entry.normalizedLabel &&
          other.value === entry.value,
      ) === index,
  );

  cachedLearnedFieldsVersion = version;
  cachedLearnedFuse = buildLearnedFuseIndex(uniqueLearned);
  return cachedLearnedFuse;
}

export function invalidateLearnedFieldsCache(): void {
  cachedLearnedFieldsVersion = null;
  cachedLearnedFuse = null;
}

function buildLearnedFuseIndex(entries: LearnedField[]): Fuse<LearnedFuseEntry> {
  const fuseEntries: LearnedFuseEntry[] = entries
    .filter((entry) => entry.normalizedLabel.trim() !== '')
    .map((entry) => ({
      label: entry.normalizedLabel,
      hash: hashString(entry.normalizedLabel),
      value: entry.value,
    }));

  return new Fuse(fuseEntries, {
    keys: ['label'],
    threshold: LEARNED_FUSE_THRESHOLD,
    includeScore: true,
    ignoreLocation: true,
  });
}

function findExactLabelMatch(
  normalizedLabel: string,
): keyof FlatProfile | undefined {
  for (const key of FLAT_PROFILE_KEYS) {
    const hasExactMatch = FIELD_LABEL_MAP[key].some(
      (label) => normalizeLabel(label) === normalizedLabel,
    );

    if (hasExactMatch) {
      return key;
    }
  }

  return undefined;
}

function resolveLearnedByHash(
  learnedFields: Record<string, LearnedField>,
  normalizedLabel: string,
): { value: string; hash: string } | undefined {
  const labelHash = hashString(normalizedLabel);
  const entry = learnedFields[labelHash];

  if (!entry) {
    return undefined;
  }

  return { value: entry.value, hash: labelHash };
}

function resolveLearnedByFuzzy(
  fuse: Fuse<LearnedFuseEntry>,
  normalizedLabel: string,
): { value: string; hash: string; score: number } | undefined {
  const results = fuse.search(normalizedLabel);
  const best = results[0];

  if (!best || (best.score ?? 1) > LEARNED_FUSE_THRESHOLD) {
    return undefined;
  }

  return {
    value: best.item.value,
    hash: best.item.hash,
    score: best.score ?? 1,
  };
}

function applyLearnedValue(field: FormField, value: string): FormField {
  if (isProfileMatchKey(value)) {
    return {
      ...field,
      profileKey: value,
      confidence: 1,
      unknown: false,
    };
  }

  return {
    ...field,
    learnedLiteral: value,
    confidence: 1,
    unknown: false,
  };
}

function applySpecialCase(
  field: FormField,
  normalizedLabel: string,
): FormField | null {
  if (/\b(resume|cv)\b/.test(normalizedLabel)) {
    return {
      ...field,
      type: 'file',
      profileKey: 'resumeFile',
      confidence: 1,
      unknown: false,
    };
  }

  if (normalizedLabel.includes('linkedin')) {
    return {
      ...field,
      profileKey: 'linkedinUrl',
      confidence: 1,
      unknown: false,
    };
  }

  if (normalizedLabel.includes('github')) {
    return {
      ...field,
      profileKey: 'githubUrl',
      confidence: 1,
      unknown: false,
    };
  }

  if (
    normalizedLabel.includes('portfolio') ||
    normalizedLabel.includes('website')
  ) {
    return {
      ...field,
      profileKey: 'portfolioUrl',
      confidence: 1,
      unknown: false,
    };
  }

  return null;
}

function matchWithFuse(
  field: FormField,
  fuse: Fuse<LabelIndexEntry>,
  normalizedLabel: string,
): FormField {
  const results = fuse.search(normalizedLabel);
  const best = results[0];

  if (!best || (best.score ?? 1) > FUSE_THRESHOLD) {
    return {
      ...field,
      profileKey: undefined,
      confidence: 0,
      unknown: true,
    };
  }

  return {
    ...field,
    profileKey: best.item.key,
    confidence: 1 - (best.score ?? 0),
    unknown: false,
  };
}

export function applyConfidenceThreshold(field: FormField): FormField {
  if (field.confidence >= CONFIDENCE_THRESHOLD) {
    return field;
  }

  return {
    ...field,
    profileKey: undefined,
    learnedLiteral: undefined,
    confidence: 0,
    unknown: true,
  };
}

function getCurrentSite(): string | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  return window.location.href;
}

function matchSingleField(
  field: FormField,
  fuse: Fuse<LabelIndexEntry>,
  learnedFuse: Fuse<LearnedFuseEntry>,
  learnedFields: Record<string, LearnedField>,
): FormField {
  const normalizedLabel = normalizeLabel(field.label);

  const learnedHashMatch = resolveLearnedByHash(learnedFields, normalizedLabel);
  if (learnedHashMatch) {
    void recordLearnedFieldUse(learnedHashMatch.hash, getCurrentSite());
    return applyConfidenceThreshold(
      applyLearnedValue(field, learnedHashMatch.value),
    );
  }

  const specialCase = applySpecialCase(field, normalizedLabel);
  if (specialCase) {
    return applyConfidenceThreshold(specialCase);
  }

  const exactMatch = findExactLabelMatch(normalizedLabel);
  if (exactMatch) {
    return applyConfidenceThreshold({
      ...field,
      profileKey: exactMatch,
      confidence: 1,
      unknown: false,
    });
  }

  const fuzzyLabelMatch = matchWithFuse(field, fuse, normalizedLabel);
  if (!fuzzyLabelMatch.unknown) {
    return applyConfidenceThreshold(fuzzyLabelMatch);
  }

  const learnedFuzzyMatch = resolveLearnedByFuzzy(learnedFuse, normalizedLabel);
  if (learnedFuzzyMatch) {
    void recordLearnedFieldUse(learnedFuzzyMatch.hash, getCurrentSite());
    const matched = applyLearnedValue(field, learnedFuzzyMatch.value);
    return applyConfidenceThreshold({
      ...matched,
      confidence: 1 - learnedFuzzyMatch.score,
    });
  }

  return applyConfidenceThreshold({
    ...field,
    profileKey: undefined,
    confidence: 0,
    unknown: true,
  });
}

function formatDateValue(value: string): string {
  if (!value.trim()) {
    return '';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Maps scanned form fields to profile keys using learned mappings and fuzzy matching.
 */
export function matchFields(
  fields: FormField[],
  profile: UserProfile,
  learnedFields: Record<string, LearnedField>,
): FormField[] {
  void flattenProfile(profile);
  const fuse = getFuseIndex();
  const learnedFuse = getLearnedFuseIndex(learnedFields);

  return fields.map((field) =>
    matchSingleField(field, fuse, learnedFuse, learnedFields),
  );
}

/**
 * Returns a formatted profile value for autofill.
 */
export function getProfileValue(
  profileKey: string,
  flatProfile: FlatProfile,
): string {
  if (profileKey === 'resumeFile') {
    return '';
  }

  if (!isFlatProfileKey(profileKey)) {
    return '';
  }

  const value = flatProfile[profileKey];

  if (value === undefined || value === null) {
    return '';
  }

  switch (profileKey) {
    case 'currentCTC':
    case 'expectedCTC':
      return formatCTC(Number(value) * 100_000);
    case 'willingToRelocate':
    case 'current':
      return value ? 'Yes' : 'No';
    case 'startDate':
    case 'endDate':
      return typeof value === 'string' ? formatDateValue(value) : '';
    case 'totalYearsExp':
    case 'noticePeriod':
    case 'graduationYear':
      return String(value);
    default:
      return String(value);
  }
}
