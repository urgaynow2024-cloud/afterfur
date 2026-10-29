"use client";
import { useAuth } from "@/components/AuthProvider";
import GlobalComposer from "@/components/GlobalComposer";
import MoreMenu from "@/components/MoreMenu";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Suspense } from "react";

const NAV = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/explore", label: "Explore", icon: "compass" },
  { href: "/search", label: "Search", icon: "search" },
  { href: "/notifications", label: "Notifications", icon: "bell" },
  { href: "/messages", label: "Messages", icon: "message-circle" },
  { href: "/bookmarks", label: "Bookmarks", icon: "bookmark" },
  { href: "/after-dark", label: "After Dark", icon: "lock" },
  { href: "/profile", label: "Profile", icon: "user-round" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

function ShellInner({ children, right }: { children: ReactNode; right?: ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const pathname = usePathname();
  const [profile, setProfile] = useState<{ username?: string; display_name?: string | null; avatar_url?: string | null } | null>(() => (user && profileCache.has(user.id)) ? profileCache.get(user.id) ?? null : null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  useEffect(() => {
    const run = async () => {
      const supabase = createClient();
      if (!supabase || !user) { setProfile(null); return; }
      if (profileCache.has(user.id)) { setProfile(profileCache.get(user.id) ?? null); return; }
      const { data } = await supabase.from("profiles").select("username,display_name,avatar_url").eq("id", user.id).maybeSingle();
      if (data) profileCache.set(user.id, data);
      setProfile(data);
    };
    run();
  }, [user]);

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
            <div className="mb-7 px-3 py-2">
              <Link href="/" className="flex items-center gap-2">
                <div className="text-xl font-bold tracking-tight">
                  <span className="text-af-brand">After</span>Fur
                </div>
              </Link>
              <div className="mt-0.5 text-xs text-af-muted">Social media, after dark.</div>
            </div>
            <nav aria-label="Primary navigation" className="flex flex-col gap-1">
              {NAV.map((n) => {
                const routeHref = n.href === "/profile" && profile?.username ? `/${profile.username}` : n.href;
                const isActive = pathname === routeHref || (routeHref !== "/" && pathname?.startsWith(`${routeHref}/`));
                return (
                  <Link
                    key={n.href}
                    href={routeHref}
                    aria-current={isActive ? "page" : undefined}
                    className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-[15px] transition-colors ${
  isActive ? "bg-af-surface-2 font-semibold text-af-text" : "font-medium text-af-text-2 hover:bg-af-surface hover:text-af-text"
}`}
                  >
                    <span aria-hidden="true" className="h-5 w-5 shrink-0 bg-current opacity-75" style={{ maskImage: `url(/icons/afterfur/${n.icon}.svg)`, maskPosition: "center", maskRepeat: "no-repeat", maskSize: "contain" }} />
                    {n.label}
                  </Link>
                );
              })}
            </nav>
            <MoreMenu />
            <button
              onClick={() => setComposerOpen(true)}
              className="mx-2 mt-4 min-h-11 rounded-lg bg-af-brand px-4 text-center text-[15px] font-semibold text-white transition-colors hover:bg-af-brand-hover"
            >
              Post
            </button>
            <div className="mt-auto mb-3 px-3">
              {loading ? (
                <div className="text-sm text-af-muted">Checking sessionâ€¦</div>
              ) : user ? (
                <div className="flex items-center gap-2 rounded-lg border border-af-border bg-af-surface/70 p-2">
                <Link href={profile?.username ? `/${profile.username}` : "/profile"} className="flex min-w-0 flex-1 items-center gap-3 rounded-md p-1 transition-colors hover:bg-af-surface-2">
                  {profile?.avatar_url ? (
                    <Image src={profile.avatar_url} alt="" width={40} height={40} className="h-10 w-10 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-af-brand text-sm font-bold text-white">
                      {(profile?.display_name || profile?.username || user.email || "?").slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold">{profile?.display_name || profile?.username || user.email?.split("@")[0]}</div>
                    <div className="truncate text-sm text-af-muted">@{profile?.username || user.email?.split("@")[0]}</div>
                  </div>
                  </Link>                  <div className="relative">
                    <button type="button" onClick={() => setAccountMenuOpen((v) => !v)} aria-label="Account menu" aria-expanded={accountMenuOpen} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-af-muted transition-colors hover:bg-af-surface-2 hover:text-af-text">
                      …
                    </button>
                    {accountMenuOpen && (
                      <div className="absolute bottom-full right-0 mb-2 w-52 rounded-lg border border-af-border bg-af-surface p-2 shadow-lg">
                        <Link href={profile?.username ? `/${profile.username}` : "/profile"} onClick={() => setAccountMenuOpen(false)} className="block rounded-md px-3 py-2 text-sm text-af-text-2 hover:bg-af-surface-2 hover:text-af-text">View profile</Link>
                        <Link href="/settings" onClick={() => setAccountMenuOpen(false)} className="block rounded-md px-3 py-2 text-sm text-af-text-2 hover:bg-af-surface-2 hover:text-af-text">Settings and privacy</Link>
                        <button type="button" onClick={async () => { setAccountMenuOpen(false); const r = await signOut(); if (r.error) alert(r.error); }} className="block w-full rounded-md px-3 py-2 text-left text-sm text-af-text-2 hover:bg-af-surface-2 hover:text-af-text">Log out</button>
                      </div>
                    )}
                  </div></div>
              ) : (
                <div className="space-y-2">
                  <Link href="/signin" className="block rounded-full bg-af-accent py-2 text-center text-[15px] font-bold text-white hover:bg-af-accent-hover">
                    Sign in
                  </Link>
                  <Link href="/signup" className="block text-center text-sm text-af-accent hover:underline">
                    Sign up
                  </Link>
                </div>
              )}
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 border-x border-af-border/80 xl:max-w-[var(--af-content-width)]">{children}</main>

        {right !== undefined && right !== null ? (
          <aside className="hidden w-[var(--af-sidebar-width)] shrink-0 xl:block">
            <div className="sticky top-0 max-h-screen overflow-y-auto px-4">{right}</div>
          </aside>
        ) : null}
      </div>
      <GlobalComposer open={composerOpen} onClose={() => setComposerOpen(false)} />

      <nav aria-label="Mobile navigation" className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t border-af-border bg-af-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {[NAV[0], NAV[1], NAV[2], NAV[3], NAV[7]].map((n) => {
          const href = n.href === "/profile" && profile?.username ? `/${profile.username}` : n.href;
          const active = pathname === href || (href !== "/" && pathname?.startsWith(`${href}/`));
          return <Link key={n.href} href={href} aria-current={active ? "page" : undefined} aria-label={n.label} className={`flex min-h-14 min-w-14 flex-col items-center justify-center gap-1 px-2 text-[10px] transition-colors ${active ? "font-semibold text-af-brand-soft" : "text-af-muted hover:text-af-text"}`}>
            <span aria-hidden="true" className="h-5 w-5 bg-current" style={{ maskImage: `url(/icons/afterfur/${n.icon}.svg)`, maskPosition: "center", maskRepeat: "no-repeat", maskSize: "contain" }} />
            <span>{n.label}</span>
          </Link>
        })}
      </nav>
      {user && <button onClick={() => setComposerOpen(true)} aria-label="Create a post" className="fixed bottom-[4.5rem] right-4 z-30 flex h-12 items-center gap-2 rounded-lg bg-af-brand px-4 text-sm font-semibold text-white shadow-lg shadow-black/30 transition-colors hover:bg-af-brand-hover md:hidden"><Image src="/icons/afterfur/file-pen.svg" alt="" aria-hidden="true" width={18} height={18} />Post</button>}
    </div>
  );
}

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="sticky top-0 z-10 border-b border-af-border bg-af-bg/95 px-4 py-4 backdrop-blur-sm sm:px-6">
      <h1 className="text-lg font-semibold tracking-tight text-af-text sm:text-xl">{title}</h1>
      {subtitle && <p className="mt-1 max-w-prose text-sm leading-relaxed text-af-muted">{subtitle}</p>}
    </header>
  );
}

const profileCache = new Map<string, { username?: string; display_name?: string | null; avatar_url?: string | null }>();

export function Shell({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-af-bg" />}>
      <ShellInner right={right}>{children}</ShellInner>
    </Suspense>
  );
}
export function EmptyState({ title, body, action }: { title: string; body: string; action?: { label: string; href: string } }) {
  return (
    <div className="px-6 py-14 text-center sm:px-10">
      <div className="mx-auto max-w-sm">
      <h2 className="text-lg font-semibold tracking-tight text-af-text">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-af-muted">{body}</p>
      {action && (
        <Link href={action.href} className="mt-5 inline-flex min-h-10 items-center rounded-lg bg-af-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-af-brand-hover">
          {action.label}
        </Link>
      )}
      </div>
    </div>
  );
}
