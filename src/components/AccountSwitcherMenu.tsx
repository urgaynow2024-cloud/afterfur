"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { emitAccountSwitched, readSavedAccounts, removeSavedAccount, restoreAccountSession, signOutAccount, type SavedAccountMeta } from "@/lib/accountSessions";

function initials(account: Pick<SavedAccountMeta, "displayName" | "username" | "email">) {
  return (account.displayName || account.username || account.email || "?").slice(0, 1).toUpperCase();
}

export function AccountSwitcherMenu({
  activeUserId,
  activeProfile,
  onClose,
  onSignOut,
  switching,
}: {
  activeUserId: string;
  activeProfile: { username?: string | null; display_name?: string | null; avatar_url?: string | null; email?: string | null } | null;
  onClose: () => void;
  onSignOut: () => void;
  switching: boolean;
}) {
  const [accounts, setAccounts] = useState<SavedAccountMeta[]>([]);
  const [manage, setManage] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => { setAccounts(readSavedAccounts()); }, [activeUserId, manage]);

  const others = useMemo(() => accounts.filter((a) => a.userId !== activeUserId), [accounts, activeUserId]);

  async function onSwitch(userId: string) {
    setBusyId(userId); setError("");
    const result = await restoreAccountSession(userId);
    setBusyId(null);
    if (!result.ok) {
      setError(result.message || "Session expired. Please sign in again.");
      return;
    }
    emitAccountSwitched(userId);
    onClose();
  }

  async function onRemove(userId: string) {
    setBusyId(userId);
    await signOutAccount(userId);
    setAccounts(readSavedAccounts());
    setBusyId(null);
  }

  return (
    <div className="w-[min(21rem,calc(100vw-1.5rem))] rounded-xl border border-af-border bg-af-surface p-2 shadow-xl shadow-black/30">
      <div className="px-2 py-1.5"><div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-af-muted">Accounts</div></div>

      <div className="mb-1 flex items-center gap-2.5 rounded-lg border border-af-border/70 bg-af-surface-2/45 px-2 py-2">
        {activeProfile?.avatar_url ? (
          <Image src={activeProfile.avatar_url} alt="" width={32} height={32} className="h-8 w-8 rounded-full object-cover" />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-af-brand text-xs font-bold text-white">{initials({ displayName: activeProfile?.display_name, username: activeProfile?.username, email: activeProfile?.email })}</div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-af-text">{activeProfile?.display_name || activeProfile?.username || activeProfile?.email?.split("@")[0] || "Current account"}</div>
          <div className="truncate text-xs text-af-muted">@{activeProfile?.username || activeProfile?.email?.split("@")[0] || "account"}</div>
        </div>
        <span aria-label="Active account" title="Active account" className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-af-brand/15 text-[11px] text-af-brand-soft">✓</span>
      </div>

      {error ? <p role="alert" className="mx-1 mb-1 rounded-md border border-af-danger/30 bg-af-danger/10 px-2 py-1.5 text-xs text-af-danger">{error} <Link href={`/signin?switch=${encodeURIComponent(others[0]?.userId || "")}&reauth=1`} className="underline" onClick={onClose}>Sign in</Link></p> : null}

      {others.length > 0 ? (
        <div className="mb-1 max-h-48 overflow-y-auto">
          {others.map((account) => (
            <div key={account.userId} className="flex items-center gap-1 rounded-lg px-1 py-0.5 transition-colors hover:bg-af-surface-2">
              <button type="button" disabled={Boolean(busyId) || switching} onClick={() => void onSwitch(account.userId)} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-2 py-2 text-left disabled:opacity-60">
                {account.avatarUrl ? (
                  <Image src={account.avatarUrl} alt="" width={32} height={32} className="h-8 w-8 rounded-full object-cover" />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-af-surface-raised text-xs font-semibold text-af-brand-soft ring-1 ring-af-border">{initials(account)}</div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-af-text">{account.displayName || account.username || account.email?.split("@")[0] || "Saved account"}</div>
                  <div className="truncate text-xs text-af-muted">@{account.username || account.email?.split("@")[0] || "account"}{account.sessionStatus === "expired" ? " · needs sign-in" : ""}</div>
                </div>
                {busyId === account.userId ? <span className="text-[11px] text-af-muted">…</span> : null}
              </button>
              {manage ? (
                <button type="button" disabled={Boolean(busyId)} onClick={() => void onRemove(account.userId)} className="mr-1 rounded-md px-2 py-1 text-xs text-af-danger hover:bg-af-danger/10" aria-label={`Remove ${account.displayName || account.username || "saved account"}`}>Remove</button>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="px-3 py-2 text-xs text-af-muted">No other saved accounts on this device.</div>
      )}

      <div className="my-1 border-t border-af-border/70" />
      <Link href="/signin?mode=add" onClick={onClose} className="block rounded-md px-3 py-2 text-sm text-af-text-2 transition-colors hover:bg-af-surface-2 hover:text-af-text">Add an existing account</Link>
      <button type="button" onClick={() => setManage((v) => !v)} className="block w-full rounded-md px-3 py-2 text-left text-sm text-af-text-2 transition-colors hover:bg-af-surface-2 hover:text-af-text">{manage ? "Done managing accounts" : "Manage accounts"}</button>
      <div className="my-1 border-t border-af-border/70" />
      <Link href={activeProfile?.username ? `/${activeProfile.username}` : "/profile"} onClick={onClose} className="block rounded-md px-3 py-2 text-sm text-af-text-2 transition-colors hover:bg-af-surface-2 hover:text-af-text">View profile</Link>
      <Link href="/settings" onClick={onClose} className="block rounded-md px-3 py-2 text-sm text-af-text-2 transition-colors hover:bg-af-surface-2 hover:text-af-text">Settings and privacy</Link>
      <button type="button" disabled={switching} onClick={() => { onClose(); onSignOut(); }} className="block w-full rounded-md px-3 py-2 text-left text-sm text-af-text-2 transition-colors hover:bg-af-surface-2 hover:text-af-text disabled:opacity-60">{switching ? "Signing out…" : "Log out"}</button>
      <p className="px-3 pb-1 pt-1 text-[11px] leading-relaxed text-af-muted">Authenticated accounts stay saved on this device. Expired or revoked sessions need sign-in again.</p>
    </div>
  );
}
