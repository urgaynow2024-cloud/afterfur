"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { callRpc } from "@/lib/rpc";
import { EFFECTS, effectClassName, FONTS, fontClassName, fontInlineStyle, type EffectId, type FontId } from "@/lib/fonts";
import { type ProfileCustomisation } from "@/lib/profileCustomisation";

type ProfileCustomisationStudioProps = {
  isPrime: boolean;
  customisation: ProfileCustomisation;
  displayName: string;
  username: string;
};

const DEFAULT_CUSTOMISATION: ProfileCustomisation = {
  accent: "#8b5cf6",
  usernameColor: "#ffffff",
  displayNameColor: "#ffffff",
  usernameEffect: "solid",
  displayNameEffect: "solid",
  font: "default",
};

const CURATED_COLOURS = [
  "#ffffff", "#f8fafc", "#e2e8f0", "#cbd5e1",
  "#8b5cf6", "#a78bfa", "#c084fc", "#d8b4fe",
  "#34d399", "#22c55e", "#10b981",
  "#fb7185", "#f472b6", "#ec4899",
  "#f59e0b", "#f97316", "#ef4444",
  "#6366f1", "#4f46e5", "#4338ca",
] as const;

const HEX_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function isValidColour(value: string): boolean {
  return HEX_REGEX.test(value);
}

function customisationEqual(a: ProfileCustomisation, b: ProfileCustomisation): boolean {
  const keys = ["accent", "usernameColor", "displayNameColor", "usernameEffect", "displayNameEffect", "font", "gradientStart", "gradientEnd"] as const;
  return keys.every((k) => a[k] === b[k]);
}

