import { describe, expect, it, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
const mockRpc = vi.fn();

const chainSelect = vi.fn();
const chainEq = vi.fn();
const chainMaybeSingle = vi.fn();
const chainSingle = vi.fn();
const chainUpdate = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => {
    const chain: any = {
      select: chainSelect,
      eq: chainEq,
      update: chainUpdate,
      maybeSingle: chainMaybeSingle,
      single: chainSingle,
    };
    chainSelect.mockReturnValue(chain);
    chainEq.mockReturnValue(chain);
    chainUpdate.mockReturnValue(chain);
    return {
      auth: { getUser: mockGetUser },
      rpc: mockRpc,
      from: vi.fn(() => chain),
    };
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockReset();
  mockRpc.mockReset();
  chainSelect.mockReset();
  chainEq.mockReset();
  chainMaybeSingle.mockReset();
  chainSingle.mockReset();
  chainUpdate.mockReset();

  mockGetUser.mockResolvedValue({
    data: { user: { id: "viewer-1" } },
    error: null,
  });

  chainMaybeSingle.mockResolvedValue({
    data: { id: "post-1", author_id: "viewer-1", classification: "SFW" },
    error: null,
  });
  chainSingle.mockResolvedValue({
    data: { id: "post-1", author_id: "viewer-1", content: "updated", classification: "NSFW" },
    error: null,
  });
});

describe("/api/posts/[id] PATCH — NSFW editing requires ad_creator badge", () => {
  it("allows editing SFW content without changing classification", async () => {
    const { PATCH } = await import("@/app/api/posts/[id]/route");
    const res = await PATCH(
      new Request("http://localhost/api/posts/post-1", {
        method: "PATCH",
        body: JSON.stringify({ content: "Updated SFW content" }),
      }),
      { params: Promise.resolve({ id: "post-1" }) } as any,
    );
    expect(res.status).toBe(200);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(chainUpdate).toHaveBeenCalledWith(
      { content: "Updated SFW content", edited_at: expect.any(String) },
    );
  });

  it("allows editing NSFW content when user has ad_creator badge", async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });
    const { PATCH } = await import("@/app/api/posts/[id]/route");
    const res = await PATCH(
      new Request("http://localhost/api/posts/post-1", {
        method: "PATCH",
        body: JSON.stringify({ content: "NSFW content", classification: "NSFW" }),
      }),
      { params: Promise.resolve({ id: "post-1" }) } as any,
    );
    expect(res.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith("has_ad_badge", { p_user_id: "viewer-1" });
  });

  it("rejects editing to NSFW when user does not have ad_creator badge", async () => {
    mockRpc.mockResolvedValue({ data: false, error: null });
    const { PATCH } = await import("@/app/api/posts/[id]/route");
    const res = await PATCH(
      new Request("http://localhost/api/posts/post-1", {
        method: "PATCH",
        body: JSON.stringify({ content: "Now NSFW", classification: "NSFW" }),
      }),
      { params: Promise.resolve({ id: "post-1" }) } as any,
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("ad_badge_required");
    expect(chainUpdate).not.toHaveBeenCalled();
  });

  it("rejects editing to NSFW when badge check errors", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "database error" } });
    const { PATCH } = await import("@/app/api/posts/[id]/route");
    const res = await PATCH(
      new Request("http://localhost/api/posts/post-1", {
        method: "PATCH",
        body: JSON.stringify({ content: "Now NSFW", classification: "NSFW" }),
      }),
      { params: Promise.resolve({ id: "post-1" }) } as any,
    );
    expect(res.status).toBe(403);
    expect(chainUpdate).not.toHaveBeenCalled();
  });

  it("allows editing from NSFW to SFW without badge (downgrading)", async () => {
    chainMaybeSingle.mockResolvedValueOnce({
      data: { id: "post-1", author_id: "viewer-1", classification: "NSFW" },
      error: null,
    });
    const { PATCH } = await import("@/app/api/posts/[id]/route");
    const res = await PATCH(
      new Request("http://localhost/api/posts/post-1", {
        method: "PATCH",
        body: JSON.stringify({ content: "Now SFW", classification: "SFW" }),
      }),
      { params: Promise.resolve({ id: "post-1" }) } as any,
    );
    expect(res.status).toBe(200);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated requests", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const { PATCH } = await import("@/app/api/posts/[id]/route");
    const res = await PATCH(
      new Request("http://localhost/api/posts/post-1", {
        method: "PATCH",
        body: JSON.stringify({ content: "Hello", classification: "NSFW" }),
      }),
      { params: Promise.resolve({ id: "post-1" }) } as any,
    );
    expect(res.status).toBe(401);
  });

  it("rejects invalid classification values", async () => {
    const { PATCH } = await import("@/app/api/posts/[id]/route");
    const res = await PATCH(
      new Request("http://localhost/api/posts/post-1", {
        method: "PATCH",
        body: JSON.stringify({ content: "Hello", classification: "ADULT" }),
      }),
      { params: Promise.resolve({ id: "post-1" }) } as any,
    );
    expect(res.status).toBe(400);
    expect(chainUpdate).not.toHaveBeenCalled();
  });

  it("checks badge when classification is set to NSFW even if already NSFW", async () => {
    chainMaybeSingle.mockResolvedValueOnce({
      data: { id: "post-1", author_id: "viewer-1", classification: "NSFW" },
      error: null,
    });
    mockRpc.mockResolvedValue({ data: true, error: null });
    const { PATCH } = await import("@/app/api/posts/[id]/route");
    const res = await PATCH(
      new Request("http://localhost/api/posts/post-1", {
        method: "PATCH",
        body: JSON.stringify({ content: "Still NSFW", classification: "NSFW" }),
      }),
      { params: Promise.resolve({ id: "post-1" }) } as any,
    );
    expect(res.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith("has_ad_badge", { p_user_id: "viewer-1" });
  });
});
