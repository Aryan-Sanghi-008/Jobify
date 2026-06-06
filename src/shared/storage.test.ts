import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobApplication } from '@/shared/types';
import {
  DEFAULT_PROFILE,
  getAutofillData,
  hasRecentApplication,
  normalizeApplicationKey,
} from '@/shared/storage';

let storedApplications: JobApplication[] = [];

function makeApplication(
  overrides: Partial<JobApplication> = {},
): JobApplication {
  return {
    id: 'app-1',
    company: 'Acme Corp',
    role: 'Software Engineer',
    portal: 'greenhouse',
    url: 'https://example.com/jobs/1',
    appliedAt: Date.now(),
    status: 'applied',
    ...overrides,
  };
}

describe('getAutofillData', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'chrome', {
      configurable: true,
      value: {
        storage: {
          local: {
            get: vi.fn(async (keys: string | string[]) => {
              const requestedKeys = Array.isArray(keys) ? keys : [keys];

              const result: Record<string, unknown> = {};
              for (const key of requestedKeys) {
                if (key === 'profile') {
                  result.profile = DEFAULT_PROFILE;
                } else if (key === 'settings') {
                  result.settings = { debugMode: true };
                } else if (key === 'learnedFields') {
                  result.learnedFields = {
                    abc123: {
                      value: 'fullName',
                      normalizedLabel: 'legal name',
                      learnedAt: 1,
                      timesUsed: 0,
                      sites: [],
                    },
                  };
                }
              }

              return result;
            }),
            set: vi.fn(async () => undefined),
          },
        },
      },
    });
  });

  it('reads profile, settings, and learnedFields in one storage call', async () => {
    const data = await getAutofillData();

    expect(chrome.storage.local.get).toHaveBeenCalledWith([
      'profile',
      'settings',
      'learnedFields',
    ]);
    expect(data.profile).toEqual(DEFAULT_PROFILE);
    expect(data.settings.debugMode).toBe(true);
    expect(data.learnedFields.abc123?.value).toBe('fullName');
  });
});

describe('normalizeApplicationKey', () => {
  it('normalizes company and role for deduplication', () => {
    expect(normalizeApplicationKey('  Acme Corp ', ' Software Engineer ')).toBe(
      'acme corp::software engineer',
    );
  });
});

describe('hasRecentApplication', () => {
  beforeEach(() => {
    storedApplications = [];

    Object.defineProperty(globalThis, 'chrome', {
      configurable: true,
      value: {
        storage: {
          local: {
            get: vi.fn(async (key: string) => {
              if (key === 'applications') {
                return { applications: storedApplications };
              }

              return {};
            }),
            set: vi.fn(async () => undefined),
          },
        },
      },
    });
  });

  it('returns true for the same company and role within 24 hours', async () => {
    storedApplications = [
      makeApplication({
        company: 'Acme Corp',
        role: 'Software Engineer',
        appliedAt: Date.now() - 60_000,
      }),
    ];

    await expect(
      hasRecentApplication('acme corp', 'software engineer'),
    ).resolves.toBe(true);
  });

  it('returns false for a different role', async () => {
    storedApplications = [
      makeApplication({
        company: 'Acme Corp',
        role: 'Software Engineer',
        appliedAt: Date.now() - 60_000,
      }),
    ];

    await expect(
      hasRecentApplication('Acme Corp', 'Product Manager'),
    ).resolves.toBe(false);
  });

  it('returns false for an expired entry', async () => {
    storedApplications = [
      makeApplication({
        company: 'Acme Corp',
        role: 'Software Engineer',
        appliedAt: Date.now() - 25 * 60 * 60 * 1000,
      }),
    ];

    await expect(
      hasRecentApplication('Acme Corp', 'Software Engineer'),
    ).resolves.toBe(false);
  });
});
