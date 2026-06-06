import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_JOB_PREFERENCES } from '@/shared/storage';
import type { DiscoveredJob } from '@/shared/types';
import {
  fetchFromRemoteOk,
  fetchMatchingJobs,
  filterJobs,
} from '@/background/jobFetcher';

const samplePreferences = {
  ...DEFAULT_JOB_PREFERENCES,
  desiredRole: 'software engineer',
  preferredLocations: ['remote'],
  minSalary: 80000,
};

function makeJob(overrides: Partial<DiscoveredJob>): DiscoveredJob {
  return {
    id: 'job-1',
    title: 'Software Engineer',
    company: 'Acme',
    location: 'Remote',
    url: 'https://example.com/jobs/1',
    source: 'remoteok',
    salaryMin: 90000,
    salaryMax: 120000,
    tags: ['remote', 'typescript'],
    description: 'Build scalable systems.',
    fetchedAt: Date.now(),
    ...overrides,
  };
}

describe('filterJobs', () => {
  it('matches role keywords in title', () => {
    const jobs = [
      makeJob({ title: 'Software Engineer' }),
      makeJob({ id: 'job-2', title: 'Marketing Manager', url: 'https://x/2' }),
    ];

    const filtered = filterJobs(jobs, samplePreferences);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.title).toBe('Software Engineer');
  });

  it('filters by minimum salary when salary is known', () => {
    const jobs = [
      makeJob({ salaryMin: 90000, salaryMax: 120000 }),
      makeJob({
        id: 'job-2',
        salaryMin: 50000,
        salaryMax: 60000,
        url: 'https://x/2',
      }),
    ];

    const filtered = filterJobs(jobs, samplePreferences);
    expect(filtered).toHaveLength(1);
  });

  it('passes jobs with unknown salary even when minSalary is set', () => {
    const jobs = [
      makeJob({ salaryMin: null, salaryMax: null }),
    ];

    expect(filterJobs(jobs, samplePreferences)).toHaveLength(1);
  });
});

describe('fetchFromRemoteOk', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('skips metadata row and maps job listings', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          { legal: 'Remote OK API Terms' },
          {
            position: 'Backend Engineer',
            company: 'Acme',
            location: 'Remote',
            url: 'https://remoteok.com/remote-jobs/1',
            tags: ['python'],
            description: 'Build APIs',
            salary: '$90k - $120k',
          },
        ],
      }),
    );

    const jobs = await fetchFromRemoteOk('backend engineer');
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.title).toBe('Backend Engineer');
    expect(jobs[0]?.salaryMin).toBe(90000);
    expect(jobs[0]?.salaryMax).toBe(120000);
  });
});

describe('fetchMatchingJobs', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns empty array when desired role is blank', async () => {
    const jobs = await fetchMatchingJobs({
      ...DEFAULT_JOB_PREFERENCES,
      desiredRole: '',
    });
    expect(jobs).toEqual([]);
  });

  it('aggregates successful sources and filters results', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('remoteok.com')) {
          return Promise.resolve({
            ok: true,
            json: async () => [
              {},
              {
                position: 'Software Engineer',
                company: 'Acme',
                location: 'Remote',
                url: 'https://remoteok.com/remote-jobs/1',
                tags: ['remote'],
                description: 'Engineering role',
              },
            ],
          });
        }

        if (url.includes('arbeitnow.com')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              data: [
                {
                  title: 'Frontend Engineer',
                  company_name: 'Beta',
                  location: 'Berlin',
                  url: 'https://arbeitnow.com/jobs/2',
                  remote: false,
                  tags: ['react'],
                  description: 'UI work',
                },
              ],
            }),
          });
        }

        return Promise.resolve({ ok: false, status: 500 });
      }),
    );

    const jobs = await fetchMatchingJobs(samplePreferences);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.source).toBe('remoteok');
  });
});
