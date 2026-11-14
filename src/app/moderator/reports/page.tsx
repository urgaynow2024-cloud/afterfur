"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PageHeader, Shell } from "@/components/Shell";
import { ModBadge } from "@/components/moderation/badges";
import ModStatCard from "@/components/moderation/ModStatCard";
import ReportList from "@/components/moderation/ReportList";
import ReportDetailPanel from "@/components/moderation/ReportDetailPanel";
import { useAuth } from "@/components/AuthProvider";
import { getAuthHeaders } from "@/lib/authHeaders";
import { REPORT_REASONS, REPORT_STATUSES, REPORT_TARGET_TYPES, isUuid } from "@/lib/reportMeta";
import type { ReportListItem } from "@/components/moderation/reportTypes";

type Stats = {
  pending: number;
  underReview: number;
  actioned: number;
  dismissed: number;
  total: number;
};

const EMPTY_STATS: Stats = { pending: 0, underReview: 0, actioned: 0, dismissed: 0, total: 0 };
const PAGE_SIZES = [20, 50];

export default function ReportsPage() {
  const { user } = useAuth();
  const [reports, setReports] = useState<ReportListItem[]>([]);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [targetType, setTargetType] = useState<string | null>(null);
  const [priority, setPriority] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest" | "priority">("newest");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statsError, setStatsError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const requestId = useRef(0);

  // Honour status deep-links from the dashboard and report deep-links from
  // moderation notifications (e.g. /moderator/reports?report=<id>).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialStatus = params.get("status");
    const reportParam = params.get("report") ?? params.get("id");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (initialStatus && REPORT_STATUSES.some((s) => s.value === initialStatus)) setStatus(initialStatus);
    if (reportParam && isUuid(reportParam)) setSelectedId(reportParam);
  }, []);

  const fetchReports = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      const headers = await getAuthHeaders();
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      params.set("sort", sort);
      if (status) params.set("status", status);
      if (reason) params.set("reason", reason);
      if (targetType) params.set("target_type", targetType);
      if (priority) params.set("priority", priority);
      if (dateFrom) params.set("dateFrom", new Date(`${dateFrom}T00:00:00`).toISOString());
      if (dateTo) params.set("dateTo", new Date(`${dateTo}T23:59:59`).toISOString());
      if (search) params.set("search", search);

      const res = await fetch(`/api/moderation/reports?${params}`, { headers, cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (id !== requestId.current) return;
      if (!res.ok) {
        if (res.status === 503 && (data?.error === "migration_required" || data?.code === "migration_required")) {
          setError(typeof data?.message === "string" && data.message ? data.message : "Moderator database setup is incomplete.");
        } else if (res.status === 401 || res.status === 403) {
          setError("You do not have permission to view reports.");
        } else {
          setError("Failed to load reports.");
        }
        setReports([]);
        setTotal(0);
      } else {
        setReports(data.reports ?? []);
        setTotal(data.total ?? 0);
      }
    } catch {
      if (id === requestId.current) setError("Failed to load reports.");
    }
    if (id === requestId.current) setLoading(false);
  }, [page, pageSize, status, reason, targetType, priority, dateFrom, dateTo, search, sort]);

  const fetchStats = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/moderation/dashboard-stats", { headers, cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setStats({
          pending: data.pendingReports ?? 0,
          underReview: data.underReviewReports ?? 0,
          actioned: data.actionedReports ?? 0,
          dismissed: data.dismissedReports ?? 0,
          total: data.totalReports ?? 0,
        });
        setStatsError("");
      } else if (res.status === 401 || res.status === 403) {
        setStatsError("Statistics unavailable.");
      } else {
        setStatsError("Statistics unavailable.");
      }
    } catch {
      setStatsError("Statistics unavailable.");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchReports();
  }, [fetchReports]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchStats();
  }, [fetchStats]);

  const refresh = useCallback(() => {
    void fetchReports();
    void fetchStats();
  }, [fetchReports, fetchStats]);

  const applyFilter = <T,>(setter: (v: T) => void) => (value: T) => {
    setter(value);
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const statCards = [
    { label: "Pending", value: stats.pending, subtitle: "Awaiting review", accent: "warning" as const },
    { label: "Under review", value: stats.underReview, subtitle: "Assigned / in review", accent: "brand" as const },
    { label: "Actioned", value: stats.actioned, subtitle: "Action completed", accent: "brand" as const },
    { label: "Dismissed", value: stats.dismissed, subtitle: "No action taken", accent: "muted" as const },
    { label: "Total", value: stats.total, subtitle: "All reports", accent: "muted" as const },
  ];

  return (
    <Shell>
      <PageHeader title="Reports Management" subtitle="Investigate, assign and resolve user-submitted reports." />

      <div className="space-y-4 px-4 py-4 sm:px-5">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {statCards.map((card) => (
            <ModStatCard key={card.label} label={card.label} value={card.value} subtitle={card.subtitle} accent={card.accent} />
          ))}
        </div>
        {statsError && <p className="text-xs text-af-warning-soft">{statsError}</p>}

        <form
          className="af-filter-bar"
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(searchInput.trim());
            setPage(1);
          }}
        >
          <div className="af-filter-group min-w-[200px] flex-1">
            <label className="af-filter-label" htmlFor="report-search">
              Search
            </label>
            <div className="flex gap-2">
              <input
                id="report-search"
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Username, reported user or report ID"
                className="af-field min-h-10 w-full px-3 text-sm"
              />
              <button type="submit" className="min-h-10 rounded-md bg-af-brand px-3 text-xs font-semibold text-white hover:bg-af-brand-hover">
                Search
              </button>
            </div>
          </div>

          <div className="af-filter-group">
            <label className="af-filter-label" htmlFor="filter-status">
              Status
            </label>
            <select id="filter-status" value={status ?? ""} onChange={(e) => applyFilter(setStatus)(e.target.value || null)} className="af-field min-h-10 px-2 text-sm">
              <option value="">All statuses</option>
              {REPORT_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div className="af-filter-group">
            <label className="af-filter-label" htmlFor="filter-reason">
              Reason
            </label>
            <select id="filter-reason" value={reason ?? ""} onChange={(e) => applyFilter(setReason)(e.target.value || null)} className="af-field min-h-10 px-2 text-sm">
              <option value="">All reasons</option>
              {REPORT_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <div className="af-filter-group">
            <label className="af-filter-label" htmlFor="filter-target">
              Content type
            </label>
            <select id="filter-target" value={targetType ?? ""} onChange={(e) => applyFilter(setTargetType)(e.target.value || null)} className="af-field min-h-10 px-2 text-sm">
              <option value="">All content</option>
              {REPORT_TARGET_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div className="af-filter-group">
            <label className="af-filter-label" htmlFor="filter-priority">
              Priority
            </label>
            <select id="filter-priority" value={priority ?? ""} onChange={(e) => applyFilter(setPriority)(e.target.value || null)} className="af-field min-h-10 px-2 text-sm">
              <option value="">All priorities</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          <div className="af-filter-group">
            <label className="af-filter-label" htmlFor="filter-from">
              From
            </label>
            <input id="filter-from" type="date" value={dateFrom} onChange={(e) => applyFilter(setDateFrom)(e.target.value)} className="af-field min-h-10 px-2 text-sm" />
          </div>

          <div className="af-filter-group">
            <label className="af-filter-label" htmlFor="filter-to">
              To
            </label>
            <input id="filter-to" type="date" value={dateTo} onChange={(e) => applyFilter(setDateTo)(e.target.value)} className="af-field min-h-10 px-2 text-sm" />
          </div>

          <div className="af-filter-group">
            <label className="af-filter-label" htmlFor="filter-sort">
              Sort
            </label>
            <select id="filter-sort" value={sort} onChange={(e) => applyFilter(setSort)(e.target.value as typeof sort)} className="af-field min-h-10 px-2 text-sm">
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="priority">Priority</option>
            </select>
          </div>
        </form>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-af-muted">
          <div className="flex flex-wrap items-center gap-2">
            <span>
              Showing {reports.length} of {total} report{total === 1 ? "" : "s"}
            </span>
            {(status || reason || targetType || priority || dateFrom || dateTo || search) && (
              <button
                type="button"
                onClick={() => {
                  setStatus(null);
                  setReason(null);
                  setTargetType(null);
                  setPriority(null);
                  setDateFrom("");
                  setDateTo("");
                  setSearch("");
                  setSearchInput("");
                  setPage(1);
                }}
                className="rounded-md border border-af-border px-2 py-1 text-[11px] text-af-text-2 hover:bg-af-surface-2"
              >
                Clear filters
              </button>
            )}
          </div>
          <ModBadge className="border-af-border/40 bg-af-surface-2 text-af-muted">Priority is derived from reason</ModBadge>
        </div>

        {error ? (
          <div role="alert" className="rounded-xl border border-af-danger/40 bg-af-danger/10 px-4 py-6 text-center text-sm text-af-danger-soft">
            {error}
          </div>
        ) : (
          <ReportList
            reports={reports}
            loading={loading}
            onOpen={(r) => setSelectedId(r.id)}
            emptyTitle={search || status || reason || targetType || priority || dateFrom || dateTo ? "No matching reports" : "No reports"}
            emptyBody={
              search || status || reason || targetType || priority || dateFrom || dateTo
                ? "Try adjusting your search or filters."
                : "There are no reports to review right now."
            }
          />
        )}

        {totalPages > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <div className="flex items-center gap-2">
              <label htmlFor="page-size" className="text-xs text-af-muted">
                Per page
              </label>
              <select
                id="page-size"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="af-field min-h-9 px-2 text-xs"
              >
                {PAGE_SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="min-h-9 rounded-md border border-af-border px-3 text-xs text-af-text-2 hover:bg-af-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-xs text-af-muted">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="min-h-9 rounded-md border border-af-border px-3 text-xs text-af-text-2 hover:bg-af-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      <ReportDetailPanel
        key={selectedId ?? "none"}
        reportId={selectedId}
        currentUserId={user?.id ?? null}
        onClose={() => setSelectedId(null)}
        onChanged={refresh}
      />
    </Shell>
  );
}