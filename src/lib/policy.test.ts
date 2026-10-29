import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const masterPath = resolve(process.cwd(), "public/policies/master.md");
const text = readFileSync(masterPath, "utf8");

function sectionBetween(part: string): string {
  const startRe = new RegExp(`^PART ${part} — [A-Z]`, "m");
  const startIndex = text.search(startRe);
  if (startIndex === -1) return "";
  const rest = text.slice(startIndex);
  const nextMatch = rest.slice(1).search(/^PART [A-Z] —/m);
  return nextMatch === -1 ? rest : rest.slice(0, nextMatch + 1);
}

describe("public policy content", () => {
  it("excludes internal document map and launch checklist", () => {
    expect(text).not.toContain("DOCUMENT MAP");
    expect(text).not.toContain("PART K");
    expect(text).not.toContain("Operational checklist before publication");
    expect(text).not.toContain("INTERNAL RELEASE BLOCKERS");
  });

  it("contains no bracketed placeholders or drafting instructions in public output", () => {
    // No [INSERT ...], [FULL ...], [CONFIRM ...], [BRACKETED ...] style placeholders
    expect(text).not.toMatch(/\[INSERT [A-Z ]+\]/);
    expect(text).not.toMatch(/\[FULL [A-Z ]+\]/);
    expect(text).not.toMatch(/\[CONFIRM [A-Z /]+\]/);
    expect(text).not.toMatch(/\[BRACKETED [A-Z ]+\]/);
    expect(text).not.toMatch(/\[[A-Z][A-Z _]+\]/);
    // No internal drafting instructions
    expect(text).not.toContain("Before publication, add a table containing:");
    expect(text).not.toContain("Actual inventory:");
    expect(text).not.toContain("Actual providers and their roles:");
    expect(text).not.toContain("Actual countries and safeguards:");
    expect(text).not.toContain("The operator must approve and implement");
  });

  it("does not claim policies are legally approved or compliant", () => {
    // Only match affirmative claims of approval/compliance, not negations like "not legally reviewed"
    expect(text).not.toMatch(/are legally (approved|compliant|reviewed|certified)/i);
    expect(text).not.toMatch(/is legally (approved|compliant|reviewed|certified)/i);
    expect(text).not.toMatch(/will be legally (approved|compliant|reviewed|certified)/i);
  });

  it("does not display internal draft labels as policy content", () => {
    expect(text).not.toContain("draft framework; must match actual data practices");
    expect(text).not.toContain("Replace every [BRACKETED PLACEHOLDER]");
  });

  it("has substantive content for every part A through J", () => {
    for (const part of ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"]) {
      const section = sectionBetween(part);
      expect(section.length, `Part ${part} section is empty`).toBeGreaterThan(200);
      expect(section, `Part ${part} should contain body paragraphs`).toMatch(/\n\n/);
    }
  });

  it("does not leak adjacent sections into a part", () => {
    const partA = sectionBetween("A");
    expect(partA).not.toContain("PART B —");
    const partD = sectionBetween("D");
    expect(partD).not.toContain("PART E —");
  });
});
