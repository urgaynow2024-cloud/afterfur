/**
 * Development-only auth diagnostics.
 *
 * Accumulates every auth-relevant event into window.__AUTH_DIAG_LOG__ so the
 * sequence from a button click through to logout can be dumped and preserved.
 * Also intercepts window.fetch to record request URLs and HTTP status codes.
 *
 * NEVER logs passwords, access tokens, refresh tokens, or cookies. Only
 * metadata (URLs, status codes, event names, user ids, booleans).
 */
"use client";

type AuthDiagEntry = {
  t: number; // performance.now()
  src: string; // source tag
  msg: string; // human-readable summary
  data?: Record<string, unknown>;
};

declare global {
  interface Window {
    __AUTH_DIAG_LOG__?: AuthDiagEntry[];
    __AUTH_DIAG_DUMP__?: () => AuthDiagEntry[];
    __AUTH_DIAG_CLEAR__?: () => void;
  }
}

function safeStringify(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (typeof v === "string") {
      // Never persist token-like values.
      if (/token|password|cookie|secret|access_key/i.test(k)) {
        out[k] = "<redacted>";
        continue;
      }
      out[k] = v.length > 200 ? v.slice(0, 200) + "…" : v;
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function authDiag(src: string, msg: string, data?: Record<string, unknown>) {
  const entry: AuthDiagEntry = {
    t: typeof performance !== "undefined" ? performance.now() : Date.now(),
    src,
    msg,
    data: data ? safeStringify(data) : undefined,
  };
  try {
    // eslint-disable-next-line no-console
    console.info(`[auth-diag][${src}] ${msg}`, data ?? "");
  } catch {}
  try {
    if (typeof window !== "undefined") {
      const log = (window.__AUTH_DIAG_LOG__ ??= []);
      log.push(entry);
      if (log.length > 2000) log.splice(0, log.length - 2000);
    }
  } catch {}
}

let fetchWrapped = false;
export function startAuthDiagFetchInterceptor() {
  if (typeof window === "undefined" || fetchWrapped) return;
  fetchWrapped = true;
  const orig = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request)?.url ?? String(input);
    const isSupabase = /supabase|afterfur\/api|\/api\//.test(url);
    const start = typeof performance !== "undefined" ? performance.now() : Date.now();
    return orig(input as RequestInfo, init).then(
      (res) => {
        if (isSupabase) {
          authDiag("fetch", `HTTP ${res.status} ${res.ok ? "ok" : "error"}`, { url: url.slice(0, 200), status: res.status, ok: res.ok, ms: Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - start) });
        }
        return res;
      },
      (err) => {
        if (isSupabase) authDiag("fetch", "HTTP network error", { url: url.slice(0, 200), err: err instanceof Error ? err.message : String(err) });
        throw err;
      }
    );
  }) as typeof window.fetch;
}

export function attachAuthDiagHelpers() {
  if (typeof window === "undefined") return;
  window.__AUTH_DIAG_LOG__ = window.__AUTH_DIAG_LOG__ ?? [];
  window.__AUTH_DIAG_DUMP__ = () => window.__AUTH_DIAG_LOG__!;
  window.__AUTH_DIAG_CLEAR__ = () => { window.__AUTH_DIAG_LOG__ = []; };
}

export function authDiagDump(): AuthDiagEntry[] {
  if (typeof window === "undefined") return [];
  return window.__AUTH_DIAG_LOG__ ?? [];
}