import { describe, expect, it } from "vitest";
import { loadEnv, isUuid } from "./bootstrap-owner";

describe("bootstrap env loading", () => {
  it("parses .env.local and requires both variables", () => {
    const env = loadEnv(".env.local");
    expect(env.SUPABASE_URL).toBeDefined();
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBeDefined();
  });

  it("throws when required variables are missing", () => {
    expect(() => loadEnv(".env.example")).toThrow(/Missing required/);
  });
});

describe("UUID validation", () => {
  it.each([
    "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    "A0EEBC99-9C0B-4EF8-BB6D-6BB9BD380A11",
  ])("accepts valid UUID %s", (uuid) => {
    expect(isUuid(uuid)).toBe(true);
  });
  it.each([
    "",
    "not-a-uuid",
    "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a1", // too short
    "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a111", // too long
    "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a1g", // invalid char
  ])("rejects invalid UUID %s", (uuid) => {
    expect(isUuid(uuid)).toBe(false);
  });
});
