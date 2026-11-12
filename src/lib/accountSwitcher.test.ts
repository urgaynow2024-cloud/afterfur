import { describe, expect, it, beforeEach } from "vitest";
import { readSavedAccounts, removeSavedAccount, touchSavedAccount, upsertSavedAccount } from "@/lib/accountSwitcher";

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string) { return this.map.has(key) ? this.map.get(key)! : null; }
  setItem(key: string, value: string) { this.map.set(key, value); }
  removeItem(key: string) { this.map.delete(key); }
  key(i: number) { return Array.from(this.map.keys())[i] ?? null; }
  get length() { return this.map.size; }
  clear() { this.map.clear(); }
}

describe("accountSwitcher storage (compat shim)", () => {
  beforeEach(() => {
    const storage = new MemoryStorage();
    Object.defineProperty(globalThis, "window", { value: { localStorage: storage }, configurable: true, writable: true });
    Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true, writable: true });
  });

  it("stores display metadata only and never tokens/password fields", () => {
    upsertSavedAccount({ userId: "u1", email: "a@example.com", username: "alpha", displayName: "Alpha", avatarUrl: "https://example.com/a.png" });
    const raw = (globalThis as any).localStorage.getItem("afterfur:saved-accounts:v2") || (globalThis as any).localStorage.getItem("afterfur:saved-accounts:v1") || "";
    expect(raw).toContain("alpha");
    expect(raw).not.toMatch(/password|access_token|refresh_token|provider_token/i);
    expect(readSavedAccounts()[0]?.userId).toBe("u1");
  });

  it("deduplicates by userId and moves active account to top", () => {
    upsertSavedAccount({ userId: "u1", username: "a", lastUsedAt: "2026-01-01T00:00:00.000Z" });
    upsertSavedAccount({ userId: "u2", username: "b", lastUsedAt: "2026-01-02T00:00:00.000Z" });
    upsertSavedAccount({ userId: "u1", username: "a2", lastUsedAt: "2026-01-03T00:00:00.000Z" });
    const ids = readSavedAccounts().map((a) => a.userId);
    expect(ids).toEqual(["u1", "u2"]);
    expect(readSavedAccounts()[0]?.username).toBe("a2");
  });

  it("supports remove and touch for account management/session expiry cleanup UX", () => {
    upsertSavedAccount({ userId: "u1", username: "a", lastUsedAt: "2026-01-01T00:00:00.000Z" });
    upsertSavedAccount({ userId: "u2", username: "b", lastUsedAt: "2026-01-02T00:00:00.000Z" });
    touchSavedAccount("u1");
    expect(readSavedAccounts()[0]?.userId).toBe("u1");
    removeSavedAccount("u2");
    expect(readSavedAccounts().map((a) => a.userId)).toEqual(["u1"]);
  });
});
