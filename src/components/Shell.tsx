"use client";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Suspense } from "react";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/explore", label: "Explore" },
  { href: "/search", label: "Search" },
  { href: "/notifications", label: "Notifications" },
  { href: "/messages", label: "Messages" },
  { href: "/bookmarks", label: "Bookmarks" },
  { href: "/after-dark", label: "After Dark" },
  { href: "/profile", label: "Profile" },
  { href: "/settings", label: "Settings" },
];

function ShellInner({ children, right }: { children: ReactNode; right?: ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const pathname = usePathname();
  const [profile, setProfile] = useState<{ username?: string; display_name?: string | null; avatar_url?: string | null } | null>(null);
  useEffect(() => {
    const run = async () => {
      const supabase = createClient();
      if (!supabase || !user) { setProfile(null); return; }
      const { data } = await supabase.from("profiles").select("username,display_name,avatar_url").eq("id", user.id).maybeSingle();
      setProfile(data);
    };
    run();
  }, [user]);

  return (
    <div className="min-h-screen bg-af-bg">
      <div className="mx-auto flex max-w-[1300px]">
        <aside className="hidden w-[275px] shrink-0 md:flex">
          <div className="sticky top-0 flex h-screen w-full flex-col px-2">
            <div className="mb-4 mt-2 px-3 py-2">
              <Link href="/" className="flex items-center gap-2">
                <div className="text-xl font-bold tracking-tight">
                  <span className="text-af-brand">After</span>Fur
                </div>
              </Link>
              <div className="mt-0.5 text-xs text-af-muted">Social media, after dark.</div>
            </div>
            <nav className="flex flex-col">
              {NAV.map((n) => {
                const isActive = pathname === n.href || (n.href !== "/" && pathname?.startsWith(n.href));
                return (
                  <Link
                    key={n.href}
                    href={n.href === "/profile" && profile?.username ? `/${profile.username}` : n.href}
className={`flex items-center rounded-full px-4 py-2.5 text-[19px] transition-colors hover:bg-af-surface ${
  isActive ? "bg-af-surface font-bold text-af-brand" : "font-normal text-af-text-2 hover:text-af-text"
}`}
                  >
                    {n.label}
                  </Link>
                );
              })}
            </nav>
            <Link
              href="/"
              className="mt-4 mx-3 rounded-full bg-af-accent py-2.5 text-center text-[15px] font-bold text-white transition-colors hover:bg-af-accent-hover"
            >
              Post
            </Link>
            <div className="mt-auto mb-3 px-3">
              {loading ? (
                <div className="text-sm text-af-muted">Checking session…</div>
              ) : user ? (
                <Link href={profile?.username ? `/${profile.username}` : "/profile"} className="flex items-center gap-3 rounded-full p-2 transition-colors hover:bg-af-surface">
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
                  <button
                    onClick={async (e) => {
                      e.preventDefault();
                      const r = await signOut();
                      if (r.error) alert(r.error);
                    }}
                    className="text-xs text-af-muted hover:text-af-text"
                  >
                    …
                  </button>
                </Link>
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

        <main className="min-w-0 flex-1 border-x border-af-border">{children}</main>

        {right !== undefined && right !== null ? (
          <aside className="hidden w-[350px] shrink-0 lg:block">
            <div className="sticky top-0 px-4">{right}</div>
          </aside>
        ) : null}
      </div>

      <nav className="fixed bottom-0 left-0 right-0 flex justify-around border-t border-af-border bg-af-bg md:hidden">
        {NAV.slice(0, 5).map((n) => (
          <Link key={n.href} href={n.href} className={`px-3 py-2 text-xs transition-colors ${pathname === n.href ? "font-bold text-af-accent" : "text-af-muted hover:text-af-text"}`}>
            {n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="sticky top-0 z-10 border-b border-af-border bg-af-bg/90 px-4 py-3 backdrop-blur">
      <h1 className="text-xl font-bold">{title}</h1>
      {subtitle && <p className="text-sm text-af-muted">{subtitle}</p>}
    </header>
  );
}

export function Shell({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-af-bg" />}>
      <ShellInner right={right}>{children}</ShellInner>
    </Suspense>
  );
}
export function EmptyState({ title, body, action }: { title: string; body: string; action?: { label: string; href: string } }) {
  return (
    <div className="px-6 py-12 text-center">
      <h2 className="text-xl font-bold">{title}</h2>
      <p className="mt-2 text-[15px] text-af-muted">{body}</p>
      {action && (
        <Link href={action.href} className="mt-4 inline-block rounded-full bg-af-accent px-4 py-1.5 text-[15px] font-bold text-white hover:bg-af-accent-hover">
          {action.label}
        </Link>
      )}
    </div>
  );
}
