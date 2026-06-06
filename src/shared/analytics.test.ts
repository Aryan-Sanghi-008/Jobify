import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  computeApplicationsOverTime,
  computeApplyStreak,
  computePortalBreakdown,
  computeResponseRate,
  computeStatusFunnel,
  computeTopMetrics,
  computeWeekdayHeatmap,
  hasEnoughDataForAnalytics,
} from '@/shared/analytics';
import type { JobApplication } from '@/shared/types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function makeApplication(
  overrides: Partial<JobApplication> = {},
): JobApplication {
  return {
    id: 'app-1',
    company: 'Acme',
    role: 'Engineer',
    portal: 'linkedin',
    url: 'https://example.com',
    appliedAt: Date.now(),
    status: 'applied',
    ...overrides,
  };
}

describe('hasEnoughDataForAnalytics', () => {
  it('requires more than 10 applications', () => {
    expect(hasEnoughDataForAnalytics([])).toBe(false);
    expect(
      hasEnoughDataForAnalytics(
        Array.from({ length: 10 }, (_, index) =>
          makeApplication({ id: `app-${index}` }),
        ),
      ),
    ).toBe(false);
    expect(
      hasEnoughDataForAnalytics(
        Array.from({ length: 11 }, (_, index) =>
          makeApplication({ id: `app-${index}` }),
        ),
      ),
    ).toBe(true);
  });
});

describe('computeStatusFunnel', () => {
  it('builds cumulative funnel counts from current status', () => {
    const funnel = computeStatusFunnel([
      makeApplication({ id: '1', status: 'applied' }),
      makeApplication({ id: '2', status: 'seen' }),
      makeApplication({ id: '3', status: 'interview' }),
      makeApplication({ id: '4', status: 'offer' }),
      makeApplication({ id: '5', status: 'rejected' }),
    ]);

    expect(funnel).toEqual([
      { stage: 'Applied', count: 5 },
      { stage: 'Seen', count: 3 },
      { stage: 'Interview', count: 2 },
      { stage: 'Offer', count: 1 },
    ]);
  });
});

describe('computeResponseRate', () => {
  it('counts seen, interview, and offer as responses', () => {
    const rate = computeResponseRate([
      makeApplication({ status: 'applied' }),
      makeApplication({ id: '2', status: 'seen' }),
      makeApplication({ id: '3', status: 'rejected' }),
      makeApplication({ id: '4', status: 'offer' }),
    ]);

    expect(rate).toBe(50);
  });
});

describe('computePortalBreakdown', () => {
  it('returns portal percentages', () => {
    const breakdown = computePortalBreakdown([
      makeApplication({ portal: 'linkedin' }),
      makeApplication({ id: '2', portal: 'linkedin' }),
      makeApplication({ id: '3', portal: 'naukri' }),
    ]);

    expect(breakdown[0]?.portal).toBe('linkedin');
    expect(breakdown[0]?.percent).toBe(67);
    expect(breakdown[1]?.portal).toBe('naukri');
    expect(breakdown[1]?.percent).toBe(33);
  });
});

describe('computeTopMetrics', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('computes interview conversion and average response days', () => {
    const now = Date.UTC(2026, 5, 5, 12, 0, 0);
    vi.setSystemTime(now);

    const metrics = computeTopMetrics([
      makeApplication({
        appliedAt: now - 10 * MS_PER_DAY,
        status: 'seen',
        statusUpdatedAt: now - 7 * MS_PER_DAY,
      }),
      makeApplication({
        id: '2',
        appliedAt: now - 5 * MS_PER_DAY,
        status: 'interview',
        statusUpdatedAt: now - 2 * MS_PER_DAY,
      }),
      makeApplication({
        id: '3',
        appliedAt: now - 1 * MS_PER_DAY,
        status: 'applied',
      }),
    ]);

    expect(metrics.totalApplied).toBe(3);
    expect(metrics.interviewConversionRate).toBe(33);
    expect(metrics.avgResponseDays).toBe(3);
  });
});

describe('computeApplyStreak', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts consecutive apply days ending today', () => {
    const today = new Date(2026, 5, 5, 12, 0, 0);
    vi.setSystemTime(today);

    const streak = computeApplyStreak([
      makeApplication({ appliedAt: today.getTime() }),
      makeApplication({
        id: '2',
        appliedAt: today.getTime() - MS_PER_DAY,
      }),
      makeApplication({
        id: '3',
        appliedAt: today.getTime() - 3 * MS_PER_DAY,
      }),
    ]);

    expect(streak).toBe(2);
  });

  it('returns zero when today has no applications', () => {
    const today = new Date(2026, 5, 5, 12, 0, 0);
    vi.setSystemTime(today);

    const streak = computeApplyStreak([
      makeApplication({ appliedAt: today.getTime() - MS_PER_DAY }),
    ]);

    expect(streak).toBe(0);
  });
});

describe('computeApplicationsOverTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fills missing days with zero counts', () => {
    const today = new Date(2026, 5, 5, 12, 0, 0);
    vi.setSystemTime(today);

    const series = computeApplicationsOverTime(
      [makeApplication({ appliedAt: today.getTime() })],
      3,
    );

    expect(series).toHaveLength(3);
    expect(series[2]?.count).toBe(1);
    expect(series[0]?.count).toBe(0);
    expect(series[1]?.count).toBe(0);
  });
});

describe('computeWeekdayHeatmap', () => {
  it('aggregates applications and response rates by weekday', () => {
    const monday = new Date(2026, 5, 1, 12, 0, 0);
    const tuesday = new Date(2026, 5, 2, 12, 0, 0);

    const heatmap = computeWeekdayHeatmap([
      makeApplication({ appliedAt: monday.getTime(), status: 'seen' }),
      makeApplication({ id: '2', appliedAt: monday.getTime(), status: 'applied' }),
      makeApplication({ id: '3', appliedAt: tuesday.getTime(), status: 'offer' }),
    ]);

    expect(heatmap[0]?.applied).toBe(2);
    expect(heatmap[0]?.responded).toBe(1);
    expect(heatmap[0]?.responseRate).toBe(50);
    expect(heatmap[1]?.applied).toBe(1);
    expect(heatmap[1]?.responseRate).toBe(100);
  });
});
