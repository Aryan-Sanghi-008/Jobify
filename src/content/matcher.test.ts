import { describe, expect, it } from 'vitest';
import {
  applyConfidenceThreshold,
  getProfileValue,
  invalidateLearnedFieldsCache,
  matchFields,
} from '@/content/matcher';
import { DEFAULT_PROFILE, flattenProfile } from '@/shared/storage';
import type { FormField, LearnedField, UserProfile } from '@/shared/types';
import { hashString, normalizeLabel } from '@/shared/utils';

function makeField(label: string): FormField {
  return {
    element: {} as HTMLElement,
    label,
    type: 'text',
    confidence: 0,
    filled: false,
    unknown: false,
  };
}

function makeLearnedField(
  normalizedLabel: string,
  value: string,
): Record<string, LearnedField> {
  const entry: LearnedField = {
    value,
    normalizedLabel,
    learnedAt: Date.now(),
    timesUsed: 0,
    sites: [],
  };

  return {
    [hashString(normalizedLabel)]: entry,
    [normalizedLabel]: entry,
  };
}

const testProfile: UserProfile = {
  ...DEFAULT_PROFILE,
  personal: {
    ...DEFAULT_PROFILE.personal,
    linkedinUrl: 'https://linkedin.com/in/test',
  },
  professional: {
    ...DEFAULT_PROFILE.professional,
    currentCTC: 12,
    willingToRelocate: true,
  },
};

describe('matchFields', () => {
  it('matches "Current CTC" to currentCTC', () => {
    const [matched] = matchFields(
      [makeField('Current CTC')],
      testProfile,
      {},
    );

    expect(matched.profileKey).toBe('currentCTC');
    expect(matched.unknown).toBe(false);
    expect(matched.confidence).toBe(1);
  });

  it('matches "LinkedIn Profile URL" to linkedinUrl', () => {
    const [matched] = matchFields(
      [makeField('LinkedIn Profile URL')],
      testProfile,
      {},
    );

    expect(matched.profileKey).toBe('linkedinUrl');
    expect(matched.unknown).toBe(false);
  });

  it('marks "Why do you want to join us?" as unknown', () => {
    const [matched] = matchFields(
      [makeField('Why do you want to join us?')],
      testProfile,
      {},
    );

    expect(matched.unknown).toBe(true);
    expect(matched.profileKey).toBeUndefined();
  });

  it('uses learned field mapping over fuzzy match', () => {
    const label = 'Full Name';
    const learnedFields = makeLearnedField(normalizeLabel(label), 'email');

    const [matched] = matchFields([makeField(label)], testProfile, learnedFields);

    expect(matched.profileKey).toBe('email');
    expect(matched.confidence).toBe(1);
    expect(matched.unknown).toBe(false);
  });

  it('fuzzy matches similar learned field labels', () => {
    const learnedFields = makeLearnedField('legal full name', 'fullName');

    const [matched] = matchFields(
      [makeField('Legal Ful Name')],
      testProfile,
      learnedFields,
    );

    expect(matched.profileKey).toBe('fullName');
    expect(matched.unknown).toBe(false);
    expect(matched.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it('uses updated learned fields after cache invalidation', () => {
    const label = 'Department Code';
    const initial = makeLearnedField(normalizeLabel(label), 'email');
    const [firstMatch] = matchFields([makeField(label)], testProfile, initial);
    expect(firstMatch.profileKey).toBe('email');

    invalidateLearnedFieldsCache();
    const updated = makeLearnedField(normalizeLabel(label), 'fullName');
    const [secondMatch] = matchFields([makeField(label)], testProfile, updated);
    expect(secondMatch.profileKey).toBe('fullName');
  });

  it('treats matches below confidence threshold as unknown', () => {
    const field = makeField('test');
    const result = applyConfidenceThreshold({
      ...field,
      profileKey: 'email',
      confidence: 0.4,
      unknown: false,
    });

    expect(result.unknown).toBe(true);
    expect(result.profileKey).toBeUndefined();
    expect(result.confidence).toBe(0);
  });
});

describe('getProfileValue', () => {
  it('formats CTC values as LPA strings', () => {
    const flatProfile = flattenProfile(testProfile);
    expect(getProfileValue('currentCTC', flatProfile)).toBe('12 LPA');
  });

  it('formats boolean values as Yes or No', () => {
    const flatProfile = flattenProfile(testProfile);
    expect(getProfileValue('willingToRelocate', flatProfile)).toBe('Yes');
  });
});
