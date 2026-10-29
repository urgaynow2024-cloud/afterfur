import type { CSSProperties } from "react";

export type ProfileCustomisation = {
  accent?: string;
  usernameColor?: string;
  displayNameColor?: string;
  effect?: string;
};

export function parseProfileCustomisation(value: unknown): ProfileCustomisation {
  if (!value || typeof value !== "object") return {};
  const v = value as Record<string, unknown>;
  const result: ProfileCustomisation = {};
  if (typeof v.accent === "string") result.accent = v.accent;
  if (typeof v.usernameColor === "string") result.usernameColor = v.usernameColor;
  if (typeof v.displayNameColor === "string") result.displayNameColor = v.displayNameColor;
  if (typeof v.effect === "string") result.effect = v.effect;
  return result;
}

export function nameStyle(color?: string, effect?: string): CSSProperties {
  const style: React.CSSProperties = {};
  if (color) style.color = color;
  if (effect === "glow" || effect === "neon") style.textShadow = "0 0 8px currentColor";
  return style;
}
