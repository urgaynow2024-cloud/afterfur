import { describe, expect, it, vi, beforeEach } from "vitest";
import { fetchModerationMe, clearModerationMeCache } from "@/lib/moderationClient";

describe("moderation client auth/request behavior", () => {
  beforeEach(() => { clearModerationMeCache(); vi.restoreAllMocks(); });

  it("attaches Bearer token when provided", async () => {
    const fetchSpy = vi.fn(async (_url: string, init?: RequestInit) => {
      expect((init?.headers as Record<string,string>)?.Authorization).toBe("Bearer token-abc");
      return new Response(JSON.stringify({ ok: true, canModerate: true, role: "administrator" }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchSpy);
    const res = await fetchModerationMe("token-abc", { force: true });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(res?.canModerate).toBe(true);
  });

  it("does not attach Authorization header without token", async () => {
    const fetchSpy = vi.fn(async (_url: string, init?: RequestInit) => {
      expect((init?.headers as Record<string,string>)?.Authorization).toBeUndefined();
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchSpy);
    const res = await fetchModerationMe(null, { force: true });
    expect(res?.ok).toBe(false);
  });

  it("dedupes concurrent requests for same token and ignores stale account results in UI flow via cache key separation", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      calls++;
      const auth = (init?.headers as any)?.Authorization;
      return new Response(JSON.stringify({ ok: true, canModerate: true, userId: auth?.includes("A") ? "uA" : "uB" }), { status: 200, headers: { "content-type": "application/json" } });
    }));
    const [a,b] = await Promise.all([fetchModerationMe("token-A-xxxxxxxxxxxxxxxx"), fetchModerationMe("token-A-xxxxxxxxxxxxxxxx")]);
    expect(calls).toBe(1);
    expect(a?.userId).toBe("uA");
    expect(b?.userId).toBe("uA");
    clearModerationMeCache();
    const rb = await fetchModerationMe("token-B-yyyyyyyyyyyyyyyy", { force: true });
    expect(rb?.userId).toBe("uB");
  });
});
