import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const mockRpc = vi.fn();
let mockSupabaseClient: any = { rpc: mockRpc };

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => mockSupabaseClient,
}));

const originalEnv = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mockRpc.mockReset();
  mockSupabaseClient = { rpc: mockRpc };
  (process.env as any).NODE_ENV = "test"; process.env.RATE_LIMIT_ENFORCE_IN_TESTS = "true";
  delete process.env.RATE_LIMIT_ALLOW_UNCONFIGURED;
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("rateLimit (Phase 5.3)", () => {
  it("allows requests within the limit", async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });
    const { rateLimit } = await import("@/lib/rateLimit");
    const result = await rateLimit("user-1", "/api/posts", 10, 60);
    expect(result.allowed).toBe(true);
    expect(result.response).toBeUndefined();
  });

  it("denies requests over the limit", async () => {
    mockRpc.mockResolvedValue({ data: false, error: null });
    const { rateLimit } = await import("@/lib/rateLimit");
    const result = await rateLimit("user-1", "/api/posts", 10, 60);
    expect(result.allowed).toBe(false);
    expect(result.response?.status).toBe(429);
  });

  it("denies when RPC returns invalid response (data null, no error)", async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    const { rateLimit } = await import("@/lib/rateLimit");
    const result = await rateLimit("user-1", "/api/posts", 10, 60);
    expect(result.allowed).toBe(false);
    expect(result.response?.status).toBe(429);
  });

  it("handles RPC/DB error by denying with 503 (distinguishable from rate-limit 429)", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "db error" } });
    const { rateLimit } = await import("@/lib/rateLimit");
    const result = await rateLimit("user-1", "/api/posts", 10, 60);
    expect(result.allowed).toBe(false);
    expect(result.response?.status).toBe(503);
    expect((result.response as Response)?.status).toBe(503);
  });

  it("handles RPC exception by denying with 503 (distinguishable from rate-limit 429)", async () => {
    mockRpc.mockRejectedValue(new Error("connection lost"));
    const { rateLimit } = await import("@/lib/rateLimit");
    const result = await rateLimit("user-1", "/api/posts", 10, 60);
    expect(result.allowed).toBe(false);
    expect(result.response?.status).toBe(503);
  });

  it("allows when limit is 0 in non-production (explicit local tolerance)", async () => {
    (process.env as any).NODE_ENV = "development";
    const { rateLimit } = await import("@/lib/rateLimit");
    const result = await rateLimit("user-1", "/api/posts", 0, 60);
    expect(result.allowed).toBe(true);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("denies when limit is 0 in production (fail-closed misconfiguration)", async () => {
    (process.env as any).NODE_ENV = "production";
    const { rateLimit } = await import("@/lib/rateLimit");
    const result = await rateLimit("user-1", "/api/posts", 0, 60);
    expect(result.allowed).toBe(false);
    expect(result.response?.status).toBe(503);
  });

  it("denies when Supabase is unconfigured in production (fail-closed)", async () => {
    (process.env as any).NODE_ENV = "production";
    mockSupabaseClient = null;
    const { rateLimit } = await import("@/lib/rateLimit");
    const result = await rateLimit("user-1", "/api/posts", 10, 60);
    expect(result.allowed).toBe(false);
    expect(result.response?.status).toBe(503);
  });

  it("denies when Supabase is unconfigured in development without explicit bypass", async () => {
    (process.env as any).NODE_ENV = "development";
    delete process.env.RATE_LIMIT_ALLOW_UNCONFIGURED;
    mockSupabaseClient = null;
    const { rateLimit } = await import("@/lib/rateLimit");
    const result = await rateLimit("user-1", "/api/posts", 10, 60);
    expect(result.allowed).toBe(false);
    expect(result.response?.status).toBe(503);
  });

  it("allows unconfigured bypass only in non-production with explicit env", async () => {
    (process.env as any).NODE_ENV = "development";
    process.env.RATE_LIMIT_ALLOW_UNCONFIGURED = "true";
    mockSupabaseClient = null;
    const { rateLimit } = await import("@/lib/rateLimit");
    const result = await rateLimit("user-1", "/api/posts", 10, 60);
    expect(result.allowed).toBe(true);
  });

  it("never allows unconfigured bypass in production even if env var is set", async () => {
    (process.env as any).NODE_ENV = "production";
    process.env.RATE_LIMIT_ALLOW_UNCONFIGURED = "true";
    mockSupabaseClient = null;
    const { rateLimit } = await import("@/lib/rateLimit");
    const result = await rateLimit("user-1", "/api/posts", 10, 60);
    expect(result.allowed).toBe(false);
    expect(result.response?.status).toBe(503);
  });

  it("denies empty identifier to prevent shared buckets", async () => {
    const { rateLimit } = await import("@/lib/rateLimit");
    const result = await rateLimit("", "/api/posts", 10, 60);
    expect(result.allowed).toBe(false);
    expect(result.response?.status).toBe(429);
  });
});

