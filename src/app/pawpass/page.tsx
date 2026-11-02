"use client";

import { useEffect, useState } from "react";
import { Shell, PageHeader, EmptyState } from "@/components/Shell";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { loadMyMembershipStatus, type MembershipStatus } from "@/lib/pawpass";
import Link from "next/link";

export default function PawPassPage() {
  const { user } = useAuth();
  const [status, setStatus] = useState<MembershipStatus | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [boosts, setBoosts] = useState<{ remaining: number; used: number; limit: number } | null>(null);
  const [folderCount, setFolderCount] = useState<number | null>(null);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase || !user) { setLoading(false); return; }
    let cancelled = false;
    void loadMyMembershipStatus(supabase).then(({ status: s, error: e }) => {
      if (cancelled) return;
      if (e) setError(e);
      else setStatus(s);
      const active = !!s && (s.status === "active" || s.status === "cancel_at_period_end") && !!s.currentPeriodEnd && new Date(s.currentPeriodEnd).getTime() > Date.now();
      if (active) {
        void (supabase as any).rpc("get_boost_allowance").then(({ data }: { data: { remaining: number; used: number; limit: number } | null }) => {
          if (!cancelled && data) setBoosts({ remaining: data.remaining, used: data.used, limit: data.limit });
        });
        void (supabase as any).from("bookmark_folders").select("id", { count: "exact", head: true }).eq("user_id", user.id).then(({ count }: { count: number | null }) => {
          if (!cancelled) setFolderCount(count);
        });
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [user]);

  if (!user) {
    return (
      <Shell>
        <PageHeader title="PawPass" subtitle="Membership benefits and status." />
        <EmptyState title="Sign in required" body="Sign in to view your PawPass membership." action={{ label: "Sign in", href: "/signin" }} />
      </Shell>
    );
  }

  const active = !!status && (status.status === "active" || status.status === "cancel_at_period_end") && !!status.currentPeriodEnd && new Date(status.currentPeriodEnd).getTime() > Date.now();

  return (
    <Shell>
      <PageHeader title="PawPass" subtitle="Membership benefits, status and usage." />
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6">
        <section className="rounded-2xl border border-af-border bg-af-surface p-5 shadow-sm sm:p-6">
          <h2 className="text-base font-semibold text-af-text">Membership status</h2>
          {loading ? (
            <p className="mt-3 text-sm text-af-muted">Checking membership…</p>
          ) : error ? (
            <p role="alert" className="mt-3 text-sm text-af-danger">{error}</p>
          ) : status ? (
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <dt className="text-af-muted">Status</dt><dd className="text-af-text">{status.status}</dd>
              <dt className="text-af-muted">Source</dt><dd className="text-af-text">{status.source}{status.isTest ? " (test)" : ""}</dd>
              <dt className="text-af-muted">Active</dt><dd className="text-af-text">{active ? "Yes" : "No"}</dd>
              <dt className="text-af-muted">Member since</dt><dd className="text-af-text">{status.eligibleSince ? new Date(status.eligibleSince).toLocaleDateString() : "—"}</dd>
              <dt className="text-af-muted">Anniversary</dt><dd className="text-af-text">{status.eligibleSince ? new Date(status.eligibleSince).toLocaleDateString(undefined, { month: "long", day: "numeric" }) : "—"}</dd>
              <dt className="text-af-muted">Boosts used</dt><dd className="text-af-text">{boosts ? boosts.used : "—"}</dd>
              <dt className="text-af-muted">Boosts remaining</dt><dd className="text-af-text">{boosts ? `${boosts.remaining} / ${boosts.limit}` : "—"}</dd>
              <dt className="text-af-muted">Renewal</dt><dd className="text-af-text">Monthly</dd>
            </dl>
          ) : (
            <p className="mt-3 text-sm text-af-muted">No PawPass membership connected to this account.</p>
          )}
        </section>

        <section className="rounded-2xl border border-af-border bg-af-surface p-5 shadow-sm sm:p-6">
          <h2 className="text-base font-semibold text-af-text">Benefits</h2>
          <ul className="mt-3 space-y-2 text-sm text-af-text-2">
            <li>Profile customisation and GIF support {active ? "(available)" : "(locked)"}</li>
            <li>Increased post and media limits {active ? "(available)" : "(locked)"}</li>
            <li>Bookmark folders: {active ? `${folderCount ?? 0} / 20 used` : "(locked)"}</li>
            <li>Monthly Discovery Boosts: {active ? `${boosts ? `${boosts.remaining} remaining` : "loading"}` : "(locked)"}</li>
            <li>Advanced search filters {active ? "(available)" : "(locked)"}</li>
            <li>Creator analytics {active ? "(available)" : "(locked)"}</li>
            <li>Membership recognition and anniversary badges {active ? "(available)" : "(locked)"}</li>
          </ul>
          <p className="mt-4 text-xs text-af-muted">Boosts renew monthly. Bookmark folders are private to your account. Some benefits require active membership.</p>
        </section>

        <div className="flex flex-wrap gap-2">
          <Link href="/settings" className="af-action-secondary">Membership settings</Link>
          <Link href="/edit-profile" className="af-action-secondary">Edit profile</Link>
        </div>
      </div>
    </Shell>
  );
}