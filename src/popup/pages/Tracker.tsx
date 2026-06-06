import { useEffect, useMemo, useState } from 'react';
import {
  getApplications,
  updateApplicationNotes,
  updateApplicationStatus,
} from '@/shared/storage';
import type { ApplicationStatus, JobApplication, PortalName } from '@/shared/types';

type StatusFilter = 'all' | ApplicationStatus;
type SortOrder = 'newest' | 'oldest';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * MS_PER_DAY;

const INPUT_CLASS =
  'w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

const STATUS_ORDER: ApplicationStatus[] = [
  'applied',
  'seen',
  'interview',
  'rejected',
  'offer',
];

const STATUS_CONFIG: Record<
  ApplicationStatus,
  { label: string; badgeClass: string }
> = {
  applied: { label: 'Applied', badgeClass: 'bg-blue-100 text-blue-800' },
  seen: { label: 'Seen', badgeClass: 'bg-purple-100 text-purple-800' },
  interview: { label: 'Interview', badgeClass: 'bg-amber-100 text-amber-800' },
  rejected: { label: 'Rejected', badgeClass: 'bg-red-100 text-red-800' },
  offer: { label: 'Offer', badgeClass: 'bg-green-100 text-green-800' },
};

const PORTAL_CONFIG: Record<PortalName, { label: string; badgeClass: string }> = {
  linkedin: { label: 'LinkedIn', badgeClass: 'bg-blue-100 text-blue-800' },
  naukri: { label: 'Naukri', badgeClass: 'bg-orange-100 text-orange-800' },
  wellfound: { label: 'Wellfound', badgeClass: 'bg-gray-800 text-white' },
  instahyre: { label: 'Instahyre', badgeClass: 'bg-teal-100 text-teal-800' },
  greenhouse: { label: 'Greenhouse', badgeClass: 'bg-green-100 text-green-800' },
  lever: { label: 'Lever', badgeClass: 'bg-indigo-100 text-indigo-800' },
  workday: { label: 'Workday', badgeClass: 'bg-sky-100 text-sky-800' },
  generic: { label: 'Other', badgeClass: 'bg-gray-100 text-gray-700' },
};

function formatRelativeDate(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffDays = Math.floor(diffMs / MS_PER_DAY);

  if (diffDays <= 0) {
    return 'Today';
  }

  if (diffDays === 1) {
    return 'Yesterday';
  }

  if (diffDays < 7) {
    return `${diffDays} days ago`;
  }

  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function truncateNote(note: string, maxLength = 80): string {
  if (note.length <= maxLength) {
    return note;
  }

  return `${note.slice(0, maxLength).trimEnd()}…`;
}

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

interface FiltersBarProps {
  searchQuery: string;
  statusFilter: StatusFilter;
  sortOrder: SortOrder;
  onSearchChange: (value: string) => void;
  onStatusFilterChange: (value: StatusFilter) => void;
  onSortOrderChange: (value: SortOrder) => void;
}

function FiltersBar({
  searchQuery,
  statusFilter,
  sortOrder,
  onSearchChange,
  onStatusFilterChange,
  onSortOrderChange,
}: FiltersBarProps) {
  return (
    <div className="space-y-2">
      <input
        type="search"
        value={searchQuery}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder="Search company or role"
        className={INPUT_CLASS}
      />
      <div className="grid grid-cols-2 gap-2">
        <select
          value={statusFilter}
          onChange={(event) => onStatusFilterChange(event.target.value as StatusFilter)}
          className={INPUT_CLASS}
        >
          <option value="all">All</option>
          <option value="applied">Applied</option>
          <option value="interview">Interview</option>
          <option value="rejected">Rejected</option>
          <option value="offer">Offer</option>
        </select>
        <select
          value={sortOrder}
          onChange={(event) => onSortOrderChange(event.target.value as SortOrder)}
          className={INPUT_CLASS}
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
      </div>
    </div>
  );
}

interface StatusDropdownProps {
  currentStatus: ApplicationStatus;
  isOpen: boolean;
  onToggle: () => void;
  onSelect: (status: ApplicationStatus) => void;
}

function StatusDropdown({
  currentStatus,
  isOpen,
  onToggle,
  onSelect,
}: StatusDropdownProps) {
  const config = STATUS_CONFIG[currentStatus];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${config.badgeClass}`}
      >
        {config.label}
      </button>
      {isOpen ? (
        <div className="absolute right-0 top-full z-20 mt-1 min-w-[120px] rounded-md border border-gray-200 bg-white py-1 shadow-lg">
          {STATUS_ORDER.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => onSelect(status)}
              className={`block w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50 ${
                status === currentStatus ? 'font-semibold text-gray-900' : 'text-gray-700'
              }`}
            >
              {STATUS_CONFIG[status].label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

interface ApplicationCardProps {
  app: JobApplication;
  isEditingNote: boolean;
  isStatusMenuOpen: boolean;
  onOpenUrl: (url: string) => void;
  onToggleStatusMenu: () => void;
  onStatusSelect: (status: ApplicationStatus) => void;
  onStartEditNote: () => void;
  onSaveNote: (notes: string) => void;
  onCancelEditNote: () => void;
}

function ApplicationCard({
  app,
  isEditingNote,
  isStatusMenuOpen,
  onOpenUrl,
  onToggleStatusMenu,
  onStatusSelect,
  onStartEditNote,
  onSaveNote,
  onCancelEditNote,
}: ApplicationCardProps) {
  const [draftNote, setDraftNote] = useState(app.notes ?? '');
  const portal = PORTAL_CONFIG[app.portal];

  useEffect(() => {
    if (isEditingNote) {
      setDraftNote(app.notes ?? '');
    }
  }, [isEditingNote, app.notes]);

  return (
    <article className="group rounded-lg border border-gray-200 bg-white p-3 transition-colors hover:border-gray-300">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => onOpenUrl(app.url)}
            className="truncate text-left text-sm font-semibold text-gray-900 hover:text-blue-700"
          >
            {app.company}
          </button>
          <p className="truncate text-xs text-gray-600">{app.role}</p>
        </div>
        <StatusDropdown
          currentStatus={app.status}
          isOpen={isStatusMenuOpen}
          onToggle={onToggleStatusMenu}
          onSelect={onStatusSelect}
        />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${portal.badgeClass}`}
        >
          {portal.label}
        </span>
        <span className="text-[11px] text-gray-500">{formatRelativeDate(app.appliedAt)}</span>
      </div>

      {app.notes && !isEditingNote ? (
        <p className="mt-2 text-xs leading-relaxed text-gray-600">
          {truncateNote(app.notes)}
        </p>
      ) : null}

      {isEditingNote ? (
        <div className="mt-2">
          <textarea
            value={draftNote}
            rows={3}
            onChange={(event) => setDraftNote(event.target.value)}
            onBlur={() => onSaveNote(draftNote)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                onCancelEditNote();
              }
            }}
            className={`${INPUT_CLASS} resize-y text-xs`}
            placeholder="Add a note about this application"
            autoFocus
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={onStartEditNote}
          className="mt-2 text-[11px] font-medium text-blue-600 opacity-0 transition-opacity hover:text-blue-800 group-hover:opacity-100"
        >
          {app.notes ? 'Edit note' : 'Add note'}
        </button>
      )}
    </article>
  );
}

