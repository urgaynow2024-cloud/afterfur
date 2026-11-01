import type { CSSProperties } from "react";
import { coerceEffectId, coerceFontId, effectClassName, fontClassName, fontInlineStyle, type EffectId, type FontId } from "@/lib/fonts";

export type ProfileCustomisation = {
  accent?: string | null;
  usernameColor?: string | null;
  displayNameColor?: string | null;
  usernameEffect?: EffectId | null;
  displayNameEffect?: EffectId | null;
  font?: FontId | null;
  gradientStart?: string | null;
  gradientEnd?: string | null;
};

export function parseProfileCustomisation(value: unknown): ProfileCustomisation {
  if (!value || typeof value !== "object") return {};
  const v = value as Record<string, unknown>;
  const result: ProfileCustomisation = {};
  if (typeof v.accent === "string") result.accent = v.accent;
  if (typeof v.usernameColor === "string") result.usernameColor = v.usernameColor;
  if (typeof v.displayNameColor === "string") result.displayNameColor = v.displayNameColor;
  result.usernameEffect = coerceEffectId(v.usernameEffect);
  result.displayNameEffect = coerceEffectId(v.displayNameEffect ?? v.effect);
  result.font = coerceFontId(v.font);
  if (typeof v.gradientStart === "string") result.gradientStart = v.gradientStart;
  if (typeof v.gradientEnd === "string") result.gradientEnd = v.gradientEnd;
  return result;
}

export function nameStyle(color?: string | null, effect?: string | null): CSSProperties {
  const style: CSSProperties = {};
  if (color) style.color = color;
  if (effect === "neon") style.textShadow = "0 0 8px currentColor";
  if (effect === "shadow") style.textShadow = "2px 2px 4px rgba(0,0,0,0.45)";
  if (effect === "ember") style.textShadow = "0 0 6px #ff6b35, 0 0 12px #ff3d00";
  if (effect === "frost") style.textShadow = "0 0 4px rgba(255,255,255,0.65)";
  return style;
}

export function displayNameStyle(customisation: ProfileCustomisation, reducedMotion = false): { className: string; style: CSSProperties } {
  const fontId: FontId | null = customisation.font ?? null;
  const style: CSSProperties = { ...(fontInlineStyle(fontId) ?? {}) };
  if (customisation.displayNameColor) style.color = customisation.displayNameColor;
  if (customisation.displayNameEffect === "gradient") {
    style.background = `linear-gradient(135deg, ${customisation.gradientStart ?? "var(--af-brand)"}, ${customisation.gradientEnd ?? "#8b5cf6"})`;
    style.WebkitBackgroundClip = "text";
    style.WebkitTextFillColor = "transparent";
    style.backgroundClip = "text";
    delete style.color;
  }
  if (customisation.displayNameEffect === "neon") style.textShadow = "0 0 8px currentColor";
  if (customisation.displayNameEffect === "shadow") style.textShadow = "2px 2px 4px rgba(0,0,0,0.45)";
  if (customisation.displayNameEffect === "ember") style.textShadow = "0 0 6px #ff6b35, 0 0 12px #ff3d00";
  if (customisation.displayNameEffect === "frost") style.textShadow = "0 0 4px rgba(255,255,255,0.65)";
  return {
    className: `${fontClassName((fontId ?? "default") as FontId)} ${effectClassName(customisation.displayNameEffect ?? "solid", reducedMotion)}`.trim(),
    style,
  };
}

export function usernameStyle(customisation: ProfileCustomisation, reducedMotion = false): { className: string; style: CSSProperties } {
  const fontId: FontId | null = customisation.font ?? null;
  const style: CSSProperties = { ...(fontInlineStyle(fontId) ?? {}) };
  if (customisation.usernameColor) style.color = customisation.usernameColor;
  if (customisation.usernameEffect === "gradient") {
    style.background = `linear-gradient(135deg, ${customisation.gradientStart ?? "var(--af-brand)"}, ${customisation.gradientEnd ?? "#8b5cf6"})`;
    style.WebkitBackgroundClip = "text";
    style.WebkitTextFillColor = "transparent";
    style.backgroundClip = "text";
    delete style.color;
  }
  if (customisation.usernameEffect === "neon") style.textShadow = "0 0 8px currentColor";
  if (customisation.usernameEffect === "shadow") style.textShadow = "2px 2px 4px rgba(0,0,0,0.45)";
  if (customisation.usernameEffect === "ember") style.textShadow = "0 0 6px #ff6b35, 0 0 12px #ff3d00";
  if (customisation.usernameEffect === "frost") style.textShadow = "0 0 4px rgba(255,255,255,0.65)";
  return {
    className: `${fontClassName((fontId ?? "default") as FontId)} ${effectClassName(customisation.usernameEffect ?? "solid", reducedMotion)}`.trim(),
    style,
  };
}

export function customisationPreviewStyle(customisation: ProfileCustomisation, reducedMotion = false): { className: string; style: CSSProperties } {
  return displayNameStyle(customisation, reducedMotion);
}
