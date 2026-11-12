import { describe, it, expect } from "vitest";
import { storagePathFromPublicUrl, isNsfwReconciliationCandidate } from "@/lib/nsfwMedia";

describe("nsfwMedia helpers", () => {
  it("extracts storage path from public URL", () => {
    expect(storagePathFromPublicUrl("https://x.supabase.co/storage/v1/object/public/media/u1/a.png")).toBe("u1/a.png");
  });
  it("returns null for non-public URL", () => {
    expect(storagePathFromPublicUrl("https://x.supabase.co/storage/v1/object/private/media/u1/a.png")).toBeNull();
  });
  it("identifies NSFW unreconciled candidate", () => {
    expect(isNsfwReconciliationCandidate({ classification: "NSFW", media_urls: ["https://x.supabase.co/storage/v1/object/public/media/u1/a.png"], media_reconciled_at: null })).toBe(true);
  });
  it("rejects SFW", () => {
    expect(isNsfwReconciliationCandidate({ classification: "SFW", media_urls: ["https://x.supabase.co/storage/v1/object/public/media/u1/a.png"], media_reconciled_at: null })).toBe(false);
  });
  it("rejects already reconciled", () => {
    expect(isNsfwReconciliationCandidate({ classification: "NSFW", media_urls: ["https://x.supabase.co/storage/v1/object/public/media/u1/a.png"], media_reconciled_at: "2024-01-01" })).toBe(false);
  });
  it("rejects no public media", () => {
    expect(isNsfwReconciliationCandidate({ classification: "NSFW", media_urls: ["u1/a.png"], media_reconciled_at: null })).toBe(false);
  });
});
