"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AuthCallback() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState("Confirming your account...");

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) {
      setStatus("Supabase not configured.");
      return;
    }

    const code = searchParams.get("code");

    const finish = async () => {
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) throw error;
      }

      const { data } = await supabase.auth.getSession();
      const user = data?.session?.user;

      if (user?.id) {
        try {
          const { data: existing } = await supabase.from("profiles").select("id").eq("id", user.id).maybeSingle();
          if (!existing) {
            const username =
              user.user_metadata?.username ||
              user.email?.split("@")[0]?.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 20) ||
              `user${user.id.slice(0, 8)}`;
            await supabase.from("profiles").insert({ id: user.id, username: username.toLowerCase() });
          }
        } catch {
          // Ignore profile creation errors in callback - user can complete profile later
        }
        router.push("/");
        return;
      }

      setStatus("No active session. You can sign in after confirming your email.");
      setTimeout(() => router.push("/signin"), 2000);
    };

    finish().catch((err) => {
      console.error(err);
      setStatus("Something went wrong. Redirecting to sign in...");
      setTimeout(() => router.push("/signin"), 2000);
    });
  }, [router, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-af-bg px-4">
      <div className="w-full max-w-md rounded-2xl border border-af-border bg-af-surface p-6 text-center">
        <p className="text-sm text-af-text">{status}</p>
      </div>
    </div>
  );
}
