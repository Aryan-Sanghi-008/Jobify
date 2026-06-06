import type { DiscoveredJob, JobFeedSource, JobPreferences } from '@/shared/types';
import { hashString } from '@/shared/utils';

const REMOTEOK_API_URL = 'https://remoteok.com/api';
const ARBEITNOW_API_URL = 'https://www.arbeitnow.com/api/job-board-api';
const ADZUNA_API_BASE = 'https://api.adzuna.com/v1/api/jobs';
const DESCRIPTION_MAX_LENGTH = 300;

function truncateDescription(text: string): string {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= DESCRIPTION_MAX_LENGTH) {
    return trimmed;
  }

  return `${trimmed.slice(0, DESCRIPTION_MAX_LENGTH).trimEnd()}…`;
}

function buildJobId(source: JobFeedSource, url: string): string {
  return hashString(`${source}:${url}`);
}

function parseSalaryRange(value: unknown): {
  salaryMin: number | null;
  salaryMax: number | null;
} {
  if (typeof value === 'number' && value > 0) {
    return { salaryMin: value, salaryMax: value };
  }

  if (typeof value !== 'string') {
    return { salaryMin: null, salaryMax: null };
  }

  const normalized = value.replace(/,/g, '').toLowerCase();
  const numbers = normalized.match(/\d+/g)?.map((part) => Number.parseInt(part, 10)) ?? [];

  if (numbers.length === 0) {
    return { salaryMin: null, salaryMax: null };
  }

  const multiplier = normalized.includes('k') ? 1000 : 1;
  const scaled = numbers.map((amount) => amount * multiplier);

  return {
    salaryMin: Math.min(...scaled),
    salaryMax: Math.max(...scaled),
  };
}

function roleTag(role: string): string {
  return role
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join('-');
}

function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) {
    return [];
  }

  return tags
    .map((tag) => (typeof tag === 'string' ? tag.trim().toLowerCase() : ''))
    .filter(Boolean);
}

export function filterJobs(
  jobs: DiscoveredJob[],
  preferences: JobPreferences,
): DiscoveredJob[] {
  const roleQuery = preferences.desiredRole.trim().toLowerCase();
  const roleTokens = roleQuery.split(/\s+/).filter(Boolean);
  const locations = preferences.preferredLocations
    .map((location) => location.trim().toLowerCase())
    .filter(Boolean);

  return jobs.filter((job) => {
    const haystack = [
      job.title,
      job.company,
      job.location,
      job.description,
      job.tags.join(' '),
    ]
      .join(' ')
      .toLowerCase();

    if (roleTokens.length > 0) {
      const roleMatch = roleTokens.some((token) => haystack.includes(token));
      if (!roleMatch) {
        return false;
      }
    }

    if (locations.length > 0) {
      const locationMatch = locations.some((location) => {
        if (location === 'remote') {
          return (
            job.location.toLowerCase().includes('remote') ||
            job.tags.includes('remote') ||
            haystack.includes('remote')
          );
        }

        return haystack.includes(location);
      });

      if (!locationMatch) {
        return false;
      }
    }

    if (preferences.minSalary !== null && job.salaryMax !== null) {
      if (job.salaryMax < preferences.minSalary) {
        return false;
      }
    }

    return true;
  });
}

export async function fetchFromRemoteOk(role: string): Promise<DiscoveredJob[]> {
  const tag = roleTag(role);
  const url = tag ? `${REMOTEOK_API_URL}?tags=${encodeURIComponent(tag)}` : REMOTEOK_API_URL;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`RemoteOK API error (${response.status})`);
  }

  const data = (await response.json()) as unknown;
  if (!Array.isArray(data)) {
    return [];
  }

  const fetchedAt = Date.now();
  const jobs: DiscoveredJob[] = [];

  for (const item of data.slice(1)) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const record = item as Record<string, unknown>;
    const jobUrl = typeof record.url === 'string' ? record.url : '';
    const title = typeof record.position === 'string' ? record.position : '';
    const company = typeof record.company === 'string' ? record.company : '';

    if (!jobUrl || !title) {
      continue;
    }

    const { salaryMin, salaryMax } = parseSalaryRange(record.salary);
    const description =
      typeof record.description === 'string' ? record.description : '';

    jobs.push({
      id: buildJobId('remoteok', jobUrl),
      title,
      company,
      location: typeof record.location === 'string' ? record.location : '',
      url: jobUrl,
      source: 'remoteok',
      salaryMin,
      salaryMax,
      tags: normalizeTags(record.tags),
      description: truncateDescription(description),
      fetchedAt,
    });
  }

  return jobs;
}

