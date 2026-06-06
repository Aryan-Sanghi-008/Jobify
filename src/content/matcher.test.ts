import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyConfidenceThreshold,
  getProfileValue,
  invalidateLearnedFieldsCache,
  matchFields,
} from '@/content/matcher';
import { parseCommunityFields } from '@/shared/communityFields';
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
  beforeEach(() => {
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async () => ({})),
          set: vi.fn(async () => undefined),
          getBytesInUse: vi.fn(async () => 0),
        },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    invalidateLearnedFieldsCache();
  });

  it('matches "Current CTC (in LPA)" to currentCTC with high confidence', () => {
    const [matched] = matchFields(
      [makeField('Current CTC (in LPA)')],
      testProfile,
      {},
    );

    expect(matched.profileKey).toBe('currentCTC');
    expect(matched.unknown).toBe(false);
    expect(matched.confidence).toBeGreaterThan(0.8);
  });

  it('matches "LinkedIn Profile" to linkedinUrl', () => {
    const [matched] = matchFields(
      [makeField('LinkedIn Profile')],
      testProfile,
      {},
    );

    expect(matched.profileKey).toBe('linkedinUrl');
    expect(matched.unknown).toBe(false);
    expect(matched.confidence).toBe(1);
  });

  it('marks "Why do you want to join?" as unknown', () => {
    const [matched] = matchFields(
      [makeField('Why do you want to join?')],
      testProfile,
      {},
    );

    expect(matched.unknown).toBe(true);
    expect(matched.profileKey).toBeUndefined();
    expect(matched.confidence).toBe(0);
  });

  it('uses learned field mapping over fuzzy match', () => {
    const label = 'Full Name';
    const learnedFields = makeLearnedField(normalizeLabel(label), 'email');

    const [matched] = matchFields([makeField(label)], testProfile, learnedFields);

    expect(matched.profileKey).toBe('email');
    expect(matched.confidence).toBe(1);
    expect(matched.unknown).toBe(false);
  });

  it('treats low-confidence fuzzy matches as unknown', () => {
    const [matched] = matchFields(
      [makeField('zzzzzzzzzzzzzz')],
      testProfile,
      {},
    );

    expect(matched.unknown).toBe(true);
    expect(matched.profileKey).toBeUndefined();
    expect(matched.confidence).toBe(0);
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

  it('prefers personal learned mapping over community mapping', () => {
    const label = 'present ctc in lpa';
    const learnedFields = makeLearnedField(normalizeLabel(label), 'expectedCTC');
    const communityFields = parseCommunityFields({
      [hashString(normalizeLabel(label))]: {
        profileKey: 'currentCTC',
        labels: [label],
        portals: [],
        votes: 20,
      },
    });

    const [matched] = matchFields(
      [makeField(label)],
      testProfile,
      learnedFields,
      communityFields,
      'naukri',
    );

    expect(matched.profileKey).toBe('expectedCTC');
  });

  it('uses community mapping before built-in fuzzy matching', () => {
    const label = 'present compensation in lakhs';
    const communityFields = parseCommunityFields({
      [hashString(normalizeLabel(label))]: {
        profileKey: 'currentCTC',
        labels: [label],
        portals: [],
        votes: 8,
      },
    });

    const [matched] = matchFields(
      [makeField(label)],
      testProfile,
      {},
      communityFields,
      'naukri',
    );

    expect(matched.profileKey).toBe('currentCTC');
    expect(matched.unknown).toBe(false);
  });

  it('keeps built-in exact mapping over community mapping', () => {
    const label = 'Current CTC (in LPA)';
    const communityFields = parseCommunityFields({
      [hashString(normalizeLabel(label))]: {
        profileKey: 'expectedCTC',
        labels: [label],
        portals: [],
        votes: 20,
      },
    });

    const [matched] = matchFields(
      [makeField(label)],
      testProfile,
      {},
      communityFields,
      'naukri',
    );

    expect(matched.profileKey).toBe('currentCTC');
  });

  it('skips community mappings for other portals', () => {
    const label = 'visa sponsorship required';
    const communityFields = parseCommunityFields({
      [hashString(normalizeLabel(label))]: {
        profileKey: 'workAuthorization',
        labels: [label],
        portals: ['greenhouse'],
        votes: 10,
      },
    });

    const [matched] = matchFields(
      [makeField(label)],
      testProfile,
      {},
      communityFields,
      'naukri',
    );

    expect(matched.unknown).toBe(true);
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
});

describe('applyConfidenceThreshold', () => {
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

  it('keeps matches at or above the confidence threshold', () => {
    const field = makeField('test');
    const result = applyConfidenceThreshold({
      ...field,
      profileKey: 'email',
      confidence: 0.5,
      unknown: false,
    });

    expect(result.unknown).toBe(false);
    expect(result.profileKey).toBe('email');
    expect(result.confidence).toBe(0.5);
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
