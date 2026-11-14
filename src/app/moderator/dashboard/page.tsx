"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader, Shell } from "@/components/Shell";
import { createClient } from "@/lib/supabase/client";

type StatCard = { label: string; value: number | string; subtitle: string; color: string };

export default function DashboardPage() {
  const [stats, setStats] = useState({
    pendingReports: 0, reviewedReports: 0, dismissedReports: 0, actionedReports: 0, totalReports: 0, pendingAppeals: 0,
  });
  const [recentReports, setRecentReports] = useState<Array<{ id: string; target_type: string; reason: string; status: string; created_at: string }>>([]);
  const [recentEnforcements, setRecentEnforcements] = useState<Array<{ id: string; type: string; reason: string; created_at: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [setupMessage, setSetupMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      if (!supabase) { setLoading(false); return; }
      try {
        const { data: userData } = await supabase.auth.getUser();
        if (!userData?.user) { setLoading(false); return; }
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;
        const headers: Record<string, string> = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const res = await fetch("/api/moderation/dashboard-stats", { headers });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;

        if (res.ok) {
          setStats({
            pendingReports: data.pendingReports ?? 0,
            reviewedReports: data.underReviewReports ?? 0,
            dismissedReports: data.dismissedReports ?? 0,
            actionedReports: data.actionedReports ?? 0,
            totalReports: data.totalReports ?? 0,
            pendingAppeals: data.pendingAppeals ?? 0,
          });
          setRecentReports(data.recentReports ?? []);
          setRecentEnforcements(data.recentEnforcements ?? []);
        } else if (res.status === 503 && (data?.error === "migration_required" || data?.code === "migration_required")) {
          // Required DB migrations are missing — show actionable admin setup message.
          // Do NOT display fake/zero statistics.
          setSetupMessage(typeof data?.message === "string" && data.message ? data.message : "Moderator database setup is incomplete. Apply required migrations (0033, 0034) to the target database, then reload.");
        } else if (res.status === 401 || res.status === 403) {
          setError("You do not have permission to view moderator dashboard statistics.");
        } else {
          setError("Failed to load dashboard statistics.");
        }
      } catch {
        if (!cancelled) setError("Failed to load dashboard statistics.");
      }
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  const statCards: StatCard[] = [
    { label: "Pending reports", value: stats.pendingReports, subtitle: "Awaiting review", color: "text-af-brand-soft" },
    { label: "Reviewed reports", value: stats.reviewedReports, subtitle: "Assigned/in review", color: "text-af-text-2" },
    { label: "Dismissed reports", value: stats.dismissedReports, subtitle: "No action taken", color: "text-af-muted" },
    { label: "Actioned reports", value: stats.actionedReports, subtitle: "Action completed", color: "text-af-brand" },
    { label: "Pending appeals", value: stats.pendingAppeals, subtitle: "Awaiting decision", color: "text-af-warning-soft" },
    { label: "Total reports", value: stats.totalReports, subtitle: "All time", color: "text-af-text" },
  ];

  if (loading) return (<Shell><PageHeader title="Moderator Dashboard" /><div className="p-8 text-center text-af-muted">Loading dashboard...</div></Shell>);
  if (setupMessage) {
    return (
      <Shell>
        <PageHeader title="Moderator Dashboard" subtitle="Overview of reports, enforcement actions and appeals." />
        <div className="rounded-xl border border-af-warning/40 bg-af-warning/10 p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-af-warning-soft">Database setup required</h2>
          <p className="mt-2 text-sm text-af-text-2">{setupMessage}</p>
          <p className="mt-3 text-xs text-af-muted">Statistics are not shown until the required database tables are available. No production migrations are applied automatically.</p>
        </div>
      </Shell>
    );
  }
  if (error) return (<Shell><PageHeader title="Moderator Dashboard" /><div className="p-8 text-center text-af-danger">{error}</div></Shell>);

  return (
    <Shell>
      <PageHeader title="Moderator Dashboard" subtitle="Overview of reports, enforcement actions and appeals." />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {statCards.map((card) => (
          <div key={card.label} className="rounded-xl border border-af-border bg-af-surface p-4 sm:p-5">
            <p className="text-xs font-medium uppercase tracking-[0.1em] text-af-muted">{card.label}</p>
            <p className={`mt-1 text-2xl font-bold ${card.color}`}>{card.value}</p>
            <p className="text-xs text-af-muted">{card.subtitle}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-af-border bg-af-surface p-4 sm:p-5 lg:col-span-2">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-af-muted">Reports awaiting review</h3>
          <div className="space-y-2">
            {recentReports.filter((r) => r.status === "pending").slice(0, 8).map((r) => (
              <Link key={r.id} href="/moderator/reports?status=pending" className="flex items-center justify-between gap-3 rounded-lg border border-af-border/50 bg-af-surface-2 px-3 py-2 hover:bg-af-surface">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-af-text">{r.reason}</p>
                  <p className="truncate text-xs text-af-muted">{r.target_type} · {new Date(r.created_at).toLocaleDateString()}</p>
                </div>
                <span className="text-xs font-medium text-af-brand-soft">Pending</span>
              </Link>
            ))}
            {recentReports.filter((r) => r.status === "pending").length === 0 && <p className="text-xs text-af-muted">No pending reports.</p>}
          </div>
        </div>

        <div className="rounded-xl border border-af-border bg-af-surface p-4 sm:p-5">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-af-muted">Recent enforcement actions</h3>
          <div className="space-y-2">
            {recentEnforcements.slice(0, 8).map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 rounded-lg border border-af-border/50 bg-af-surface-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-af-text">{e.reason}</p>
                  <p className="truncate text-xs text-af-muted">{e.type} · {new Date(e.created_at).toLocaleDateString()}</p>
                </div>
                <span className={`text-xs font-medium ${e.type === "ban" ? "text-af-danger-soft" : e.type === "suspension" ? "text-af-warning-soft" : "text-af-brand-soft"}`}>{e.type}</span>
              </div>
            ))}
            {recentEnforcements.length === 0 && <p className="text-xs text-af-muted">No recent enforcement actions.</p>}
          </div>
        </div>

        <div className="rounded-xl border border-af-border bg-af-surface p-4 sm:p-5 lg:col-span-2">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-af-muted">Quick actions</h3>
          <div className="grid gap-2 sm:grid-cols-3">
            <Link href="/moderator/reports?status=pending" className="flex min-h-10 items-center justify-center rounded-md border border-af-border bg-af-surface px-4 text-sm font-medium text-af-text hover:bg-af-surface-2">Review pending reports</Link>
            <Link href="/moderator/appeals?status=pending" className="flex min-h-10 items-center justify-center rounded-md border border-af-border bg-af-surface px-4 text-sm font-medium text-af-text hover:bg-af-surface-2">Review pending appeals</Link>
            <Link href="/moderator/audit-logs" className="flex min-h-10 items-center justify-center rounded-md border border-af-border bg-af-surface px-4 text-sm font-medium text-af-text hover:bg-af-surface-2">View audit log</Link>
          </div>
        </div>
      </div>
    </Shell>
  );
}
