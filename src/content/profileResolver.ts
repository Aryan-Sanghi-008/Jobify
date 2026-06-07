import { formatProfileDateForInput } from '@/content/dateFormat';
import { FIELD_LABEL_MAP } from '@/shared/constants';
import type { FormField, ProfileMatchKey, UserProfile } from '@/shared/types';
import { normalizeLabel } from '@/shared/utils';

type SectionProfileKey = keyof typeof FIELD_LABEL_MAP;

const EXPERIENCE_KEYS: SectionProfileKey[] = [
  'title',
  'company',
  'startDate',
  'endDate',
  'current',
  'description',
];

const EDUCATION_KEYS: SectionProfileKey[] = [
  'degree',
  'field',
  'institution',
  'graduationYear',
  'percentage',
];

const LOCATION_LABEL_PATTERN = /location/i;
const FROM_LABEL_PATTERN = /^from$|start date|joined on/i;
const TO_LABEL_PATTERN = /^to$|end date|left on/i;
const CURRENT_WORK_PATTERN = /currently work|still working|i currently work/i;
const GPA_LABEL_PATTERN = /gpa|overall result|cgpa|percentage|marks/i;
const SCHOOL_LABEL_PATTERN = /school|university|college|institution/i;

const EXPERIENCE_LABEL_KEYS: Array<[RegExp, SectionProfileKey]> = [
  [/^job title$|role title|position title/i, 'title'],
  [/^company$|employer|organization/i, 'company'],
  [/role description|job description|responsibilities/i, 'description'],
];

const EDUCATION_LABEL_KEYS: Array<[RegExp, SectionProfileKey]> = [
  [/^degree$|qualification/i, 'degree'],
  [/field of study|major|specialization/i, 'field'],
  [/graduation year|year of passing|passing year/i, 'graduationYear'],
];

function stripSectionPrefix(label: string): string {
  const parts = label.split('>').map((part) => part.trim());
  const bare = parts[parts.length - 1] ?? label;
  return normalizeLabel(bare);
}

function matchesLabelMap(
  normalizedLabel: string,
  key: SectionProfileKey,
): boolean {
  return FIELD_LABEL_MAP[key].some(
    (candidate) =>
      normalizedLabel === normalizeLabel(candidate) ||
      normalizedLabel.includes(normalizeLabel(candidate)) ||
      normalizeLabel(candidate).includes(normalizedLabel),
  );
}

function resolveSectionKey(
  sectionType: NonNullable<FormField['sectionType']>,
  normalizedLabel: string,
): SectionProfileKey | null {
  const bareLabel = stripSectionPrefix(normalizedLabel);

  if (sectionType === 'experience') {
    if (LOCATION_LABEL_PATTERN.test(bareLabel)) {
      return null;
    }

    if (FROM_LABEL_PATTERN.test(bareLabel)) {
      return 'startDate';
    }

    if (TO_LABEL_PATTERN.test(bareLabel)) {
      return 'endDate';
    }

    if (CURRENT_WORK_PATTERN.test(bareLabel)) {
      return 'current';
    }

    for (const [pattern, key] of EXPERIENCE_LABEL_KEYS) {
      if (pattern.test(bareLabel)) {
        return key;
      }
    }

    for (const key of EXPERIENCE_KEYS) {
      if (matchesLabelMap(bareLabel, key)) {
        return key;
      }
    }

    return null;
  }

  if (sectionType === 'education') {
    if (GPA_LABEL_PATTERN.test(bareLabel)) {
      return 'percentage';
    }

    if (SCHOOL_LABEL_PATTERN.test(bareLabel)) {
      return 'institution';
    }

    for (const [pattern, key] of EDUCATION_LABEL_KEYS) {
      if (pattern.test(bareLabel)) {
        return key;
      }
    }

    for (const key of EDUCATION_KEYS) {
      if (matchesLabelMap(bareLabel, key)) {
        return key;
      }
    }

    return null;
  }

  return null;
}

function formatResolvedValue(value: unknown, key: SectionProfileKey | null): string {
  if (value === undefined || value === null) {
    return '';
  }

  if (key === 'current') {
    return value === true ? 'yes' : 'no';
  }

  if (key === 'graduationYear') {
    return String(value);
  }

  if (key === 'startDate' || key === 'endDate') {
    return typeof value === 'string'
      ? formatProfileDateForInput(value, 'mm/yyyy')
      : '';
  }

  return String(value).trim();
}

/**
 * Resolves a profile value for indexed repeatable sections.
 */
export function resolveFieldValue(profile: UserProfile, field: FormField): string {
  if (field.sectionIndex === undefined || !field.sectionType) {
    return '';
  }

  const bareLabel = stripSectionPrefix(field.label);

  if (
    field.sectionType === 'experience' &&
    LOCATION_LABEL_PATTERN.test(bareLabel)
  ) {
    return profile.personal.city.trim();
  }

  const sectionKey = resolveSectionKey(field.sectionType, bareLabel);
  if (!sectionKey) {
    return '';
  }

  if (field.sectionType === 'experience') {
    const entry = profile.experience[field.sectionIndex];
    if (!entry) {
      return '';
    }

    return formatResolvedValue(entry[sectionKey as keyof typeof entry], sectionKey);
  }

  if (field.sectionType === 'education') {
    const entry = profile.education[field.sectionIndex];
    if (!entry) {
      return '';
    }

    return formatResolvedValue(entry[sectionKey as keyof typeof entry], sectionKey);
  }

  if (field.sectionType === 'skills') {
    return profile.skills.join(', ');
  }

  return '';
}

/**
 * Resolves profile key for indexed section fields to aid matcher confidence.
 */
export function resolveSectionProfileKey(field: FormField): ProfileMatchKey | undefined {
  if (field.sectionIndex === undefined || !field.sectionType) {
    return undefined;
  }

  if (field.sectionType === 'skills') {
    return 'skills';
  }

  const bareLabel = stripSectionPrefix(field.label);

  if (
    field.sectionType === 'experience' &&
    LOCATION_LABEL_PATTERN.test(bareLabel)
  ) {
    return 'city';
  }

  const sectionKey = resolveSectionKey(field.sectionType, bareLabel);
  return sectionKey ?? undefined;
}
