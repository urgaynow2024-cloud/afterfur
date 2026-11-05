"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader, Shell } from "@/components/Shell";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";

type ModPrefs = {
  queueAutoRefresh: boolean;
  notifyNewReports: boolean;
  notifyNewAppeals: boolean;
  showResolvedReports: boolean;
  itemsPerPage: number;
};

const DEFAULT_PREFS: ModPrefs = {
  queueAutoRefresh: true,
  notifyNewReports: true,
  notifyNewAppeals: true,
  showResolvedReports: false,
  itemsPerPage: 20,
};

export default function SettingsPage() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<ModPrefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const fetchPrefs = useCallback(async () => {
    const supabase = createClient();
    if (!supabase) { setLoading(false); return; }
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) { setLoading(false); return; }
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      // Use ui preferences stored via existing RPC, or fall back to local state
      const { data, error: rpcError } = await supabase.rpc("get_my_ui_preferences", {});
      if (!rpcError && data) {
        const stored = data as Record<string, unknown>;
        setPrefs({
          queueAutoRefresh: Boolean(stored.queue_auto_refresh ?? DEFAULT_PREFS.queueAutoRefresh),
          notifyNewReports: Boolean(stored.notify_new_reports ?? DEFAULT_PREFS.notifyNewReports),
          notifyNewAppeals: Boolean(stored.notify_new_appeals ?? DEFAULT_PREFS.notifyNewAppeals),
          showResolvedReports: Boolean(stored.show_resolved_reports ?? DEFAULT_PREFS.showResolvedReports),
          itemsPerPage: Number(stored.items_per_page ?? DEFAULT_PREFS.itemsPerPage),
        });
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { void fetchPrefs(); }, [fetchPrefs]);

  const savePrefs = async () => {
    const supabase = createClient();
    if (!supabase) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) { setSaving(false); return; }
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const payload = {
        queue_auto_refresh: prefs.queueAutoRefresh,
        notify_new_reports: prefs.notifyNewReports,
        notify_new_appeals: prefs.notifyNewAppeals,
        show_resolved_reports: prefs.showResolvedReports,
        items_per_page: prefs.itemsPerPage,
      };

      const res = await fetch("/api/moderation/settings", {
        method: "PUT",
        headers,
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setMessage("Settings saved.");
      } else {
        setError("Failed to save settings.");
      }
    } catch { setError("Failed to save settings."); }
    setSaving(false);
  };

  if (loading) {
    return (
      <Shell>
        <PageHeader title="Moderator Settings" />
        <div className="p-8 text-center text-af-muted">Loading settings…</div>
      </Shell>
    );
  }

  return (
    <Shell>
      <PageHeader title="Moderator Settings" subtitle="Configure your moderation queue and notification preferences." />

      {error && <div className="mb-4 rounded-md border border-af-danger/40 bg-af-danger/10 p-3 text-sm text-af-danger">{error}</div>}
      {message && <div className="mb-4 rounded-md border border-af-brand/40 bg-af-brand/10 p-3 text-sm text-af-brand">{message}</div>}

      <div className="space-y-6">
        <section className="rounded-xl border border-af-border bg-af-surface p-4 sm:p-5">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-af-muted">Queue preferences</h3>
          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={prefs.queueAutoRefresh}
                onChange={(e) => setPrefs({ ...prefs, queueAutoRefresh: e.target.checked })}
                className="rounded border-af-brand text-af-brand focus:ring-af-brand"
              />
              <span className="text-sm text-af-text">Auto-refresh report queue</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={prefs.showResolvedReports}
                onChange={(e) => setPrefs({ ...prefs, showResolvedReports: e.target.checked })}
                className="rounded border-af-brand text-af-brand focus:ring-af-brand"
              />
              <span className="text-sm text-af-text">Show resolved reports in queue</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <span className="text-sm text-af-text">Items per page</span>
                <select
                  value={prefs.itemsPerPage}
                  onChange={(e) => setPrefs({ ...prefs, itemsPerPage: parseInt(e.target.value, 10) })}
                  className="af-field rounded-md border border-af-border bg-af-surface px-3 py-1.5 text-sm"
                >
                  {[10, 20, 50, 100].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
            </label>
          </div>
        </section>

        <section className="rounded-xl border border-af-border bg-af-surface p-4 sm:p-5">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-af-muted">Notification preferences</h3>
          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={prefs.notifyNewReports}
                onChange={(e) => setPrefs({ ...prefs, notifyNewReports: e.target.checked })}
                className="rounded border-af-brand text-af-brand focus:ring-af-brand"
              />
              <span className="text-sm text-af-text">Notify on new reports</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={prefs.notifyNewAppeals}
                onChange={(e) => setPrefs({ ...prefs, notifyNewAppeals: e.target.checked })}
                className="rounded border-af-brand text-af-brand focus:ring-af-brand"
              />
              <span className="text-sm text-af-text">Notify on new appeals</span>
            </label>
          </div>
        </section>

        <div className="flex gap-3">
          <button
            onClick={savePrefs}
            disabled={saving}
            className="min-h-10 rounded-md bg-af-brand px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save settings"}
          </button>
        </div>
      </div>
    </Shell>
  );
}
