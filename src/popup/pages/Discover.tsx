import { useCallback, useEffect, useMemo, useState } from 'react';
import Spinner from '@/popup/components/Spinner';
import { useToast } from '@/popup/components/Toast';
import { getJobPreferences, getProfile } from '@/shared/storage';
import type {
  DiscoveredJob,
  DiscoveredJobsMeta,
  FetchDiscoveredJobsResponse,
  GetDiscoveredJobsResponse,
  JobFeedSource,
  JobPreferences,
} from '@/shared/types';

const INPUT_CLASS =
  'w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

const SOURCE_CONFIG: Record<
  JobFeedSource,
  { label: string; badgeClass: string }
> = {
  remoteok: { label: 'RemoteOK', badgeClass: 'bg-emerald-100 text-emerald-800' },
  arbeitnow: { label: 'Arbeitnow', badgeClass: 'bg-violet-100 text-violet-800' },
  adzuna: { label: 'Adzuna', badgeClass: 'bg-sky-100 text-sky-800' },
};

function formatRelativeDate(timestamp: number | null): string {
  if (timestamp === null) {
    return 'Never';
  }

  const diffMs = Date.now() - timestamp;
  const diffHours = Math.floor(diffMs / (60 * 60 * 1000));

  if (diffHours < 1) {
    return 'Just now';
  }

  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function formatSalary(job: DiscoveredJob): string | null {
  if (job.salaryMin === null && job.salaryMax === null) {
    return null;
  }

  const format = (value: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(value);

  if (job.salaryMin !== null && job.salaryMax !== null) {
    if (job.salaryMin === job.salaryMax) {
      return format(job.salaryMin);
    }

    return `${format(job.salaryMin)} – ${format(job.salaryMax)}`;
  }

  return format(job.salaryMin ?? job.salaryMax ?? 0);
}

interface JobCardProps {
  job: DiscoveredJob;
  profileComplete: boolean;
  isApplying: boolean;
  onAutoApply: (url: string) => void;
}

function JobCard({
  job,
  profileComplete,
  isApplying,
  onAutoApply,
}: JobCardProps) {
  const source = SOURCE_CONFIG[job.source];
  const salary = formatSalary(job);

  return (
    <article className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900">{job.title}</p>
          <p className="truncate text-xs text-gray-600">{job.company}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${source.badgeClass}`}
        >
          {source.label}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
        {job.location ? <span>{job.location}</span> : null}
        {salary ? <span>{salary}</span> : null}
      </div>

      {job.description ? (
        <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-gray-600">
          {job.description}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => onAutoApply(job.url)}
        disabled={!profileComplete || isApplying}
        title={profileComplete ? undefined : 'Complete profile first'}
        className="mt-3 w-full rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
      >
        {isApplying ? 'Opening…' : 'Auto-apply'}
      </button>
    </article>
  );
}

export default function Discover() {
  const [jobs, setJobs] = useState<DiscoveredJob[]>([]);
  const [meta, setMeta] = useState<DiscoveredJobsMeta>({
    lastFetchedAt: null,
    lastError: null,
  });
  const [preferences, setPreferences] = useState<JobPreferences | null>(null);
  const [profileComplete, setProfileComplete] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [applyingUrl, setApplyingUrl] = useState<string | null>(null);
  const { showToast } = useToast();

  const loadData = useCallback(async () => {
    const [response, prefs, profile] = await Promise.all([
      chrome.runtime.sendMessage({ type: 'GET_DISCOVERED_JOBS' }) as Promise<
        GetDiscoveredJobsResponse | undefined
      >,
      getJobPreferences(),
      getProfile(),
    ]);

    setJobs(response?.jobs ?? []);
    setMeta(
      response?.meta ?? {
        lastFetchedAt: null,
        lastError: null,
      },
    );
    setPreferences(prefs);
    setProfileComplete(profile !== null && profile.personal.email.trim() !== '');
  }, []);

  useEffect(() => {
    void (async () => {
      await loadData();
      setIsLoading(false);
    })();
  }, [loadData]);

  const filteredJobs = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return jobs;
    }

    return jobs.filter((job) =>
      [job.title, job.company, job.location, job.description, job.tags.join(' ')]
        .join(' ')
        .toLowerCase()
        .includes(query),
    );
  }, [jobs, searchQuery]);

  const handleRefresh = async () => {
    setIsRefreshing(true);

    try {
      const response = (await chrome.runtime.sendMessage({
        type: 'FETCH_DISCOVERED_JOBS',
      })) as FetchDiscoveredJobsResponse | undefined;

      if (response?.success) {
        showToast(`Found ${response.count} matching job(s)`, 'success');
      } else {
        showToast(response?.error ?? 'Job fetch failed', 'error');
      }

      await loadData();
    } catch {
      showToast('Job fetch failed', 'error');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleAutoApply = async (url: string) => {
    setApplyingUrl(url);

    try {
      const response = (await chrome.runtime.sendMessage({
        type: 'AUTO_APPLY_JOB',
        url,
      })) as { success: boolean; error?: string } | undefined;

      if (response?.success) {
        showToast('Opening job and starting autofill…', 'info');
      } else {
        showToast(response?.error ?? 'Auto-apply failed', 'error');
      }
    } catch {
      showToast('Auto-apply failed', 'error');
    } finally {
      setApplyingUrl(null);
    }
  };

  if (isLoading || !preferences) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner size="md" className="text-blue-600" />
      </div>
    );
  }

  const hasPreferences = preferences.desiredRole.trim().length > 0;

  return (
    <div className="space-y-3 px-4 pb-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs text-gray-500">
            Updated {formatRelativeDate(meta.lastFetchedAt)}
          </p>
          {meta.lastError ? (
            <p className="text-xs text-red-600">{meta.lastError}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => void handleRefresh()}
          disabled={isRefreshing}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-70"
        >
          {isRefreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {!hasPreferences ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600">
          Set your desired role in Settings → Job Preferences to start discovering
          jobs from public feeds.
        </div>
      ) : (
        <>
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search discovered jobs"
            className={INPUT_CLASS}
          />

          {filteredJobs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600">
              No matching jobs yet. Try Refresh or adjust your Job Preferences.
            </div>
          ) : (
            <div className="space-y-2">
              {filteredJobs.map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  profileComplete={profileComplete}
                  isApplying={applyingUrl === job.url}
                  onAutoApply={(url) => void handleAutoApply(url)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