export default function ProfileCustomisationStudio({ isPrime, customisation: initial, displayName, username }: ProfileCustomisationStudioProps) {
  const [draft, setDraft] = useState<ProfileCustomisation>({ ...DEFAULT_CUSTOMISATION, ...initial });
  const [saved, setSaved] = useState<ProfileCustomisation>({ ...draft });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [reducedMotion, setReducedMotion] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)")?.matches ?? false;
  });

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!mql) return;
    const handler = () => setReducedMotion(mql?.matches ?? false);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);
  const [selectedFont, setSelectedFont] = useState<FontId>(draft.font ?? "default");
  const [selectedDisplayEffect, setSelectedDisplayEffect] = useState<EffectId>(draft.displayNameEffect ?? "solid");
  const [selectedUsernameEffect, setSelectedUsernameEffect] = useState<EffectId>(draft.usernameEffect ?? "solid");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!mql) return;
    const handler = () => setReducedMotion(mql?.matches ?? false);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  const hasChanges = useMemo(() => !customisationEqual(draft, saved), [draft, saved]);

  const setField = useCallback((key: keyof ProfileCustomisation, value: string | null) => {
    setDraft((prev) => {
      const next = { ...prev, [key]: value };
      return next;
    });
  }, []);

  const handleSave = useCallback(async () => {
    const supabase = createClient();
    if (!supabase) return;
    if (!isPrime) { setError("Profile customisation requires an active PawPass Prime entitlement."); return; }
    setSaving(true); setError(""); setMsg("");
    const { error } = await callRpc(supabase, "update_profile_customisation", { p_config: draft });
    if (error) { setError(error.message); setSaving(false); return; }
    setSaved({ ...draft }); setMsg("Customisation saved."); setSaving(false);
  }, [draft, isPrime]);

  const handleReset = useCallback(() => {
    setDraft({ ...saved });
    setSelectedFont(saved.font ?? "default");
    setSelectedDisplayEffect(saved.displayNameEffect ?? "solid");
    setSelectedUsernameEffect(saved.usernameEffect ?? "solid");
    setError(""); setMsg("");
  }, [saved]);

  const colourInputValid = useMemo(() => {
    const colours = [draft.accent, draft.usernameColor, draft.displayNameColor, draft.gradientStart, draft.gradientEnd].filter(
      (c): c is string => typeof c === "string" && c !== "",
    );
    return colours.length === 0 || colours.every(isValidColour);
  }, [draft.accent, draft.usernameColor, draft.displayNameColor, draft.gradientStart, draft.gradientEnd]);

  if (!isPrime) {
    return (
      <section className="mt-4 rounded-2xl border border-af-border bg-af-surface p-5 shadow-sm sm:p-6">
        <h2 className="text-base font-semibold text-af-text">Public Profile Customisation</h2>
        <p className="mt-1 text-sm text-af-muted">Visible to other users on your profile.</p>
        <div className="mt-4 rounded-xl border border-af-border/40 bg-af-surface-2/50 p-4">
          <p className="text-sm text-af-muted">Activate PawPass Prime to unlock profile customisation.</p>
          <p className="mt-1 text-xs text-af-muted">Prime benefits include custom profile accent, display-name styling, colours and effects.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-4 rounded-2xl border border-af-border bg-af-surface p-5 shadow-sm sm:p-6">
      <h2 className="text-base font-semibold text-af-text">Public Profile Customisation</h2>
      <p className="mt-1 text-sm text-af-muted">Visible to other users on your profile. Prime benefit.</p>
      {error && <p role="alert" className="mt-3 rounded-md border border-af-danger/40 bg-af-danger/10 px-3 py-2 text-sm text-af-danger">{error}</p>}
      {msg && <p role="status" className="mt-3 rounded-md border border-af-border bg-af-surface-2 px-3 py-2 text-sm text-af-text-2">{msg}</p>}

      <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6 min-w-0">
          <div className="rounded-xl border border-af-border bg-af-surface-2/40 p-4 sm:p-5">
            <h3 className="text-sm font-semibold text-af-text">Display name font</h3>
            <p className="mt-1 text-xs text-af-muted">Choose how your display name appears on your profile.</p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {FONTS.map((font) => {
                const selected = selectedFont === font.id;
                return (
                  <button
                    key={font.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => { setSelectedFont(font.id); setDraft((prev) => ({ ...prev, font: font.id })); }}
                    className={`flex flex-col items-center gap-1.5 rounded-lg border px-3 py-3 text-xs transition-colors ${selected ? "border-af-brand bg-af-brand/10" : "border-af-border hover:bg-af-surface-2"} ${font.style ? "" : ""}`}
                  >
                    <span className={`leading-none ${font.className} ${font.style?.fontWeight ? `font-${font.style.fontWeight}` : ""}`}>{displayName || username}</span>
                    <span className={selected ? "text-af-brand" : "text-af-text-2"}>{font.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-af-border bg-af-surface-2/40 p-4 sm:p-5">
              <h3 className="text-sm font-semibold text-af-text">Display name effect</h3>
              <p className="mt-1 text-xs text-af-muted">Styling applied to your display name.</p>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {EFFECTS.map((effect) => {
                  const selected = selectedDisplayEffect === effect.id;
                  return (
                    <button
                      key={effect.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => { setSelectedDisplayEffect(effect.id); setDraft((prev) => ({ ...prev, displayNameEffect: effect.id })); }}
                      className={`rounded-lg border px-3 py-3 text-xs transition-colors flex flex-col items-center gap-1.5 ${selected ? "border-af-brand bg-af-brand/10" : "border-af-border hover:bg-af-surface-2"} af-effect-${effect.id} ${reducedMotion && (effect.id === "glitch" || effect.id === "aurora") ? "af-effect-none" : ""}`}
                    >
                      <span className={`${effect.id === "glitch" ? "" : ""} leading-none`} data-glitch={displayName}>{displayName || username}</span>
                      <span className={selected ? "text-af-brand" : "text-af-text-2"}>{effect.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="rounded-xl border border-af-border bg-af-surface-2/40 p-4 sm:p-5">
              <h3 className="text-sm font-semibold text-af-text">Username effect</h3>
              <p className="mt-1 text-xs text-af-muted">Styling applied to your @username.</p>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {EFFECTS.map((effect) => {
                  const selected = selectedUsernameEffect === effect.id;
                  return (
                    <button
                      key={`username-${effect.id}`}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => { setSelectedUsernameEffect(effect.id); setDraft((prev) => ({ ...prev, usernameEffect: effect.id })); }}
                      className={`rounded-lg border px-3 py-3 text-xs transition-colors flex flex-col items-center gap-1.5 ${selected ? "border-af-brand bg-af-brand/10" : "border-af-border hover:bg-af-surface-2"} af-effect-${effect.id} ${reducedMotion && (effect.id === "glitch" || effect.id === "aurora") ? "af-effect-none" : ""}`}
                    >
                      <span className={`@${username} leading-none`} data-glitch={`@${username}`}>{`@${username}`}</span>
                      <span className={selected ? "text-af-brand" : "text-af-text-2"}>{effect.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-af-border bg-af-surface-2/40 p-4 sm:p-5 space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-af-text">Display name colour</h3>
              <p className="mt-1 text-xs text-af-muted">Pick a preset or enter a custom hex colour.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {CURATED_COLOURS.map((colour) => {
                  const selected = draft.displayNameColor === colour;
                  return (
                    <button
                      key={colour}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => { setField("displayNameColor", colour); }}
                      className={`h-9 w-9 rounded-full border-2 transition-colors ${selected ? "ring-2 ring-af-brand ring-offset-1 ring-offset-af-surface" : "border-af-border hover:border-af-brand/40"}`}
                      style={{ backgroundColor: colour }}
                    />
                  );
                })}
                <button
                  type="button"
                  onClick={() => setField("displayNameColor", draft.displayNameColor ?? "#ffffff")}
                  className="relative h-9 w-9 rounded-full border-2 border-af-border flex items-center justify-center"
                >
                  <input
                    type="color"
                    value={draft.displayNameColor ?? "#ffffff"}
                    onChange={(e) => setField("displayNameColor", e.target.value)}
                    className="absolute inset-0 h-full w-full opacity-0 cursor-pointer"
                    aria-label="Custom display name colour"
                  />
                  <span className="text-[10px]" aria-hidden="true">+</span>
                </button>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <label className="text-xs text-af-muted">Custom hex</label>
                <input
                  type="text"
                  value={draft.displayNameColor ?? ""}
                  onChange={(e) => setField("displayNameColor", e.target.value)}
                  className="af-field w-full px-2 py-1.5 text-xs"
                  placeholder="#ffffff"
                  aria-label="Custom display name colour hex"
                  disabled={!colourInputValid}
                />
                {!draft.displayNameColor && <span className="text-xs text-af-muted">default</span>}
                {draft.displayNameColor && !isValidColour(draft.displayNameColor) && <span className="text-xs text-af-danger">Invalid hex</span>}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-af-text">Username colour</h3>
              <p className="mt-1 text-xs text-af-muted">Pick a preset or enter a custom hex colour.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {CURATED_COLOURS.map((colour) => {
                  const selected = draft.usernameColor === colour;
                  return (
                    <button
                      key={`user-${colour}`}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => { setField("usernameColor", colour); }}
                      className={`h-9 w-9 rounded-full border-2 transition-colors ${selected ? "ring-2 ring-af-brand ring-offset-1 ring-offset-af-surface" : "border-af-border hover:border-af-brand/40"}`}
                      style={{ backgroundColor: colour }}
                    />
                  );
                })}
                <button
                  type="button"
                  onClick={() => setField("usernameColor", draft.usernameColor ?? "#ffffff")}
                  className="relative h-9 w-9 rounded-full border-2 border-af-border flex items-center justify-center"
                >
                  <input
                    type="color"
                    value={draft.usernameColor ?? "#ffffff"}
                    onChange={(e) => setField("usernameColor", e.target.value)}
                    className="absolute inset-0 h-full w-full opacity-0 cursor-pointer"
                    aria-label="Custom username colour"
                  />
                  <span className="text-[10px]" aria-hidden="true">+</span>
                </button>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <label className="text-xs text-af-muted">Custom hex</label>
                <input
                  type="text"
                  value={draft.usernameColor ?? ""}
                  onChange={(e) => setField("usernameColor", e.target.value)}
                  className="af-field w-full px-2 py-1.5 text-xs"
                  placeholder="#ffffff"
                  aria-label="Custom username colour hex"
                />
                {draft.usernameColor && !isValidColour(draft.usernameColor) && <span className="text-xs text-af-danger">Invalid hex</span>}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold text-af-text">Profile accent colour</h3>
                <p className="mt-1 text-xs text-af-muted">Accent used across your profile UI.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {CURATED_COLOURS.map((colour) => {
                    const selected = draft.accent === colour;
                    return (
                      <button
                        key={`accent-${colour}`}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => { setField("accent", colour); }}
                        className={`h-9 w-9 rounded-full border-2 transition-colors ${selected ? "ring-2 ring-af-brand ring-offset-1 ring-offset-af-surface" : "border-af-border hover:border-af-brand/40"}`}
                        style={{ backgroundColor: colour }}
                      />
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setField("accent", draft.accent ?? "#8b5cf6")}
                    className="relative h-9 w-9 rounded-full border-2 border-af-border flex items-center justify-center"
                  >
                    <input
                      type="color"
                      value={draft.accent ?? "#8b5cf6"}
                      onChange={(e) => setField("accent", e.target.value)}
                      className="absolute inset-0 h-full w-full opacity-0 cursor-pointer"
                      aria-label="Custom profile accent colour"
                    />
                    <span className="text-[10px]" aria-hidden="true">+</span>
                  </button>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <label className="text-xs text-af-muted">Custom hex</label>
                  <input
                    type="text"
                    value={draft.accent ?? ""}
                    onChange={(e) => setField("accent", e.target.value)}
                    className="af-field w-full px-2 py-1.5 text-xs"
                    placeholder="#8b5cf6"
                    aria-label="Custom profile accent hex"
                  />
                  {draft.accent && !isValidColour(draft.accent) && <span className="text-xs text-af-danger">Invalid hex</span>}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-af-text">Gradient colours</h3>
                <p className="mt-1 text-xs text-af-muted">Start and end colours for gradient effects.</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-af-muted">Start</label>
                    <input
                      type="color"
                      value={draft.gradientStart ?? "#8b5cf6"}
                      onChange={(e) => setField("gradientStart", e.target.value)}
                      className="af-field h-10 w-full cursor-pointer"
                      aria-label="Gradient start colour"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-af-muted">End</label>
                    <input
                      type="color"
                      value={draft.gradientEnd ?? "#8b5cf6"}
                      onChange={(e) => setField("gradientEnd", e.target.value)}
                      className="af-field h-10 w-full cursor-pointer"
                      aria-label="Gradient end colour"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <aside className="xl:sticky xl:top-20 self-start">
          <div className="rounded-xl border border-af-border bg-af-surface-2/40 p-4 sm:p-5 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-af-text">Preview</h3>
              <p className="mt-1 text-xs text-af-muted">Live preview of how your name will appear on your profile.</p>
            </div>
            <div className="flex items-center justify-center rounded-lg border border-af-border bg-af-surface p-6 min-h-[120px]">
              <StyledNamePreview
                displayName={displayName}
                username={username}
                accent={draft.accent ?? "#8b5cf6"}
                font={selectedFont}
                displayNameEffect={selectedDisplayEffect}
                usernameEffect={selectedUsernameEffect}
                gradientStart={draft.gradientStart}
                gradientEnd={draft.gradientEnd}
                reducedMotion={reducedMotion}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!hasChanges || saving || !colourInputValid}
                onClick={handleReset}
                className="min-h-10 rounded-md border border-af-border px-4 text-xs font-semibold text-af-text-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:bg-af-surface-2"
              >
                Reset
              </button>
              <button
                type="button"
                disabled={!hasChanges || saving || !colourInputValid}
                onClick={handleSave}
                className="min-h-10 rounded-md bg-af-brand px-4 text-xs font-semibold text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:bg-af-brand-hover"
              >
                {saving ? "Saving…" : "Save customisation"}
              </button>
            </div>
            {!hasChanges && <span className="text-xs text-af-muted">No unsaved changes</span>}
          </div>
        </aside>
      </div>
    </section>
  );
}

function StyledNamePreview({ displayName, username, accent, font, displayNameEffect, usernameEffect, gradientStart, gradientEnd, reducedMotion }: {
  displayName: string; username: string; accent: string; font: FontId; displayNameEffect: EffectId; usernameEffect: EffectId; gradientStart?: string | null; gradientEnd?: string | null; reducedMotion: boolean;
}) {
  const dStyle: React.CSSProperties = { ...fontInlineStyle(font) };
  if (displayNameEffect === "gradient") {
    dStyle.background = `linear-gradient(135deg, ${gradientStart ?? accent}, ${gradientEnd ?? accent})`;
    dStyle.WebkitBackgroundClip = "text";
    dStyle.WebkitTextFillColor = "transparent";
    dStyle.backgroundClip = "text";
  } else {
    dStyle.color = "#ffffff";
  }
  const uStyle: React.CSSProperties = { ...fontInlineStyle(font) };
  if (usernameEffect === "gradient") {
    uStyle.background = `linear-gradient(135deg, ${gradientStart ?? accent}, ${gradientEnd ?? accent})`;
    uStyle.WebkitBackgroundClip = "text";
    uStyle.WebkitTextFillColor = "transparent";
    uStyle.backgroundClip = "text";
  } else {
    uStyle.color = "#e2e8f0";
  }
  return (
    <div className="flex flex-col gap-1">
      <span className={`text-xl font-semibold tracking-tight leading-none ${fontClassName(font)} ${effectClassName(displayNameEffect, reducedMotion)}`} style={dStyle} data-glitch={displayName}>
        {displayName}
      </span>
      <span className={`text-xs leading-none ${fontClassName(font)} ${effectClassName(usernameEffect, reducedMotion)}`} style={uStyle} data-glitch={username}>
        @{username}
      </span>
    </div>
  );
}
