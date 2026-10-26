"use client";
import { createContext, useContext, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

type Ctx = { user: User | null; loading: boolean; signOut: () => Promise<{ error: string | null }> };
const AuthContext = createContext<Ctx>({ user: null, loading: true, signOut: async () => ({ error: null }) });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();
  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data }: any) => { setUser(data.session?.user ?? null); setLoading(false); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e: any, session: any) => { setUser(session?.user ?? null); setLoading(false); });
    return () => sub.subscription.unsubscribe();
  }, []);
  async function signOut() {
    if (!supabase) return { error: "Supabase not configured." };
    const { error } = await supabase.auth.signOut();
    if (!error) { setUser(null); window.location.href = "/"; }
    return { error: error?.message ?? null };
  }
  return <AuthContext.Provider value={{ user, loading, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() { return useContext(AuthContext); }
