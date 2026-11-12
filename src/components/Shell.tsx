"use client";
import { useAuth } from "@/components/AuthProvider";
import { AccountSwitcherMenu } from "@/components/AccountSwitcherMenu";
import GlobalComposer from "@/components/GlobalComposer";
import MoreMenu from "@/components/MoreMenu";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Suspense, useEffect, useRef, useState } from "react";

const NAV = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/explore", label: "Explore", icon: "compass" },
  { href: "/search", label: "Search", icon: "search" },
  { href: "/notifications", label: "Notifications", icon: "bell" },
  { href: "/messages", label: "Messages", icon: "message-circle" },
  { href: "/bookmarks", label: "Bookmarks", icon: "bookmark" },
  { href: "/after-dark", label: "After Dark", icon: "lock" },
  { href: "/profile", label: "Profile", icon: "user-round" },
];

function ShellInner({ children, right }: { children: ReactNode; right?: ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const pathname = usePathname();
  const [profile, setProfile] = useState<{ username?: string; display_name?: string | null; avatar_url?: string | null } | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const supabase = createClient();
      if (!supabase || !user) { if (!cancelled) setProfile(null); return; }
      const { data } = await supabase.from("profiles").select("username,display_name,avatar_url").eq("id", user.id).maybeSingle();
      if (!cancelled) setProfile(data ?? null);
    };
    void run();
    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    function onPointer(event: MouseEvent) {
      if (!accountMenuOpen) return;
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) setAccountMenuOpen(false);
    }
    function onKey(event: KeyboardEvent) { if (event.key === "Escape") setAccountMenuOpen(false); }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onPointer); document.removeEventListener("keydown", onKey); };
  }, [accountMenuOpen]);

  const activeProfile = user ? {
    username: profile?.username ?? (user.user_metadata?.username as string | undefined) ?? null,
    display_name: profile?.display_name ?? null,
    avatar_url: profile?.avatar_url ?? null,
    email: user.email ?? null,
  } : null;

  async function handleSignOut() {
    if (!user) return;
    setSigningOut(true);
    const r = await signOut({ redirectTo: "/signin" });
    setSigningOut(false);
    if (r.error) alert(r.error);
  }

  return (
    <div className="min-h-screen bg-af-bg pb-14 md:pb-0">
      <header className="flex items-center justify-between border-b border-af-border px-4 py-3 md:hidden">
        <Link href="/" className="text-lg font-bold tracking-tight text-af-text"><span className="text-af-brand">After</span>Fur</Link>
        {user ? <Link href={profile?.username ? `/${profile.username}` : "/profile"} aria-label="Your profile" className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-af-surface-2 text-sm font-semibold text-af-brand-soft">
          {profile?.avatar_url ? <Image src={profile.avatar_url} alt="" width={36} height={36} className="h-9 w-9 object-cover" /> : (profile?.display_name || user.email || "?").slice(0, 1).toUpperCase()}
        </Link> : <Link href="/signin" className="text-sm font-semibold text-af-brand-soft">Sign in</Link>}
      </header>
      <div className="mx-auto flex min-h-[calc(100dvh-3.5rem)] max-w-[var(--af-shell-width)] md:min-h-screen">
        <aside className="hidden w-[var(--af-navigation-width)] shrink-0 md:flex">
          <div className="sticky top-0 flex h-screen w-full flex-col border-r border-af-border/70 px-3 py-4 xl:border-0">
            <div className="mb-8 px-2 py-1">
              <Link href="/" className="group flex items-center gap-3 rounded-2xl px-2 py-2 transition-colors hover:bg-af-surface/70">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-af-brand to-af-brand-hover text-lg font-black text-white shadow-lg shadow-af-brand/25">A</span>
                <div><div className="text-lg font-bold tracking-tight text-af-text"><span className="text-af-brand-soft">After</span>Fur</div><div className="text-[11px] uppercase tracking-[0.2em] text-af-muted">Midnight</div></div>
              </Link>
            </div>
            <nav aria-label="Primary navigation" className="flex flex-col gap-1.5">
              {NAV.map((n) => {
                const routeHref = n.href === "/profile" && profile?.username ? `/${profile.username}` : n.href;
                const isActive = pathname === routeHref || (routeHref !== "/" && pathname?.startsWith(`${routeHref}/`));
                return (
                  <Link key={n.href} href={routeHref} aria-current={isActive ? "page" : undefined} className={`group flex min-h-11 items-center gap-3 rounded-2xl px-3 text-[15px] transition-all duration-200 ${isActive ? "bg-af-brand/12 font-semibold text-af-text ring-1 ring-af-brand/25" : "font-medium text-af-text-2 hover:bg-af-surface hover:text-af-text"}`}>
                    <span aria-hidden="true" className={`h-5 w-5 shrink-0 bg-current transition-transform duration-200 ${isActive ? "scale-110 text-af-brand-soft" : "opacity-75 group-hover:scale-105"}`} style={{ maskImage: `url(/icons/afterfur/${n.icon}.svg)`, maskPosition: "center", maskRepeat: "no-repeat", maskSize: "contain" }} />
                    <span className="truncate">{n.label}</span>
                    {isActive && <span className="ml-auto h-2 w-2 rounded-full bg-af-brand-soft" />}
                  </Link>
                );
              })}
            </nav>
            <MoreMenu />
            <button onClick={() => setComposerOpen(true)} className="mx-1 mt-5 min-h-12 rounded-2xl bg-gradient-to-r from-af-brand to-af-accent-hover px-4 text-center text-[15px] font-bold text-white shadow-lg shadow-af-brand/25 transition-all hover:scale-[1.02] hover:shadow-af-brand/35">Create post</button>
            <div className="mt-auto mb-3 px-3" ref={accountMenuRef}>
              {loading ? <div className="text-sm text-af-muted">Checking session…</div> : user ? (
                <div className="relative">
                  <button type="button" onClick={() => setAccountMenuOpen((v) => !v)} aria-label="Account menu" aria-expanded={accountMenuOpen} className="flex w-full items-center gap-2 rounded-lg border border-af-border bg-af-surface/70 p-2 text-left transition-colors hover:bg-af-surface-2">
                    {profile?.avatar_url ? <Image src={profile.avatar_url} alt="" width={40} height={40} className="h-10 w-10 rounded-full object-cover" /> : <div className="flex h-10 w-10 items-center justify-center rounded-full bg-af-brand text-sm font-bold text-white">{(profile?.display_name || profile?.username || user.email || "?").slice(0, 1).toUpperCase()}</div>}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold">{profile?.display_name || profile?.username || user.email?.split("@")[0]}</div>
                      <div className="truncate text-sm text-af-muted">@{profile?.username || user.email?.split("@")[0]}</div>
                    </div>
                    <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-af-muted">…</span>
                  </button>
                  {accountMenuOpen && (
                    <div className="absolute bottom-full left-0 right-0 z-50 mb-2">
                      <AccountSwitcherMenu activeUserId={user.id} activeProfile={activeProfile} onClose={() => setAccountMenuOpen(false)} onSignOut={() => void handleSignOut()} switching={signingOut} />
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <Link href="/signin" className="block rounded-full bg-af-accent py-2 text-center text-[15px] font-bold text-white hover:bg-af-accent-hover">Sign in</Link>
                  <Link href="/signup" className="block text-center text-sm text-af-accent hover:underline">Sign up</Link>
                </div>
              )}
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 border-x border-af-border/80 xl:max-w-[var(--af-content-width)]">{children}</main>
        {right !== undefined && right !== null ? <aside className="hidden w-[var(--af-sidebar-width)] shrink-0 xl:block"><div className="sticky top-0 max-h-screen overflow-y-auto px-4">{right}</div></aside> : null}
      </div>
      <GlobalComposer open={composerOpen} onClose={() => setComposerOpen(false)} />
      <nav aria-label="Mobile navigation" className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t border-af-border bg-af-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {[NAV[0], NAV[1], NAV[2], NAV[3], NAV[7]].map((n) => {
          const href = n.href === "/profile" && profile?.username ? `/${profile.username}` : n.href;
          const active = pathname === href || (href !== "/" && pathname?.startsWith(`${href}/`));
          return <Link key={n.href} href={href} aria-current={active ? "page" : undefined} aria-label={n.label} className={`flex min-h-14 min-w-14 flex-col items-center justify-center gap-1 px-2 text-[10px] transition-colors ${active ? "font-semibold text-af-brand-soft" : "text-af-muted hover:text-af-text"}`}><span aria-hidden="true" className="h-5 w-5 bg-current" style={{ maskImage: `url(/icons/afterfur/${n.icon}.svg)`, maskPosition: "center", maskRepeat: "no-repeat", maskSize: "contain" }} /><span>{n.label}</span></Link>;
        })}
      </nav>
      {user && <button onClick={() => setComposerOpen(true)} aria-label="Create a post" className="fixed bottom-[4.5rem] right-4 z-30 flex h-12 items-center gap-2 rounded-lg bg-af-brand px-4 text-sm font-semibold text-white shadow-lg shadow-black/30 transition-colors hover:bg-af-brand-hover md:hidden"><Image src="/icons/afterfur/file-pen.svg" alt="" aria-hidden="true" width={18} height={18} />Post</button>}
    </div>
  );
}

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="sticky top-0 z-10 border-b border-af-border bg-af-bg/95 px-4 py-4 backdrop-blur-sm sm:px-6">
      <h1 className="text-xl font-bold tracking-tight text-af-text sm:text-2xl">{title}</h1>
      {subtitle && <p className="mt-1 max-w-prose text-sm leading-relaxed text-af-muted">{subtitle}</p>}
    </header>
  );
}

export function Shell({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return <Suspense fallback={<div className="min-h-screen bg-af-bg" />}><ShellInner right={right}>{children}</ShellInner></Suspense>;
}
export function EmptyState({ title, body, action }: { title: string; body: string; action?: { label: string; href: string } }) {
  return (
    <div className="px-6 py-16 text-center sm:px-10">
      <div className="mx-auto max-w-sm">
        <h2 className="text-xl font-bold tracking-tight text-af-text">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-af-muted">{body}</p>
        {action && <Link href={action.href} className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-af-brand px-5 text-sm font-semibold text-white transition-colors hover:bg-af-brand-hover">{action.label}</Link>}
      </div>
    </div>
  );
}