export default function Tracker() {
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [openStatusMenuId, setOpenStatusMenuId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const apps = await getApplications();
      setApplications(apps);
      setIsLoading(false);
    })();
  }, []);

  const summaryStats = useMemo(() => {
    const total = applications.length;
    const interviewCount = applications.filter((app) => app.status === 'interview').length;
    const interviewRate = total === 0 ? 0 : Math.round((interviewCount / total) * 100);
    const weekAgo = Date.now() - WEEK_MS;
    const thisWeek = applications.filter((app) => app.appliedAt >= weekAgo).length;

    return {
      total,
      interviewRate,
      thisWeek,
    };
  }, [applications]);

  const filteredApplications = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    let result = applications.filter((app) => {
      if (query) {
        const matchesCompany = app.company.toLowerCase().includes(query);
        const matchesRole = app.role.toLowerCase().includes(query);
        if (!matchesCompany && !matchesRole) {
          return false;
        }
      }

      if (statusFilter !== 'all' && app.status !== statusFilter) {
        return false;
      }

      return true;
    });

    result = [...result].sort((left, right) => {
      if (sortOrder === 'newest') {
        return right.appliedAt - left.appliedAt;
      }

      return left.appliedAt - right.appliedAt;
    });

    return result;
  }, [applications, searchQuery, statusFilter, sortOrder]);

  const handleStatusSelect = async (appId: string, status: ApplicationStatus) => {
    await updateApplicationStatus(appId, status);
    setApplications((current) =>
      current.map((app) => (app.id === appId ? { ...app, status } : app)),
    );
    setOpenStatusMenuId(null);
  };

  const handleSaveNote = async (appId: string, notes: string) => {
    await updateApplicationNotes(appId, notes);
    setApplications((current) =>
      current.map((app) => (app.id === appId ? { ...app, notes } : app)),
    );
    setEditingNoteId(null);
  };

  const handleOpenUrl = (url: string) => {
    if (!url) {
      return;
    }

    void chrome.tabs.create({ url });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-r-transparent" />
      </div>
    );
  }

  if (applications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
        <p className="text-sm text-gray-600">
          No applications yet. Start applying and they&apos;ll appear here automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 px-3 py-3">
      <div className="grid grid-cols-3 gap-2">
        <MetricCard label="Total applied" value={String(summaryStats.total)} />
        <MetricCard label="Interview rate" value={`${summaryStats.interviewRate}%`} />
        <MetricCard label="This week" value={String(summaryStats.thisWeek)} />
      </div>

      <FiltersBar
        searchQuery={searchQuery}
        statusFilter={statusFilter}
        sortOrder={sortOrder}
        onSearchChange={setSearchQuery}
        onStatusFilterChange={setStatusFilter}
        onSortOrderChange={setSortOrder}
      />

      {filteredApplications.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500">
          No applications match your filters.
        </p>
      ) : (
        <div className="space-y-2">
          {filteredApplications.map((app) => (
            <ApplicationCard
              key={app.id}
              app={app}
              isEditingNote={editingNoteId === app.id}
              isStatusMenuOpen={openStatusMenuId === app.id}
              onOpenUrl={handleOpenUrl}
              onToggleStatusMenu={() =>
                setOpenStatusMenuId((current) => (current === app.id ? null : app.id))
              }
              onStatusSelect={(status) => void handleStatusSelect(app.id, status)}
              onStartEditNote={() => {
                setOpenStatusMenuId(null);
                setEditingNoteId(app.id);
              }}
              onSaveNote={(notes) => void handleSaveNote(app.id, notes)}
              onCancelEditNote={() => setEditingNoteId(null)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