export async function fetchFromArbeitnow(): Promise<DiscoveredJob[]> {
  const response = await fetch(ARBEITNOW_API_URL);
  if (!response.ok) {
    throw new Error(`Arbeitnow API error (${response.status})`);
  }

  const data = (await response.json()) as { data?: unknown };
  const listings = Array.isArray(data.data) ? data.data : [];
  const fetchedAt = Date.now();
  const jobs: DiscoveredJob[] = [];

  for (const item of listings) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const record = item as Record<string, unknown>;
    const jobUrl = typeof record.url === 'string' ? record.url : '';
    const title = typeof record.title === 'string' ? record.title : '';

    if (!jobUrl || !title) {
      continue;
    }

    const location =
      typeof record.location === 'string' ? record.location : '';
    const remote = record.remote === true || record.remote === 'true';
    const tags = normalizeTags(record.tags);

    if (remote && !tags.includes('remote')) {
      tags.push('remote');
    }

    const description =
      typeof record.description === 'string' ? record.description : '';

    jobs.push({
      id: buildJobId('arbeitnow', jobUrl),
      title,
      company:
        typeof record.company_name === 'string' ? record.company_name : '',
      location: remote && !location ? 'Remote' : location,
      url: jobUrl,
      source: 'arbeitnow',
      salaryMin: null,
      salaryMax: null,
      tags,
      description: truncateDescription(description),
      fetchedAt,
    });
  }

  return jobs;
}

export async function fetchFromAdzuna(
  preferences: JobPreferences,
): Promise<DiscoveredJob[]> {
  const appId = preferences.adzunaAppId?.trim();
  const appKey = preferences.adzunaAppKey?.trim();

  if (!appId || !appKey) {
    return [];
  }

  const role = preferences.desiredRole.trim();
  if (!role) {
    return [];
  }

  const country = preferences.adzunaCountry.trim() || 'gb';
  const params = new URLSearchParams({
    app_id: appId,
    app_key: appKey,
    results_per_page: '20',
    what: role,
    'content-type': 'application/json',
  });

  if (preferences.preferredLocations[0]?.trim()) {
    params.set('where', preferences.preferredLocations[0].trim());
  }

  if (preferences.minSalary !== null) {
    params.set('salary_min', String(preferences.minSalary));
  }

  const url = `${ADZUNA_API_BASE}/${country}/search/1?${params.toString()}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Adzuna API error (${response.status})`);
  }

  const data = (await response.json()) as { results?: unknown };
  const listings = Array.isArray(data.results) ? data.results : [];
  const fetchedAt = Date.now();
  const jobs: DiscoveredJob[] = [];

  for (const item of listings) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const record = item as Record<string, unknown>;
    const title = typeof record.title === 'string' ? record.title : '';
    const redirectUrl =
      typeof record.redirect_url === 'string' ? record.redirect_url : '';

    if (!title || !redirectUrl) {
      continue;
    }

    const companyRecord =
      record.company && typeof record.company === 'object'
        ? (record.company as Record<string, unknown>)
        : null;
    const locationRecord =
      record.location && typeof record.location === 'object'
        ? (record.location as Record<string, unknown>)
        : null;

    const description =
      typeof record.description === 'string' ? record.description : '';

    const salaryMin =
      typeof record.salary_min === 'number' ? record.salary_min : null;
    const salaryMax =
      typeof record.salary_max === 'number' ? record.salary_max : null;

    const locationParts = [
      typeof locationRecord?.display_name === 'string'
        ? locationRecord.display_name
        : '',
    ].filter(Boolean);

    jobs.push({
      id: buildJobId('adzuna', redirectUrl),
      title,
      company:
        typeof companyRecord?.display_name === 'string'
          ? companyRecord.display_name
          : '',
      location: locationParts.join(', '),
      url: redirectUrl,
      source: 'adzuna',
      salaryMin,
      salaryMax,
      tags: [],
      description: truncateDescription(description),
      fetchedAt,
    });
  }

  return jobs;
}

function dedupeByUrl(jobs: DiscoveredJob[]): DiscoveredJob[] {
  const seen = new Set<string>();
  const deduped: DiscoveredJob[] = [];

  for (const job of jobs) {
    if (seen.has(job.url)) {
      continue;
    }

    seen.add(job.url);
    deduped.push(job);
  }

  return deduped;
}

export async function fetchMatchingJobs(
  preferences: JobPreferences,
): Promise<DiscoveredJob[]> {
  const role = preferences.desiredRole.trim();
  if (!role) {
    return [];
  }

  const results = await Promise.allSettled([
    fetchFromRemoteOk(role),
    fetchFromArbeitnow(),
    fetchFromAdzuna(preferences),
  ]);

  const combined: DiscoveredJob[] = [];

  for (const result of results) {
    if (result.status === 'fulfilled') {
      combined.push(...result.value);
    }
  }

  return filterJobs(dedupeByUrl(combined), preferences);
}
