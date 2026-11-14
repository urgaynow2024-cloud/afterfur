"use client";

import { ModBadge, PriorityBadge, StatusBadge } from "@/components/moderation/badges";
import ModTable, { type ModColumn } from "@/components/moderation/ModTable";
import { reasonLabel, targetTypeLabel } from "@/lib/reportMeta";
import { formatDate, shortId, type ReportListItem } from "@/components/moderation/reportTypes";

interface Props {
  reports: ReportListItem[];
  loading: boolean;
  onOpen: (report: ReportListItem) => void;
  emptyTitle?: string;
  emptyBody?: string;
}

function ReporterLine({ report }: { report: ReportListItem }) {
  const name = report.reporter_display_name ?? report.reporter_username ?? "Unknown";
  return (
    <span className="inline-flex min-w-0 flex-col">
      <span className="truncate text-sm text-af-text">{name}</span>
      {report.reporter_username && <span className="truncate text-xs text-af-muted">@{report.reporter_username}</span>}
    </span>
  );
}

function AssigneeLine({ report }: { report: ReportListItem }) {
  if (!report.assigned_to) return <span className="text-xs text-af-muted">Unassigned</span>;
  return (
    <span className="inline-flex min-w-0 flex-col">
      <span className="truncate text-sm text-af-text-2">{report.assignee_display_name ?? report.assignee_username ?? "Moderator"}</span>
      {report.assignee_username && <span className="truncate text-xs text-af-muted">@{report.assignee_username}</span>}
    </span>
  );
}

export default function ReportList({ reports, loading, onOpen, emptyTitle = "No reports", emptyBody = "There are no reports matching your filters." }: Props) {
  const columns: ModColumn<ReportListItem>[] = [
    {
      key: "reason",
      header: "Report",
      render: (r) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium text-af-text">{reasonLabel(r.reason)}</span>
          <span className="truncate font-mono text-[11px] text-af-muted">#{shortId(r.id)}</span>
        </span>
      ),
    },
    {
      key: "target",
      header: "Reported",
      render: (r) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm text-af-text-2">{targetTypeLabel(r.target_type)}</span>
          <span className="truncate font-mono text-[11px] text-af-muted">#{shortId(r.target_id)}</span>
        </span>
      ),
    },
    { key: "reporter", header: "Reporter", render: (r) => <ReporterLine report={r} /> },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "priority", header: "Priority", render: (r) => <PriorityBadge level={r.priority.level} /> },
    { key: "assignee", header: "Assignee", render: (r) => <AssigneeLine report={r} /> },
    { key: "created_at", header: "Submitted", render: (r) => <span className="text-xs text-af-muted">{formatDate(r.created_at)}</span> },
    {
      key: "actions",
      header: "",
      align: "right",
      className: "col-actions",
      render: () => <span className="text-xs font-medium text-af-brand-soft">Review →</span>,
    },
  ];

  if (loading) {
    return (
      <div className="rounded-xl border border-af-border bg-af-surface p-4" aria-busy="true" aria-live="polite">
        <div className="mb-3 flex items-center gap-2 text-sm text-af-muted">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-af-border border-t-af-brand" aria-hidden="true" />
          Loading reports…
        </div>
        <div className="space-y-2" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-af-surface-2" />
          ))}
        </div>
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <div className="rounded-xl border border-af-border bg-af-surface px-4 py-12 text-center">
        <h3 className="text-sm font-semibold text-af-text">{emptyTitle}</h3>
        <p className="mx-auto mt-1 max-w-sm text-xs text-af-muted">{emptyBody}</p>
      </div>
    );
  }

  return (
    <>
      {/* Desktop / tablet: structured table */}
      <div className="hidden overflow-hidden rounded-xl border border-af-border bg-af-surface md:block">
        <ModTable
          data={reports}
          columns={columns}
          keyExtractor={(r) => r.id}
          onRowClick={onOpen}
          rowClassName={() => "cursor-pointer"}
          emptyMessage={emptyBody}
        />
      </div>

      {/* Mobile: compact cards */}
      <ul className="space-y-2 md:hidden">
        {reports.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => onOpen(r)}
              className="w-full rounded-xl border border-af-border bg-af-surface p-3 text-left transition-colors hover:bg-af-surface-2"
            >
              <div className="flex items-center justify-between gap-2">
                <StatusBadge status={r.status} />
                <PriorityBadge level={r.priority.level} />
              </div>
              <p className="mt-2 truncate text-sm font-medium text-af-text">{reasonLabel(r.reason)}</p>
              {r.description && <p className="mt-0.5 line-clamp-2 text-xs text-af-text-2">{r.description}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-af-muted">
                <ModBadge className="border-af-border/40 bg-af-surface-2 text-af-muted">{targetTypeLabel(r.target_type)}</ModBadge>
                <span className="truncate">
                  by {r.reporter_display_name ?? r.reporter_username ?? "Unknown"}
                  {r.reporter_username ? ` (@${r.reporter_username})` : ""}
                </span>
                <span aria-hidden="true">·</span>
                <span>{formatDate(r.created_at)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-af-muted">
                <span className="truncate">
                  {r.assigned_to ? `Assigned to ${r.assignee_display_name ?? r.assignee_username ?? "moderator"}` : "Unassigned"}
                </span>
                <span className="font-medium text-af-brand-soft">Review →</span>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}