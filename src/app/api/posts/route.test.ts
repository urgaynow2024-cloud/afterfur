import { describe, expect, it, vi, beforeEach } from "vitest";

const mockGetVerifiedUser = vi.fn();
const mockRpc = vi.fn();
const mockFrom = vi.fn();
const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockSingle = vi.fn();

vi.mock("@/lib/serverAuth", () => ({
  getVerifiedUser: mockGetVerifiedUser,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => ({
    rpc: mockRpc,
    from: mockFrom,
  }),
}));

vi.mock("@/lib/rateLimit", () => ({
  rateLimit: vi.fn(async () => ({ allowed: true })),
  getClientIp: () => "127.0.0.1",
  getRateLimitKey: (o: any) => (o?.userId ? `user:${o.userId}` : `ip:${o?.ip || "unknown"}`),
}));

const mockClient = {
  rpc: mockRpc,
  from: mockFrom,
} as any;

beforeEach(() => {
  vi.clearAllMocks();
  mockGetVerifiedUser.mockReset();
  mockRpc.mockReset();
  mockFrom.mockReset();
  mockInsert.mockReset();
  mockSelect.mockReset();
  mockSingle.mockReset();

  mockGetVerifiedUser.mockResolvedValue({
    id: "viewer-1",
    email: "viewer-1@example.com",
    app_metadata: {},
    user_metadata: {},
  });

  mockFrom.mockReturnValue({
    insert: mockInsert,
  });
  mockInsert.mockReturnValue({
    select: mockSelect,
  });
  mockSelect.mockReturnValue({
    single: mockSingle,
  });
  mockSingle.mockResolvedValue({
    data: { id: "post-1", author_id: "viewer-1", content: "hello", classification: "SFW" },
    error: null,
  });
});

describe("/api/posts POST — authentication and authorization", () => {
  it("rejects unauthenticated requests", async () => {
    mockGetVerifiedUser.mockResolvedValue(null);
    const { POST } = await import("@/app/api/posts/route");
    const res = await POST(
      new Request("http://localhost/api/posts", {
        method: "POST",
        body: JSON.stringify({ content: "Hello world", classification: "SFW" }),
      }),
    );
    expect(res!.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("allows SFW post without Ad badge", async () => {
    const { POST } = await import("@/app/api/posts/route");
    const res = await POST(
      new Request("http://localhost/api/posts", {
        method: "POST",
        body: JSON.stringify({ content: "Hello world", classification: "SFW" }),
      }),
    );
    expect(res!.status).toBe(201);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockInsert).toHaveBeenCalledWith({
      author_id: "viewer-1",
      content: "Hello world",
      media_urls: [],
      classification: "SFW",
    });
  });

  it("allows NSFW post when user has Ad badge", async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });
    const { POST } = await import("@/app/api/posts/route");
    const res = await POST(
      new Request("http://localhost/api/posts", {
        method: "POST",
        body: JSON.stringify({ content: "Adult content", classification: "NSFW" }),
      }),
    );
    expect(res!.status).toBe(201);
    expect(mockRpc).toHaveBeenCalledWith("has_ad_badge", { p_user_id: "viewer-1" });
  });

  it("rejects NSFW post when user does not have Ad badge", async () => {
    mockRpc.mockResolvedValue({ data: false, error: null });
    const { POST } = await import("@/app/api/posts/route");
    const res = await POST(
      new Request("http://localhost/api/posts", {
        method: "POST",
        body: JSON.stringify({ content: "Adult content", classification: "NSFW" }),
      }),
    );
    expect(res!.status).toBe(403);
    const body = await res!.json();
    expect(body.error).toBe("ad_badge_required");
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("badge removal immediately removes posting permission", async () => {
    mockRpc.mockResolvedValueOnce({ data: true, error: null });
    const { POST } = await import("@/app/api/posts/route");
    let res = await POST(
      new Request("http://localhost/api/posts", {
        method: "POST",
        body: JSON.stringify({ content: "Before removal", classification: "NSFW" }),
      }),
    );
    expect(res!.status).toBe(201);

    mockRpc.mockResolvedValueOnce({ data: false, error: null });
    res = await POST(
      new Request("http://localhost/api/posts", {
        method: "POST",
        body: JSON.stringify({ content: "After removal", classification: "NSFW" }),
      }),
    );
    expect(res!.status).toBe(403);
    const body = await res!.json();
    expect(body.error).toBe("ad_badge_required");
  });

  it("applies rate limiting to post creation", async () => {
    const { rateLimit } = await import("@/lib/rateLimit");
    (rateLimit as any).mockResolvedValueOnce({
      allowed: false,
      response: { status: 429, json: async () => ({ error: "rate_limited" }) },
    });
    const { POST } = await import("@/app/api/posts/route");
    const res = await POST(
      new Request("http://localhost/api/posts", {
        method: "POST",
        body: JSON.stringify({ content: "Hello world", classification: "SFW" }),
      }),
    );
    expect(res!.status).toBe(429);
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