describe("rate limit key helpers", () => {
  it("uses verified user id when present", async () => {
    const { getRateLimitKey } = await import("@/lib/rateLimit");
    expect(getRateLimitKey({ userId: "user-123", ip: "1.2.3.4" })).toBe("user:user-123");
  });

  it("uses IP for anonymous requests", async () => {
    const { getRateLimitKey, getClientIp } = await import("@/lib/rateLimit");
    expect(getRateLimitKey({ userId: null, ip: "1.2.3.4" })).toBe("ip:1.2.3.4");
    const req = new Request("http://localhost", { headers: { "x-forwarded-for": "9.8.7.6, 1.2.3.4" } });
    expect(getClientIp(req)).toBe("9.8.7.6");
  });

  it("separates anonymous users by IP (no shared anon bucket)", async () => {
    const { getRateLimitKey } = await import("@/lib/rateLimit");
    expect(getRateLimitKey({ ip: "1.1.1.1" })).not.toBe(getRateLimitKey({ ip: "2.2.2.2" }));
  });
});

describe("check_rate_limit SQL function volatility fix (Phase 5.5)", () => {
  it("migration 0047 declares function as VOLATILE (not STABLE/IMMUTABLE)", () => {
    const migrationPath = path.join(process.cwd(), "supabase", "migrations", "0047_fix_check_rate_limit_volatility.sql");
    expect(fs.existsSync(migrationPath)).toBe(true);
    const content = fs.readFileSync(migrationPath, "utf8");
    // Must declare VOLATILE
    expect(content).toMatch(/^\s*volatile\s*$/im);
    // Must NOT declare STABLE or IMMUTABLE
    expect(content).not.toMatch(/^\s*stable\s*$/im);
    expect(content).not.toMatch(/^\s*immutable\s*$/im);
    // Must preserve SECURITY DEFINER
    expect(content).toMatch(/security definer/i);
    // Must preserve safe search_path
    expect(content).toMatch(/set search_path\s*=\s*pg_catalog,\s*public/i);
    // Must preserve EXECUTE grants
    expect(content).toMatch(/grant execute on function public\.check_rate_limit\(text, text, integer, integer\) to authenticated/i);
    expect(content).toMatch(/grant execute on function public\.check_rate_limit\(text, text, integer, integer\) to service_role/i);
    // Must preserve REVOKE from public/anon
    expect(content).toMatch(/revoke all on function public\.check_rate_limit\(text, text, integer, integer\) from public, anon/i);
  });

  it("original migration 0045 had STABLE (documenting the bug)", () => {
    const migrationPath = path.join(process.cwd(), "supabase", "migrations", "0045_enforcement_and_rate_limiting.sql");
    const content = fs.readFileSync(migrationPath, "utf8");
    // Original buggy declaration
    expect(content).toMatch(/^\s*stable\s*$/im);
  });

  it("migration 0047 declares exact check_rate_limit(text, text, integer, integer) signature", () => {
    const migrationPath = path.join(process.cwd(), "supabase", "migrations", "0047_fix_check_rate_limit_volatility.sql");
    const content = fs.readFileSync(migrationPath, "utf8");
    expect(content).toMatch(/create or replace function public\.check_rate_limit\(/);
    expect(content).toMatch(/p_identifier text,/);
    expect(content).toMatch(/p_endpoint text,/);
    expect(content).toMatch(/p_limit integer,/);
    expect(content).toMatch(/p_window_seconds integer/);
    expect(content).toMatch(/returns boolean/);
    expect(content).toMatch(/language plpgsql/);
  });

  it("migration 0047 is additive (create or replace, not drop and recreate)", () => {
    const migrationPath = path.join(process.cwd(), "supabase", "migrations", "0047_fix_check_rate_limit_volatility.sql");
    const content = fs.readFileSync(migrationPath, "utf8");
    expect(content).toMatch(/create or replace function/i);
    expect(content).not.toMatch(/drop function/i);
    expect(content).not.toMatch(/drop table/i);
  });
});
