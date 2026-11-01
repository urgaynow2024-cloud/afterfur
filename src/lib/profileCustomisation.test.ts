import { describe, expect, it } from "vitest";
import { parseProfileCustomisation, type ProfileCustomisation } from "@/lib/profileCustomisation";
import { coerceEffectId, coerceFontId, effectClassName, fontClassName, EFFECTS, FONTS, type EffectId, type FontId } from "@/lib/fonts";

describe("parseProfileCustomisation", () => {
  it("returns empty for non-object input", () => {
    expect(parseProfileCustomisation(null)).toEqual({});
    expect(parseProfileCustomisation(undefined)).toEqual({});
    expect(parseProfileCustomisation("not an object")).toEqual({});
  });

  it("parses colours and legacy effect field", () => {
    const out = parseProfileCustomisation({
      accent: "#ff0000",
      usernameColor: "#00ff00",
      displayNameColor: "#0000ff",
      effect: "neon",
      font: "serif",
    } as unknown);
    expect(out.accent).toBe("#ff0000");
    expect(out.usernameColor).toBe("#00ff00");
    expect(out.displayNameColor).toBe("#0000ff");
    expect(out.displayNameEffect).toBe("neon");
    expect(out.font).toBe("serif");
  });

  it("coerces invalid effect and font to null", () => {
    expect(parseProfileCustomisation({ displayNameEffect: "not-a-real-effect" } as unknown).displayNameEffect).toBeNull();
    expect(parseProfileCustomisation({ font: "Comic Sans" } as unknown).font).toBeNull();
  });

  it("keeps usernameEffect and displayNameEffect separate", () => {
    const out = parseProfileCustomisation({
      usernameEffect: "outline",
      displayNameEffect: "gradient",
      gradientStart: "#ff0000",
      gradientEnd: "#0000ff",
    } as unknown);
    expect(out.usernameEffect).toBe("outline");
    expect(out.displayNameEffect).toBe("gradient");
    expect(out.gradientStart).toBe("#ff0000");
    expect(out.gradientEnd).toBe("#0000ff");
  });

  it("keeps gradient start and end colours as strings", () => {
    const out = parseProfileCustomisation({ gradientStart: "#ff0000", gradientEnd: "#00ff00" } as unknown);
    expect(out.gradientStart).toBe("#ff0000");
    expect(out.gradientEnd).toBe("#00ff00");
  });

  it("keeps only string colours and drops unknown keys from malformed data", () => {
    const out = parseProfileCustomisation({ usernameColor: null, displayNameColor: true, accent: "#ff0000", extra: "ignored" } as unknown);
    expect(out.accent).toBe("#ff0000");
    expect(out.usernameColor).toBeUndefined();
    expect(out.displayNameColor).toBeUndefined();
    expect("extra" in out).toBe(false);
  });

  it("treats non-object saved data as empty customisation", () => {
    expect(parseProfileCustomisation(42)).toEqual({});
    expect(parseProfileCustomisation("{\"accent\":\"#ff0000\"}")).toEqual({});
  });

  it("coerces an array-typed malformed value without colour keys", () => {
    const out = parseProfileCustomisation([] as unknown);
    expect(out.accent).toBeUndefined();
    expect(out.font).toBeNull();
    expect(out.usernameEffect).toBeNull();
    expect(out.displayNameEffect).toBeNull();
  });
});

describe("font and effect rendering classes", () => {
  it("maps every font id to a class name", () => {
    for (const id of ["default", "bold", "rounded", "serif", "decorative", "pixel", "monospace", "handwritten"] as FontId[]) {
      expect(fontClassName(id)).toBeTruthy();
    }
  });

  it("disables animated effects under reduced motion", () => {
    expect(effectClassName("glitch", true)).toBe("af-effect-none");
    expect(effectClassName("aurora", true)).toBe("af-effect-none");
    expect(effectClassName("glitch", false)).toBe("af-effect-glitch");
    expect(effectClassName("aurora", false)).toBe("af-effect-aurora");
    expect(effectClassName("neon", true)).toBe("af-effect-neon");
    expect(effectClassName("solid", false)).toBe("af-effect-solid");
  });
});

describe("font and effect catalogues", () => {
  it("exposes the advertised font set", () => {
    const ids = FONTS.map((f) => f.id);
    expect(ids).toContain("default");
    expect(ids).toContain("bold");
    expect(ids).toContain("rounded");
    expect(ids).toContain("serif");
    expect(ids).toContain("decorative");
    expect(ids).toContain("pixel");
    expect(ids).toContain("monospace");
    expect(ids).toContain("handwritten");
    expect(FONTS.every((f) => f.label && f.className)).toBe(true);
  });

  it("exposes the advertised effect set", () => {
    const ids = EFFECTS.map((e) => e.id);
    for (const id of ["solid", "gradient", "neon", "toon", "pop", "gummy", "prism", "shadow", "outline", "metallic", "glitch", "frost", "ember", "aurora"] as EffectId[]) {
      expect(ids).toContain(id);
    }
    expect(EFFECTS.length).toBe(14);
  });

  it("coerceFontId accepts known ids and rejects unknown", () => {
    expect(coerceFontId("serif")).toBe("serif");
    expect(coerceFontId("bogus")).toBeNull();
    expect(coerceFontId(123 as unknown as string)).toBeNull();
  });

  it("coerceEffectId accepts known ids and rejects unknown", () => {
    expect(coerceEffectId("glitch")).toBe("glitch");
    expect(coerceEffectId("bogus")).toBeNull();
    expect(coerceEffectId(null as unknown as string)).toBeNull();
  });
});

describe("profile customisation shape", () => {
  it("default shape has no fields set", () => {
    const c: ProfileCustomisation = {};
    expect(c.font).toBeUndefined();
    expect(c.displayNameEffect).toBeUndefined();
    expect(c.accent).toBeUndefined();
  });
});
