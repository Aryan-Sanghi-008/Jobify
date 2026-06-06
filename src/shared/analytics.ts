import { PORTAL_LABELS } from '@/shared/portalLabels';
import type { ApplicationStatus, JobApplication, PortalName } from '@/shared/types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const RESPONDED_STATUSES: ApplicationStatus[] = ['seen', 'interview', 'offer'];

const INTERVIEW_STATUSES: ApplicationStatus[] = ['interview', 'offer'];

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export interface TopMetrics {
  totalApplied: number;
  interviewConversionRate: number;
  avgResponseDays: number | null;
  applyStreak: number;
}

export interface DailyApplicationCount {
  date: string;
  count: number;
}

export interface PortalBreakdownEntry {
  portal: PortalName;
  label: string;
  count: number;
  percent: number;
}

export interface StatusFunnelEntry {
  stage: string;
  count: number;
}

export interface WeekdayHeatmapEntry {
  day: number;
  dayLabel: string;
  applied: number;
  responded: number;
  responseRate: number;
}

export function hasEnoughDataForAnalytics(applications: JobApplication[]): boolean {
  return applications.length > 10;
}

export function isRespondedStatus(status: ApplicationStatus): boolean {
  return RESPONDED_STATUSES.includes(status);
}

function startOfLocalDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function toDateKey(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Monday = 0 … Sunday = 6 */
function getMondayBasedWeekday(timestamp: number): number {
  const day = new Date(timestamp).getDay();
  return day === 0 ? 6 : day - 1;
}

export function computeApplyStreak(applications: JobApplication[]): number {
  if (applications.length === 0) {
    return 0;
  }

  const daysWithApplications = new Set(
    applications.map((app) => startOfLocalDay(app.appliedAt)),
  );

  let streak = 0;
  let cursor = startOfLocalDay(Date.now());

  while (daysWithApplications.has(cursor)) {
    streak += 1;
    cursor -= MS_PER_DAY;
  }

  return streak;
}

export function computeTopMetrics(applications: JobApplication[]): TopMetrics {
  const totalApplied = applications.length;
  const interviewCount = applications.filter((app) =>
    INTERVIEW_STATUSES.includes(app.status),
  ).length;
  const interviewConversionRate =
    totalApplied === 0 ? 0 : Math.round((interviewCount / totalApplied) * 100);

  const respondedWithTimestamps = applications.filter(
    (app) =>
      isRespondedStatus(app.status) && typeof app.statusUpdatedAt === 'number',
  );

  let avgResponseDays: number | null = null;
  if (respondedWithTimestamps.length > 0) {
    const totalDays = respondedWithTimestamps.reduce((sum, app) => {
      const days = (app.statusUpdatedAt! - app.appliedAt) / MS_PER_DAY;
      return sum + Math.max(0, days);
    }, 0);
    avgResponseDays = Math.round(totalDays / respondedWithTimestamps.length);
  }

  return {
    totalApplied,
    interviewConversionRate,
    avgResponseDays,
    applyStreak: computeApplyStreak(applications),
  };
}

export function computeApplicationsOverTime(
  applications: JobApplication[],
  days = 30,
): DailyApplicationCount[] {
  const today = startOfLocalDay(Date.now());
  const counts = new Map<string, number>();

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const dateKey = toDateKey(today - offset * MS_PER_DAY);
    counts.set(dateKey, 0);
  }

  for (const app of applications) {
    const appliedDay = startOfLocalDay(app.appliedAt);
    const dateKey = toDateKey(appliedDay);
    if (!counts.has(dateKey)) {
      continue;
    }

    counts.set(dateKey, (counts.get(dateKey) ?? 0) + 1);
  }

  return Array.from(counts.entries()).map(([date, count]) => ({ date, count }));
}

export function computePortalBreakdown(
  applications: JobApplication[],
): PortalBreakdownEntry[] {
  if (applications.length === 0) {
    return [];
  }

  const counts = new Map<PortalName, number>();

  for (const app of applications) {
    counts.set(app.portal, (counts.get(app.portal) ?? 0) + 1);
  }

  const total = applications.length;

  return Array.from(counts.entries())
    .map(([portal, count]) => ({
      portal,
      label: PORTAL_LABELS[portal],
      count,
      percent: Math.round((count / total) * 100),
    }))
    .sort((left, right) => right.count - left.count);
}

export function computeStatusFunnel(
  applications: JobApplication[],
): StatusFunnelEntry[] {
  const total = applications.length;
  const seenCount = applications.filter((app) => isRespondedStatus(app.status)).length;
  const interviewCount = applications.filter((app) =>
    INTERVIEW_STATUSES.includes(app.status),
  ).length;
  const offerCount = applications.filter((app) => app.status === 'offer').length;

  return [
    { stage: 'Applied', count: total },
    { stage: 'Seen', count: seenCount },
    { stage: 'Interview', count: interviewCount },
    { stage: 'Offer', count: offerCount },
  ];
}

export function computeResponseRate(applications: JobApplication[]): number {
  if (applications.length === 0) {
    return 0;
  }

  const responded = applications.filter((app) => isRespondedStatus(app.status)).length;
  return Math.round((responded / applications.length) * 100);
}

export function computeWeekdayHeatmap(
  applications: JobApplication[],
): WeekdayHeatmapEntry[] {
  const buckets = WEEKDAY_LABELS.map((dayLabel, day) => ({
    day,
    dayLabel,
    applied: 0,
    responded: 0,
    responseRate: 0,
  }));

  for (const app of applications) {
    const weekday = getMondayBasedWeekday(app.appliedAt);
    const bucket = buckets[weekday];
    if (!bucket) {
      continue;
    }

    bucket.applied += 1;
    if (isRespondedStatus(app.status)) {
      bucket.responded += 1;
    }
  }

  for (const bucket of buckets) {
    bucket.responseRate =
      bucket.applied === 0 ? 0 : Math.round((bucket.responded / bucket.applied) * 100);
  }

  return buckets;
}
