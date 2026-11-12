export type ModerationNavRole = "moderator" | "senior_moderator" | "administrator";

export type ModerationMeResponse = {
  ok?: boolean;
  role?: ModerationNavRole | null;
  canModerate?: boolean;
  userId?: string;
  isAdministrator?: boolean;
  canManageUsers?: boolean;
  canManageStaff?: boolean;
};

export function hasModerationNavAccess(me: ModerationMeResponse | null | undefined): boolean {
  if (!me || me.ok !== true) return false;
  if (me.canModerate === true) return true;
  return me.role === "moderator" || me.role === "senior_moderator" || me.role === "administrator";
}

type CacheEntry = { at: number; value: ModerationMeResponse | null };
const CACHE_TTL_MS = 30_000;
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<ModerationMeResponse | null>>();

function cacheKey(token?: string | null) {
  if (!token) return "anon";
  return `t:${token.slice(-24)}`;
}

export function clearModerationMeCache() {
  cache.clear();
  inflight.clear();
}

export async function fetchModerationMe(token?: string | null, opts?: { force?: boolean; signal?: AbortSignal | null }): Promise<ModerationMeResponse | null> {
  const key = cacheKey(token);
  if (!opts?.force) {
    const cached = cache.get(key);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;
    const pending = inflight.get(key);
    if (pending) return pending;
  }
  const p = (async () => {
    try {
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const init: RequestInit = { cache: "no-store", headers };
      if (opts?.signal) init.signal = opts.signal;
      const res = await fetch("/api/moderation/me", init);
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          const v = { ok: false, role: null, canModerate: false } satisfies ModerationMeResponse;
          cache.set(key, { at: Date.now(), value: v });
          return v;
        }
        return null;
      }
      const data = (await res.json().catch(() => null)) as ModerationMeResponse | null;
      cache.set(key, { at: Date.now(), value: data });
      return data;
    } catch {
      return null;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

export async function fetchModerationNavAccess(init?: RequestInit & { token?: string | null; force?: boolean }): Promise<boolean> {
  const data = await fetchModerationMe(init?.token, { force: init?.force, signal: init?.signal ?? undefined });
  return hasModerationNavAccess(data);
}
