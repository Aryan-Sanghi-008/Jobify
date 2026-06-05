import Fuse from 'fuse.js';
import { FIELD_LABEL_MAP } from '@/shared/constants';
import { flattenProfile } from '@/shared/storage';
import type {
  FlatProfile,
  FormField,
  ProfileMatchKey,
  UserProfile,
} from '@/shared/types';
import { formatCTC, hashString, normalizeLabel } from '@/shared/utils';

interface LabelIndexEntry {
  key: keyof FlatProfile;
  label: string;
}

const FUSE_THRESHOLD = 0.3;
const MIN_CONTAINED_LABEL_LENGTH = 5;

const FLAT_PROFILE_KEYS = Object.keys(FIELD_LABEL_MAP) as Array<keyof FlatProfile>;

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

function findContainedLabelMatch(
  normalizedLabel: string,
): keyof FlatProfile | undefined {
  let bestKey: keyof FlatProfile | undefined;
  let bestLength = 0;

  for (const key of FLAT_PROFILE_KEYS) {
    for (const label of FIELD_LABEL_MAP[key]) {
      const normalizedMapLabel = normalizeLabel(label);

      if (
        normalizedMapLabel.length >= MIN_CONTAINED_LABEL_LENGTH &&
        normalizedMapLabel.length > bestLength &&
        normalizedLabel.includes(normalizedMapLabel)
      ) {
        bestKey = key;
        bestLength = normalizedMapLabel.length;
      }
    }
  }

  return bestKey;
}

function resolveLearnedKey(
  learnedFields: Record<string, string>,
  normalizedLabel: string,
): ProfileMatchKey | undefined {
  const labelHash = hashString(normalizedLabel);
  const learnedKey = learnedFields[labelHash];

  if (!learnedKey || !isProfileMatchKey(learnedKey)) {
    return undefined;
  }

  return learnedKey;
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

function matchSingleField(
  field: FormField,
  fuse: Fuse<LabelIndexEntry>,
  learnedFields: Record<string, string>,
): FormField {
  const normalizedLabel = normalizeLabel(field.label);
  const learnedKey = resolveLearnedKey(learnedFields, normalizedLabel);

  if (learnedKey) {
    return {
      ...field,
      profileKey: learnedKey,
      confidence: 1,
      unknown: false,
    };
  }

  const specialCase = applySpecialCase(field, normalizedLabel);
  if (specialCase) {
    return specialCase;
  }

  const exactMatch = findExactLabelMatch(normalizedLabel);
  if (exactMatch) {
    return {
      ...field,
      profileKey: exactMatch,
      confidence: 1,
      unknown: false,
    };
  }

  const containedMatch = findContainedLabelMatch(normalizedLabel);
  if (containedMatch) {
    return {
      ...field,
      profileKey: containedMatch,
      confidence: 0.9,
      unknown: false,
    };
  }

  return matchWithFuse(field, fuse, normalizedLabel);
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
  learnedFields: Record<string, string>,
): FormField[] {
  void flattenProfile(profile);
  const fuse = buildFuseIndex();

  return fields.map((field) => matchSingleField(field, fuse, learnedFields));
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
