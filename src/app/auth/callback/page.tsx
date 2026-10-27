"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AuthCallback() {
  const router = useRouter();
  const [status, setStatus] = useState("Confirming your account...");

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) {
      setStatus("Supabase not configured.");
      return;
    }

    supabase.auth
      .getSession()
      .then(async ({ data }: any) => {
        const session = data?.session;
        const user = session?.user;

        if (user && user.id) {
          // Ensure profile exists
          try {
            const { data: existing } = await supabase.from("profiles").select("id").eq("id", user.id).maybeSingle();
            if (!existing) {
              const username =
                user.user_metadata?.username ||
                user.email?.split("@")[0]?.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 20) ||
                `user${user.id.slice(0, 8)}`;
              // Try to insert, ignore duplicates
              await supabase.from("profiles").insert({ id: user.id, username: username.toLowerCase() });
            }
          } catch (e) {
            // Ignore profile creation errors in callback - user can complete profile later
          }
          router.push("/");
          return;
        }

        setStatus("No active session. You can sign in after confirming your email.");
        setTimeout(() => router.push("/signin"), 2000);
      })
      .catch((err: any) => {
        console.error(err);
        setStatus("Something went wrong. Redirecting to sign in...");
        setTimeout(() => router.push("/signin"), 2000);
      });
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-af-bg px-4">
      <div className="w-full max-w-md rounded-2xl border border-af-border bg-af-surface p-6 text-center">
        <p className="text-sm text-af-text">{status}</p>
      </div>
    </div>
  );
}
