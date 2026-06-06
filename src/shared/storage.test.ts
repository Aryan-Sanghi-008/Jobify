import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobApplication } from '@/shared/types';
import {
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
