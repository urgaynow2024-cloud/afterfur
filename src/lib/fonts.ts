import type { CSSProperties } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { Comfortaa, Indie_Flower, JetBrains_Mono, Permanent_Marker, Playfair_Display, Press_Start_2P } from "next/font/google";

export const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
export const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
export const playfairDisplay = Playfair_Display({ variable: "--font-playfair", weight: ["400", "700"], subsets: ["latin"] });
export const jetbrainsMono = JetBrains_Mono({ variable: "--font-jetbrains", weight: ["400", "700"], subsets: ["latin"] });
export const comfortaa = Comfortaa({ variable: "--font-comfortaa", weight: ["300", "500", "700"], subsets: ["latin"] });
export const indieFlower = Indie_Flower({ variable: "--font-indie", weight: ["400"], subsets: ["latin"] } as unknown as Parameters<typeof Indie_Flower>[0]);
export const pressStart2P = Press_Start_2P({ variable: "--font-pixel", weight: ["400"], subsets: ["latin"] });
export const permanentMarker = Permanent_Marker({ variable: "--font-marker", weight: ["400"], subsets: ["latin"] } as unknown as Parameters<typeof Permanent_Marker>[0]);

export type FontId =
  | "default"
  | "bold"
  | "rounded"
  | "serif"
  | "decorative"
  | "pixel"
  | "monospace"
  | "handwritten";

export const FONTS: { id: FontId; label: string; className: string; style?: CSSProperties }[] = [
  { id: "default", label: "Default", className: geist.className },
  { id: "bold", label: "Bold", className: geist.className, style: { fontWeight: 700 } },
  { id: "rounded", label: "Rounded", className: comfortaa.className },
  { id: "serif", label: "Serif", className: playfairDisplay.className },
  { id: "decorative", label: "Decorative", className: permanentMarker.className },
  { id: "pixel", label: "Pixel", className: pressStart2P.className },
  { id: "monospace", label: "Monospace", className: jetbrainsMono.className },
  { id: "handwritten", label: "Handwritten", className: indieFlower.className },
] as const;

export const FONT_BY_ID = new Map(FONTS.map((f) => [f.id, f]));

export function fontClassName(id: FontId): string {
  return FONT_BY_ID.get(id)?.className ?? geist.className;
}

export function fontInlineStyle(fontId: FontId | null | undefined): CSSProperties | undefined {
  if (!fontId) return undefined;
  return FONT_BY_ID.get(fontId)?.style;
}

export function coerceFontId(value: unknown): FontId | null {
  if (typeof value === "string" && FONT_BY_ID.has(value as FontId)) return value as FontId;
  return null;
}

export type EffectId =
  | "solid"
  | "gradient"
  | "neon"
  | "toon"
  | "pop"
  | "gummy"
  | "prism"
  | "shadow"
  | "outline"
  | "metallic"
  | "glitch"
  | "frost"
  | "ember"
  | "aurora";

export type EffectOption = { id: EffectId; label: string };
export const EFFECTS: EffectOption[] = [
  { id: "solid", label: "Solid" },
  { id: "gradient", label: "Gradient" },
  { id: "neon", label: "Neon" },
  { id: "toon", label: "Toon" },
  { id: "pop", label: "Pop" },
  { id: "gummy", label: "Gummy" },
  { id: "prism", label: "Prism" },
  { id: "shadow", label: "Shadow" },
  { id: "outline", label: "Outline" },
  { id: "metallic", label: "Metallic" },
  { id: "glitch", label: "Glitch" },
  { id: "frost", label: "Frost" },
  { id: "ember", label: "Ember" },
  { id: "aurora", label: "Aurora" },
] as const;

export const EFFECT_BY_ID = new Map(EFFECTS.map((e) => [e.id, e]));

export function coerceEffectId(value: unknown): EffectId | null {
  if (typeof value === "string" && EFFECT_BY_ID.has(value as EffectId)) return value as EffectId;
  return null;
}

export function effectClassName(id: EffectId, reducedMotion: boolean): string {
  const animated = ["glitch", "aurora"];
  if (reducedMotion && animated.includes(id)) return "af-effect-none";
  return `af-effect-${id}`;
}
