import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildContributionIssueUrl,
  exportContributionEntries,
  fetchCommunityFields,
  invalidateCommunityFieldsCache,
  parseCommunityFields,
  resolveCommunityMatch,
} from '@/shared/communityFields';
import type { LearnedField } from '@/shared/types';
import { hashString } from '@/shared/utils';

function makeLearnedField(
  normalizedLabel: string,
  value: string,
  sites: string[] = [],
): Record<string, LearnedField> {
  const entry: LearnedField = {
    value,
    normalizedLabel,
    learnedAt: Date.now(),
    timesUsed: 1,
    sites,
  };

  return {
    [hashString(normalizedLabel)]: entry,
    [normalizedLabel]: entry,
  };
}

describe('parseCommunityFields', () => {
  it('parses valid community field entries', () => {
    const parsed = parseCommunityFields({
      abc12345: {
        profileKey: 'currentCTC',
        labels: ['Current CTC (in LPA)', 'present ctc'],
        portals: ['naukri'],
        votes: 5,
      },
      bad: {
        profileKey: 'not-a-key',
        labels: ['foo'],
        portals: [],
        votes: 1,
      },
    });

    expect(Object.keys(parsed)).toHaveLength(1);
    expect(parsed.abc12345?.profileKey).toBe('currentCTC');
    expect(parsed.abc12345?.labels).toContain('current ctc in lpa');
  });

  it('rejects non-object payloads', () => {
    expect(() => parseCommunityFields([])).toThrow();
  });
});

describe('resolveCommunityMatch', () => {
  afterEach(() => {
    invalidateCommunityFieldsCache();
  });

  const map = parseCommunityFields({
    [hashString('visa sponsorship')]: {
      profileKey: 'workAuthorization',
      labels: ['visa sponsorship', 'work authorization'],
      portals: ['greenhouse'],
      votes: 10,
    },
  });

  it('matches by exact label for the configured portal', () => {
    const match = resolveCommunityMatch('visa sponsorship', map, 'greenhouse');
    expect(match?.profileKey).toBe('workAuthorization');
    expect(match?.confidence).toBeGreaterThanOrEqual(0.75);
  });

  it('skips entries for other portals', () => {
    const match = resolveCommunityMatch('visa sponsorship', map, 'naukri');
    expect(match).toBeUndefined();
  });
});

describe('exportContributionEntries', () => {
  it('exports profile-key mappings only', () => {
    const entries = exportContributionEntries({
      ...makeLearnedField('custom question', 'my custom answer'),
      ...makeLearnedField('current ctc in lpa', 'currentCTC', [
        'https://www.naukri.com/apply',
      ]),
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]?.profileKey).toBe('currentCTC');
    expect(entries[0]?.label).toBe('current ctc in lpa');
    expect(entries[0]?.portals).toContain('naukri');
  });
});

describe('buildContributionIssueUrl', () => {
  it('encodes a GitHub issue URL without values', () => {
    const url = buildContributionIssueUrl([
      {
        label: 'current ctc in lpa',
        profileKey: 'currentCTC',
        portals: ['naukri'],
      },
    ]);

    expect(url).toContain('github.com');
    expect(url).toContain('current%20ctc%20in%20lpa');
    expect(url).not.toContain('my secret answer');
  });
});

describe('fetchCommunityFields', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches and parses community fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          abcd1234: {
            profileKey: 'email',
            labels: ['email address'],
            portals: [],
            votes: 2,
          },
        }),
      }),
    );

    const fields = await fetchCommunityFields('https://example.com/fields.json');
    expect(fields.abcd1234?.profileKey).toBe('email');
  });
});
