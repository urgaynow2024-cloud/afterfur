import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("public policy content", () => {
  it("does not contain unresolved placeholders or drafting instructions", () => {
    const text = readFileSync(resolve(process.cwd(), "public/policies/master.md"), "utf8");
    expect(text).not.toContain("Replace every [BRACKETED PLACEHOLDER]");
    expect(text).not.toMatch(/\[[^\]]*\]/);
    expect(text).not.toContain("PART K");
    expect(text).not.toContain("DOCUMENT MAP");
    expect(text).not.toContain("â€");
  });
});
