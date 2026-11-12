"use client";
import { useEffect, useState } from "react";
import { displayNameStyle, usernameStyle, parseProfileCustomisation } from "@/lib/profileCustomisation";

type StyledNameCommon = {
  profile: { display_name: string | null; username: string; profile_customisation?: Record<string, unknown> | null };
  reducedMotion?: boolean;
  className?: string;
};

function useReducedMotion(defaultValue: boolean): boolean {
  const [motion, setMotion] = useState<boolean>(defaultValue);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = () => setMotion(mql?.matches ?? false);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);
  return motion;
}

export function StyledDisplayName({ profile, reducedMotion = false, className, size }: StyledNameCommon & { size?: "sm" | "base" | "lg" }) {
  const motion = useReducedMotion(typeof window === "undefined" ? false : (window.matchMedia("(prefers-reduced-motion: reduce)")?.matches ?? false));
  const rm = reducedMotion || motion;
  const customisation = parseProfileCustomisation(profile.profile_customisation);
  const { className: fxClass, style } = displayNameStyle(customisation, rm);
  const textSize = size === "sm" ? "text-sm" : size === "lg" ? "text-2xl font-semibold tracking-tight" : "text-lg font-semibold tracking-tight";
  return (
    <span className={`break-words ${textSize} text-af-text ${fxClass} ${className ?? ""}`} style={style}>
      {profile.display_name || profile.username}
    </span>
  );
}

export function StyledUsername({ profile, reducedMotion = false, className }: StyledNameCommon) {
  const motion = useReducedMotion(typeof window === "undefined" ? false : (window.matchMedia("(prefers-reduced-motion: reduce)")?.matches ?? false));
  const rm = reducedMotion || motion;
  const customisation = parseProfileCustomisation(profile.profile_customisation);
  const { className: fxClass, style } = usernameStyle(customisation, rm);
  return (
    <span className={`text-sm text-af-muted ${fxClass} ${className ?? ""}`} style={style}>
      @{profile.username}
    </span>
  );
}
