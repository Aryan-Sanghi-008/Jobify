import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import Spinner from '@/popup/components/Spinner';
import {
  computeApplicationsOverTime,
  computePortalBreakdown,
  computeResponseRate,
  computeStatusFunnel,
  computeTopMetrics,
  computeWeekdayHeatmap,
  hasEnoughDataForAnalytics,
} from '@/shared/analytics';
import { getApplications } from '@/shared/storage';
import type { JobApplication } from '@/shared/types';

const CHART_COLORS = [
  '#2563eb',
  '#f97316',
  '#16a34a',
  '#9333ea',
  '#0ea5e9',
  '#6366f1',
  '#14b8a6',
  '#6b7280',
];

interface MetricCardProps {
  label: string;
  value: string;
}

function MetricCard({ label, value }: MetricCardProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-2 text-center">
      <p className="text-lg font-semibold text-gray-900">{value}</p>
      <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">
        {label}
      </p>
    </div>
  );
}

function formatAvgResponseDays(days: number | null): string {
  if (days === null) {
    return '—';
  }

  return `${days} day${days === 1 ? '' : 's'}`;
}

function getHeatmapColor(responseRate: number, hasApplications: boolean): string {
  if (!hasApplications) {
    return 'bg-gray-100';
  }

  if (responseRate >= 75) {
    return 'bg-green-500';
  }

  if (responseRate >= 50) {
    return 'bg-green-300';
  }

  if (responseRate >= 25) {
    return 'bg-amber-300';
  }

  if (responseRate > 0) {
    return 'bg-orange-200';
  }

  return 'bg-red-100';
}

export default function Analytics() {
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const apps = await getApplications();
      setApplications(apps);
      setIsLoading(false);
    })();
  }, []);

  const metrics = useMemo(() => computeTopMetrics(applications), [applications]);
  const timeSeries = useMemo(
    () => computeApplicationsOverTime(applications, 30),
    [applications],
  );
  const portalBreakdown = useMemo(
    () => computePortalBreakdown(applications),
    [applications],
  );
  const statusFunnel = useMemo(
    () => computeStatusFunnel(applications),
    [applications],
  );
  const responseRate = useMemo(
    () => computeResponseRate(applications),
    [applications],
  );
  const weekdayHeatmap = useMemo(
    () => computeWeekdayHeatmap(applications),
    [applications],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner size="md" className="text-blue-600" />
      </div>
    );
  }

  if (!hasEnoughDataForAnalytics(applications)) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
        <p className="text-sm font-medium text-gray-900">
          Log at least 11 applications to unlock analytics.
        </p>
        <p className="mt-2 text-xs text-gray-500">
          Keep applying and check the Tracker tab — analytics will appear automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 px-3 py-3">
      <div className="grid grid-cols-2 gap-2">
        <MetricCard
          label="Total applied"
          value={String(metrics.totalApplied)}
        />
        <MetricCard
          label="Interview conversion"
          value={`${metrics.interviewConversionRate}%`}
        />
        <MetricCard
          label="Avg time to response"
          value={formatAvgResponseDays(metrics.avgResponseDays)}
        />
        <MetricCard
          label="Current streak"
          value={`${metrics.applyStreak} day${metrics.applyStreak === 1 ? '' : 's'}`}
        />
      </div>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Applications over time
        </h2>
        <div className="mt-2 h-36 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={timeSeries} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 9 }}
                tickFormatter={(value: string) => value.slice(5)}
                interval="preserveStartEnd"
              />
              <YAxis allowDecimals={false} tick={{ fontSize: 9 }} width={24} />
              <Tooltip
                contentStyle={{ fontSize: 11 }}
                labelFormatter={(label) => `Date: ${label}`}
              />
              <Line
                type="monotone"
                dataKey="count"
                stroke="#2563eb"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Portal breakdown
        </h2>
        <div className="mt-2 h-40 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={portalBreakdown}
                dataKey="count"
                nameKey="label"
                cx="50%"
                cy="50%"
                outerRadius={58}
                label={(props) => {
                  const percent = props.percent ?? 0;
                  return percent >= 0.08 ? `${Math.round(percent * 100)}%` : '';
                }}
                labelLine={false}
              >
                {portalBreakdown.map((entry, index) => (
                  <Cell
                    key={entry.portal}
                    fill={CHART_COLORS[index % CHART_COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip contentStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-gray-600">
          {portalBreakdown.map((entry, index) => (
            <li key={entry.portal} className="flex items-center gap-1">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{
                  backgroundColor: CHART_COLORS[index % CHART_COLORS.length],
                }}
              />
              {entry.label} ({entry.percent}%)
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Status funnel
        </h2>
        <div className="mt-2 h-36 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={statusFunnel} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="stage" tick={{ fontSize: 9 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 9 }} width={24} />
              <Tooltip contentStyle={{ fontSize: 11 }} />
              <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Response rate
        </h2>
        <p className="mt-1 text-2xl font-semibold text-gray-900">{responseRate}%</p>
        <p className="text-[11px] text-gray-500">
          Share of applications that reached at least Seen
        </p>
      </section>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Best day to apply
        </h2>
        <p className="mt-1 text-[11px] text-gray-500">
          Response rate by day you applied (Mon–Sun)
        </p>
        <div className="mt-2 grid grid-cols-7 gap-1">
          {weekdayHeatmap.map((entry) => (
            <div key={entry.day} className="text-center">
              <div
                title={`${entry.dayLabel}: ${entry.applied} applied, ${entry.responseRate}% response rate`}
                className={`mx-auto flex h-10 w-full items-center justify-center rounded-md text-[10px] font-semibold text-gray-800 ${getHeatmapColor(entry.responseRate, entry.applied > 0)}`}
              >
                {entry.applied > 0 ? `${entry.responseRate}%` : '—'}
              </div>
              <p className="mt-1 text-[10px] text-gray-500">{entry.dayLabel}</p>
            </div>
          ))}
        </div>
      </section>

      <p className="pb-2 text-center text-[10px] text-gray-400">
        All analytics computed locally. No data leaves your device.
      </p>
    </div>
  );
}
