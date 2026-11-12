import { describe, expect, it } from "vitest";
import { fetchModerationMe, clearModerationMeCache } from "@/lib/moderationClient";

describe("moderation client caching", () => {
  it("dedupes in-flight requests and caches briefly per token", async () => {
    clearModerationMeCache();
    let calls = 0;
    const original = globalThis.fetch;
    globalThis.fetch = (async () => {
      calls++;
      await new Promise(r => setTimeout(r, 10));
      return new Response(JSON.stringify({ ok: true, role: "moderator", canModerate: true }), { status: 200, headers: { "content-type": "application/json" } });
    }) as any;
    try {
      const p = Promise.all([fetchModerationMe("tok123456789012345678901234"), fetchModerationMe("tok123456789012345678901234")]);
      const [a,b] = await p;
      expect(a?.ok).toBe(true);
      expect(b?.ok).toBe(true);
      expect(calls).toBe(1);
      await fetchModerationMe("tok123456789012345678901234");
      expect(calls).toBe(1);
    } finally {
      globalThis.fetch = original;
      clearModerationMeCache();
    }
  });
});
