"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ModBadge, PriorityBadge, StatusBadge } from "@/components/moderation/badges";
import ModActionDialog from "@/components/moderation/ModActionDialog";
import { reasonLabel, targetTypeLabel } from "@/lib/reportMeta";
import { getAuthHeaders } from "@/lib/authHeaders";
import {
  actionLabel,
  formatDateTime,
  shortId,
  type AssignableModerator,
  type ReportDetail,
} from "@/components/moderation/reportTypes";

interface Props {
  reportId: string | null;
  currentUserId: string | null;
  onClose: () => void;
  onChanged: () => void;
}

type Decision = "dismissed" | "actioned";

const MIGRATION_MESSAGE =
  "Moderator database setup is incomplete. Apply the pending moderation migrations (0033, 0034, 0058) to the target database, then reload.";

export default function ReportDetailPanel({ reportId, currentUserId, onClose, onChanged }: Props) {
  const [detail, setDetail] = useState<ReportDetail | null>(null);
  const [moderators, setModerators] = useState<AssignableModerator[]>([]);
  const [assignTarget, setAssignTarget] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [migrationMessage, setMigrationMessage] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [decisionReason, setDecisionReason] = useState("");

  const load = useCallback(async () => {
    if (!reportId) return;
    setLoading(true);
    setError("");
    setMigrationMessage("");
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/moderation/reports/${reportId}`, { headers, cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 503 && (data?.error === "migration_required" || data?.code === "migration_required")) {
          setMigrationMessage(typeof data?.message === "string" && data.message ? data.message : MIGRATION_MESSAGE);
        } else if (res.status === 401 || res.status === 403) {
          setError("You do not have permission to view this report.");
        } else if (res.status === 404) {
          setError("This report could not be found.");
        } else {
          setError("Failed to load the report.");
        }
        setDetail(null);
      } else {
        setDetail(data as ReportDetail);
      }
    } catch {
      setError("Failed to load the report.");
    }
    setLoading(false);
  }, [reportId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    if (!reportId) return;
    let cancelled = false;
    (async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch("/api/moderation/reports/assignable", { headers, cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json().catch(() => ({}));
        if (!cancelled) setModerators(data.moderators ?? []);
      } catch {
        // Assignment list is optional; direct assign-to-self still works.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reportId]);

  useEffect(() => {
    if (!reportId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !decision) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [reportId, decision, onClose]);

  const assign = async (assignedTo: string | null) => {
    if (!reportId) return;
    setAssigning(true);
    setError("");
    try {
      const headers = await getAuthHeaders(true);
      const res = await fetch("/api/moderation/reports", {
        method: "POST",
        headers,
        body: JSON.stringify({ reportId, assignedTo }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          res.status === 403 && data?.error === "assignee_not_moderator"
            ? "The selected user is not an authorised moderator."
            : res.status === 409
              ? "This report has already been actioned."
              : "Failed to assign the report.",
        );
      } else {
        await load();
        onChanged();
      }
    } catch {
      setError("Failed to assign the report.");
    }
    setAssigning(false);
  };

  const updateStatus = async (status: "reviewed", notes?: string) => {
    if (!reportId) return;
    setStatusUpdating(true);
    setError("");
    try {
      const headers = await getAuthHeaders(true);
      const res = await fetch("/api/moderation/reports", {
        method: "PATCH",
        headers,
        body: JSON.stringify({ reportId, status, moderatorNotes: notes?.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          res.status === 409
            ? "This report was updated by another moderator. Reload to see the latest state."
            : res.status === 400 && data?.error === "bad_request"
              ? data.message ?? "Invalid request."
              : "Failed to update the report.",
        );
      } else {
        await load();
        onChanged();
      }
    } catch {
      setError("Failed to update the report.");
    }
    setStatusUpdating(false);
  };

  const submitDecision = async () => {
    if (!reportId || !decision) return;
    if (!decisionReason.trim()) return;
    setStatusUpdating(true);
    setError("");
    try {
      const headers = await getAuthHeaders(true);
      const res = await fetch("/api/moderation/reports", {
        method: "PATCH",
        headers,
        body: JSON.stringify({ reportId, status: decision, moderatorNotes: decisionReason.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          res.status === 409
            ? "This report was already resolved by another moderator."
            : res.status === 400 && data?.error === "bad_request"
              ? data.message ?? "Invalid request."
              : "Failed to resolve the report.",
        );
      } else {
        setDecision(null);
        setDecisionReason("");
        await load();
        onChanged();
      }
    } catch {
      setError("Failed to resolve the report.");
    }
    setStatusUpdating(false);
  };

  const addNote = async () => {
    if (!reportId || !noteDraft.trim()) return;
    setSavingNote(true);
    setError("");
    try {
      const headers = await getAuthHeaders(true);
      const res = await fetch(`/api/moderation/reports/${reportId}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ note: noteDraft.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          res.status === 503 && (data?.error === "migration_required" || data?.code === "migration_required")
            ? MIGRATION_MESSAGE
            : "Failed to save the note.",
        );
      } else {
        setNoteDraft("");
        await load();
        onChanged();
      }
    } catch {
      setError("Failed to save the note.");
    }
    setSavingNote(false);
  };

  if (!reportId) return null;

  const terminal = detail ? detail.report.status === "dismissed" || detail.report.status === "actioned" : false;
  const target = detail?.targetContent ?? null;
  const targetHref =
    target && (target.type === "post" || target.type === "reply")
      ? target.type === "reply" && target.post_id
        ? `/posts/${target.post_id}`
        : `/posts/${target.id}`
      : null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60" onClick={onClose} aria-hidden="true" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Report ${detail ? shortId(detail.report.id) : ""}`}
        className="fixed inset-y-0 right-0 z-40 flex w-full max-w-full flex-col border-l border-af-border bg-af-bg shadow-2xl sm:max-w-xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-af-border bg-af-surface/70 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-af-muted">Report investigation</p>
            <h2 className="truncate text-base font-semibold text-af-text">
              {detail ? `#${shortId(detail.report.id)} · ${reasonLabel(detail.report.reason)}` : "Loading report…"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-9 shrink-0 rounded-md border border-af-border px-3 text-xs font-medium text-af-text-2 hover:bg-af-surface-2"
          >
            Close
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {error && (
            <div role="alert" className="mb-3 rounded-lg border border-af-danger/40 bg-af-danger/10 px-3 py-2 text-xs text-af-danger-soft">
              {error}
            </div>
          )}
          {migrationMessage && (
            <div className="mb-3 rounded-lg border border-af-warning/40 bg-af-warning/10 px-3 py-2 text-xs text-af-warning-soft">
              {migrationMessage}
            </div>
          )}

          {loading && !detail && (
            <div className="space-y-2" aria-busy="true" aria-live="polite">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-lg bg-af-surface-2" />
              ))}
            </div>
          )}

          {detail && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={detail.report.status} />
                <PriorityBadge level={detail.report.priority.level} />
                <ModBadge className="border-af-border/40 bg-af-surface-2 text-af-muted">{targetTypeLabel(detail.report.targetType)}</ModBadge>
                <span className="text-[11px] text-af-muted">Priority is derived from the reason.</span>
              </div>

              <section className="af-detail-panel">
                <div className="grid grid-cols-1 gap-px bg-af-border sm:grid-cols-2">
                  <div className="bg-af-surface px-3 py-2.5 sm:col-span-2">
                    <span className="af-detail-label">Report ID</span>
                    <span className="af-detail-value break-all font-mono text-[11px]">{detail.report.id}</span>
                  </div>
                  <div className="bg-af-surface px-3 py-2.5">
                    <span className="af-detail-label">Reason</span>
                    <span className="af-detail-value">{reasonLabel(detail.report.reason)}</span>
                  </div>
                  <div className="bg-af-surface px-3 py-2.5">
                    <span className="af-detail-label">Submitted</span>
                    <span className="af-detail-value">{formatDateTime(detail.report.createdAt)}</span>
                  </div>
                  <div className="bg-af-surface px-3 py-2.5">
                    <span className="af-detail-label">Assigned moderator</span>
                    <span className="af-detail-value">
                      {detail.assignee ? (
                        <Link href={`/${detail.assignee.username ?? ""}`} className="text-af-brand-soft hover:underline">
                          {detail.assignee.display_name ?? detail.assignee.username ?? "Moderator"}
                        </Link>
                      ) : (
                        "Unassigned"
                      )}
                    </span>
                  </div>
                  <div className="bg-af-surface px-3 py-2.5">
                    <span className="af-detail-label">Resolved by</span>
                    <span className="af-detail-value">
                      {detail.reviewer ? (
                        <Link href={`/${detail.reviewer.username ?? ""}`} className="text-af-brand-soft hover:underline">
                          {detail.reviewer.display_name ?? detail.reviewer.username ?? "Moderator"}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </span>
                  </div>
                </div>
              </section>

              {detail.report.description && (
                <section className="rounded-xl border border-af-border bg-af-surface p-3">
                  <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-af-muted">Reporter explanation</h4>
                  <p className="whitespace-pre-wrap text-sm text-af-text-2">{detail.report.description}</p>
                </section>
              )}

              <section className="grid gap-3 sm:grid-cols-2">
                <ProfileCard title="Reporter" profile={detail.reporter} />
                <ProfileCard title="Reported user" profile={detail.reportedUser} />
              </section>

              {target && (
                <section className="rounded-xl border border-af-border bg-af-surface p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-af-muted">
                      Reported {targetTypeLabel(target.type).toLowerCase()}
                    </h4>
                    {targetHref && (
                      <Link href={targetHref} className="text-xs font-medium text-af-brand-soft hover:underline">
                        Open content →
                      </Link>
                    )}
                  </div>
                  {typeof target.content === "string" && (
                    <p className="whitespace-pre-wrap text-sm text-af-text">{target.content}</p>
                  )}
                  {target.type === "user" && (
                    <p className="text-sm text-af-text">
                      {detail.reportedUser?.display_name ?? detail.reportedUser?.username ?? "Account"}
                      {detail.reportedUser?.username ? ` (@${detail.reportedUser.username})` : ""}
                    </p>
                  )}
                  {Array.isArray(target.media_urls) && target.media_urls.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {target.media_urls.slice(0, 4).map((url, i) => (
                        <img key={`${url}-${i}`} src={url} alt="" className="h-16 w-16 rounded-md object-cover ring-1 ring-af-border" />
                      ))}
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-af-muted">
                    {target.moderation_status && (
                      <ModBadge className="border-af-border/40 bg-af-surface-2 text-af-muted">Content: {target.moderation_status}</ModBadge>
                    )}
                    {target.classification && <span>Classification: {target.classification}</span>}
                    <span>·</span>
                    <span>Created {formatDateTime(target.created_at ?? null)}</span>
                  </div>
                </section>
              )}

              <section>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-af-muted">Previous moderation actions</h4>
                {detail.actions.length === 0 ? (
                  <p className="text-xs text-af-muted">No previous moderation actions recorded.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {detail.actions.map((a) => (
                      <li key={a.id} className="rounded-lg border border-af-border/60 bg-af-surface px-3 py-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-medium text-af-text">{actionLabel(a.action)}</span>
                          <span className="text-[11px] text-af-muted">{formatDateTime(a.createdAt)}</span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-af-muted">
                          by {a.actorDisplayName ?? a.actorUsername ?? "system"}
                          {a.details?.moderator_notes ? ` · ${String(a.details.moderator_notes)}` : ""}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="rounded-xl border border-af-warning/30 bg-af-warning/[0.04] p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-af-warning-soft">Internal moderator notes</h4>
                  <span className="text-[10px] uppercase tracking-wide text-af-muted">Staff only</span>
                </div>
                <p className="mb-2 text-[11px] text-af-muted">
                  Notes are internal and never shown to the reporter. They are preserved when the report status changes.
                </p>
                {detail.notes.length === 0 ? (
                  <p className="mb-2 text-xs text-af-muted">No internal notes yet.</p>
                ) : (
                  <ul className="mb-2 space-y-1.5">
                    {detail.notes.map((n) => (
                      <li key={n.id} className="rounded-lg border border-af-border/60 bg-af-surface px-3 py-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[11px] font-medium text-af-text-2">
                            {n.authorDisplayName ?? n.authorUsername ?? "Moderator"}
                          </span>
                          <span className="text-[11px] text-af-muted">{formatDateTime(n.createdAt)}</span>
                        </div>
                        <p className="mt-0.5 whitespace-pre-wrap text-xs text-af-text">{n.body}</p>
                      </li>
                    ))}
                  </ul>
                )}
                <textarea
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  rows={3}
                  maxLength={2000}
                  placeholder="Add an internal note for other moderators…"
                  className="af-field w-full resize-y px-3 py-2 text-sm"
                  aria-label="Internal note"
                />
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={addNote}
                    disabled={savingNote || !noteDraft.trim()}
                    className="min-h-9 rounded-md bg-af-brand px-3 text-xs font-semibold text-white hover:bg-af-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {savingNote ? "Saving…" : "Add note"}
                  </button>
                </div>
              </section>
            </div>
          )}
        </div>

        {detail && (
          <footer className="border-t border-af-border bg-af-surface/70 px-4 py-3">
            {terminal ? (
              <p className="text-xs text-af-muted">
                This report is {detail.report.status} and is now closed. Its history and internal notes remain available above.
              </p>
            ) : (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => assign(currentUserId)}
                    disabled={assigning || statusUpdating || !currentUserId || detail.report.assignedTo === currentUserId}
                    className="min-h-9 rounded-md border border-af-border bg-af-surface px-3 text-xs font-medium text-af-text-2 hover:bg-af-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {assigning ? "Assigning…" : detail.report.assignedTo === currentUserId ? "Assigned to you" : "Assign to me"}
                  </button>

                  <div className="flex min-w-[180px] flex-1 items-center gap-2">
                    <select
                      value={assignTarget}
                      onChange={(e) => setAssignTarget(e.target.value)}
                      aria-label="Assign to another moderator"
                      className="af-field min-h-9 flex-1 px-2 text-xs"
                    >
                      <option value="">Assign to another moderator…</option>
                      {moderators
                        .filter((m) => m.id !== currentUserId)
                        .map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.displayName ?? m.username} (@{m.username}) · {m.role.replace(/_/g, " ")}
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => assign(assignTarget)}
                      disabled={!assignTarget || assigning || statusUpdating}
                      className="min-h-9 rounded-md border border-af-border bg-af-surface px-3 text-xs font-medium text-af-text-2 hover:bg-af-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Assign
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => updateStatus("reviewed")}
                    disabled={statusUpdating || detail.report.status === "reviewed"}
                    className="min-h-9 rounded-md border border-af-border bg-af-surface px-3 text-xs font-medium text-af-text-2 hover:bg-af-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {statusUpdating ? "Updating…" : detail.report.status === "reviewed" ? "Under review" : "Mark under review"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDecision("actioned");
                      setDecisionReason("");
                    }}
                    className="min-h-9 rounded-md bg-af-brand px-3 text-xs font-semibold text-white hover:bg-af-brand-hover"
                  >
                    Resolve
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDecision("dismissed");
                      setDecisionReason("");
                    }}
                    className="min-h-9 rounded-md border border-af-border bg-af-surface px-3 text-xs font-medium text-af-text-2 hover:bg-af-surface-2"
                  >
                    Dismiss
                  </button>
                </div>
                <p className="text-[11px] text-af-muted">Resolving or dismissing requires an internal reason.</p>
              </div>
            )}
          </footer>
        )}
      </aside>

      <ModActionDialog
        open={decision !== null}
        title={decision === "dismissed" ? "Dismiss report" : "Resolve report"}
        description={
          decision === "dismissed"
            ? "Dismiss this report when no violation is found. The reporter will not see this note."
            : "Resolve this report when action has been completed. The reporter will not see this note."
        }
        confirmLabel={decision === "dismissed" ? "Confirm dismiss" : "Confirm resolve"}
        variant={decision === "dismissed" ? "primary" : "success"}
        loading={statusUpdating}
        disabled={!decisionReason.trim()}
        onClose={() => {
          if (!statusUpdating) {
            setDecision(null);
            setDecisionReason("");
          }
        }}
        onConfirm={submitDecision}
      >
        <div>
          <label className="mb-1 block text-xs font-medium text-af-muted" htmlFor="decision-reason">
            Reason (required, internal)
          </label>
          <textarea
            id="decision-reason"
            value={decisionReason}
            onChange={(e) => setDecisionReason(e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder="Explain the decision for the moderation record…"
            className="af-field w-full resize-y px-3 py-2 text-sm"
          />
        </div>
      </ModActionDialog>
    </>
  );
}

function ProfileCard({ title, profile }: { title: string; profile: ReportDetail["reporter"] }) {
  return (
    <div className="rounded-xl border border-af-border bg-af-surface p-3">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-af-muted">{title}</h4>
      {profile ? (
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-af-surface-2 ring-1 ring-af-border">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs font-bold text-af-text-2">
                {(profile.display_name || profile.username || "?").slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0">
            {profile.username ? (
              <Link href={`/${profile.username}`} className="block truncate text-sm font-medium text-af-brand-soft hover:underline">
                {profile.display_name ?? profile.username}
              </Link>
            ) : (
              <span className="block truncate text-sm text-af-text">{profile.display_name ?? "Unknown"}</span>
            )}
            {profile.username && <span className="block truncate text-xs text-af-muted">@{profile.username}</span>}
            {profile.bio && <span className="mt-0.5 line-clamp-2 block text-[11px] text-af-muted">{profile.bio}</span>}
          </div>
        </div>
      ) : (
        <p className="text-xs text-af-muted">Not available.</p>
      )}
    </div>
  );
}