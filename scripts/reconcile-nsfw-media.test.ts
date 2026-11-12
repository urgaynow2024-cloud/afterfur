import { describe, expect, it } from "vitest";
import { classifyQuarantine, investigateKnownPost, buildReport, type PostRow } from "../scripts/reconcile-nsfw-media";

describe("legacy media quarantine/reconciliation helpers (Phase 5.3)", () => {
  it("identifies all public objects on unclassified (NULL) posts as UNRESOLVED quarantine", () => {
    const posts: PostRow[] = [
      { id: "a", author_id: "u", created_at: "t", classification: null, media_urls: [
        "https://x.supabase.co/storage/v1/object/public/media/u/1.png",
        "https://x.supabase.co/storage/v1/object/public/media/u/2.png",
      ], media_reconciled_at: null },
    ];
    const q = classifyQuarantine(posts);
    expect(q).toHaveLength(1);
    expect(q[0].status).toBe("UNRESOLVED_QUARANTINE");
    expect(q[0].publicMediaUrls).toHaveLength(2);
  });

  it("never treats unknown classification as SFW (non-NSFW with public media is quarantined)", () => {
    const posts: PostRow[] = [
      { id: "b", author_id: "u", created_at: "t", classification: "UNKNOWN", media_urls: ["https://x.supabase.co/storage/v1/object/public/media/u/1.png"], media_reconciled_at: null },
      { id: "c", author_id: "u", created_at: "t", classification: "SFW", media_urls: ["https://x.supabase.co/storage/v1/object/public/media/u/2.png"], media_reconciled_at: null },
    ];
    const q = classifyQuarantine(posts);
    expect(q.map((x) => x.postId).sort()).toEqual(["b", "c"]);
  });

  it("does not quarantine NSFW (handled by reconciliation path)", () => {
    const posts: PostRow[] = [{ id: "n", author_id: "u", created_at: "t", classification: "NSFW", media_urls: ["https://x.supabase.co/storage/v1/object/public/media/u/1.png"], media_reconciled_at: null }];
    expect(classifyQuarantine(posts)).toHaveLength(0);
  });

  it("investigates known post 7f28fb11-0978-4dcc-bc4e-8b7d4aa0fc7c: WOULD_QUARANTINE when unclassified with public media", () => {
    const id = "7f28fb11-0978-4dcc-bc4e-8b7d4aa0fc7c";
    const posts: PostRow[] = [{ id, author_id: "u", created_at: "t", classification: null, media_urls: ["https://x.supabase.co/storage/v1/object/public/media/u/legacy.png"], media_reconciled_at: null }];
    const inv = investigateKnownPost(posts, id);
    expect(inv.disposition).toBe("WOULD_QUARANTINE");
    expect(inv.publicMediaUrls).toHaveLength(1);
  });

  it("investigates known post as NSFW candidate when classified NSFW", () => {
    const id = "7f28fb11-0978-4dcc-bc4e-8b7d4aa0fc7c";
    const posts: PostRow[] = [{ id, author_id: "u", created_at: "t", classification: "NSFW", media_urls: ["https://x.supabase.co/storage/v1/object/public/media/u/legacy.png"], media_reconciled_at: null }];
    expect(investigateKnownPost(posts, id).disposition).toBe("NSFW_RECONCILIATION_CANDIDATE");
  });

  it("marks known post NOT VERIFIED when not found in incomplete scan", () => {
    const inv = investigateKnownPost([], "7f28fb11-0978-4dcc-bc4e-8b7d4aa0fc7c");
    expect(inv.disposition).toBe("NOT_FOUND_IN_SCAN");
    expect(inv.note).toMatch(/NOT VERIFIED/);
  });

  it("report clearly separates unresolved quarantine from reconciled", () => {
    const report = buildReport({
      dryRun: true, scanComplete: true, scanLimitApplied: null, scannedPosts: 2,
      quarantine: [{ postId: "q", authorId: "u", createdAt: "t", classification: null, status: "UNRESOLVED_QUARANTINE", reason: "r", publicMediaUrls: ["u"] }],
      reconciled: [{ postId: "r", classification: "NSFW", status: "DRY_RUN", publicMediaUrls: ["u"] }],
      failed: [], investigations: [],
    });
    expect(report.unresolvedQuarantine[0].status).toBe("UNRESOLVED_QUARANTINE");
    expect(report.reconciled[0].status).toBe("DRY_RUN");
    expect(report.totals.unresolvedQuarantinedPosts).toBe(1);
  });
});
