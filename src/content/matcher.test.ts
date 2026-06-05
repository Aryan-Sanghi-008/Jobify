import { describe, expect, it } from 'vitest';
import { getProfileValue, matchFields } from '@/content/matcher';
import { DEFAULT_PROFILE, flattenProfile } from '@/shared/storage';
import type { FormField, UserProfile } from '@/shared/types';
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
  it('matches "Current CTC (in LPA)" to currentCTC', () => {
    const [matched] = matchFields(
      [makeField('Current CTC (in LPA)')],
      testProfile,
      {},
    );

    expect(matched.profileKey).toBe('currentCTC');
    expect(matched.unknown).toBe(false);
    expect(matched.confidence).toBeGreaterThan(0.8);
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
    const learnedFields = {
      [hashString(normalizeLabel(label))]: 'email',
    };

    const [matched] = matchFields([makeField(label)], testProfile, learnedFields);

    expect(matched.profileKey).toBe('email');
    expect(matched.confidence).toBe(1);
    expect(matched.unknown).toBe(false);
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
