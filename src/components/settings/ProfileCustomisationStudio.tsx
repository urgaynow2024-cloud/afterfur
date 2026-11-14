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
      <section aria-labelledby="profile-customisation-heading" className="rounded-2xl border border-af-border bg-af-surface p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="profile-customisation-heading" className="text-sm font-semibold text-af-text">Public Profile Customisation</h3>
          <span className="rounded-full border border-af-border bg-af-surface-2 px-2.5 py-0.5 text-[11px] font-medium text-af-muted">PawPass Prime</span>
        </div>
        <p className="mt-1 text-sm text-af-muted">Visible to other users on your profile.</p>
        <div className="mt-3 min-w-0 rounded-xl border border-af-border bg-af-surface-2/40 p-4">
          <p className="text-sm font-medium text-af-text">Activate PawPass Prime to unlock profile customisation.</p>
          <p className="mt-1 text-xs leading-relaxed text-af-muted">Prime benefits include custom profile accent, display-name fonts, styling, colours and effects.</p>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="profile-customisation-heading" className="rounded-2xl border border-af-border bg-af-surface p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="profile-customisation-heading" className="text-sm font-semibold text-af-text">Public Profile Customisation</h3>
        <span className="rounded-full border border-af-success/30 bg-af-success/10 px-2.5 py-0.5 text-[11px] font-medium text-af-success">Prime Unlocked</span>
      </div>
      <p className="mt-1 text-sm text-af-muted">Customise how your name appears to other users on your public profile.</p>
      {error && <p role="alert" className="mt-3 rounded-md border border-af-danger/40 bg-af-danger/10 px-3 py-2 text-sm text-af-danger">{error}</p>}
      {msg && <p role="status" className="mt-3 rounded-md border border-af-success/30 bg-af-success/10 px-3 py-2 text-sm text-af-success">{msg}</p>}

      <div className="mt-4 min-w-0 space-y-3.5">
        <div className="min-w-0 space-y-3.5">
          <div className="min-w-0 rounded-xl border border-af-border bg-af-surface-2/40 p-3.5 sm:p-4">
            <h3 className="text-sm font-semibold text-af-text">Display name font</h3>
            <p className="mt-0.5 text-xs leading-relaxed text-af-muted">Choose how your display name appears on your profile.</p>
            <div className="af-fonts-grid mt-3">
              {FONTS.map((font) => {
                const selected = selectedFont === font.id;
                return (
                  <button
                    key={font.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => { setSelectedFont(font.id); setDraft((prev) => ({ ...prev, font: font.id })); }}
                    className={`flex min-h-[76px] min-w-0 flex-col items-center justify-center gap-1.5 overflow-hidden rounded-lg border px-2 py-2.5 text-center text-xs transition-colors ${selected ? "border-af-brand bg-af-brand/10" : "border-af-border bg-af-surface/50 hover:bg-af-surface-2"}`}
                  >
                    <span className={`line-clamp-2 max-w-full break-words px-0.5 text-sm leading-snug ${font.className} ${font.style?.fontWeight ? `font-${font.style.fontWeight}` : ""}`}>
                      {displayName || username}
                    </span>
                    <span className={`max-w-full truncate text-[11px] font-medium ${selected ? "text-af-brand-soft" : "text-af-text-2"}`}>
                      {font.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="min-w-0 space-y-3.5 sm:space-y-4">
            <div className="min-w-0 rounded-xl border border-af-border bg-af-surface-2/40 p-3.5 sm:p-4">
              <h3 className="text-sm font-semibold text-af-text">Display name effect</h3>
              <p className="mt-0.5 text-xs leading-relaxed text-af-muted">Styling applied to your display name.</p>
              <div className="af-effects-grid mt-3">
                {EFFECTS.map((effect) => {
                  const selected = selectedDisplayEffect === effect.id;
                  return (
                    <button
                      key={effect.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => { setSelectedDisplayEffect(effect.id); setDraft((prev) => ({ ...prev, displayNameEffect: effect.id })); }}
                      className={`af-effect-card group flex min-h-[100px] min-w-0 flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border px-3 py-3 text-center transition-colors ${
                        selected
                          ? "border-af-brand bg-af-brand/10 shadow-sm shadow-af-brand/10"
                          : "border-af-border bg-af-surface/50 hover:border-af-border-strong hover:bg-af-surface-2"
                      }`}
                    >
                      <span className="flex min-h-[1.85rem] w-full min-w-0 items-center justify-center px-0.5 text-center text-sm font-semibold leading-snug text-af-text">
                        <span
                          className={`af-effect-preview-text ${effectClassName(effect.id, reducedMotion)}`}
                          data-glitch={displayName || username}
                        >
                          {displayName || username}
                        </span>
                      </span>
                      <span
                        className={`inline-flex max-w-full items-center truncate rounded-md px-2 py-0.5 text-[11px] font-medium ${
                          selected
                            ? "bg-af-brand/20 text-af-brand-soft"
                            : "bg-af-surface-raised/80 text-af-text-2 group-hover:text-af-text"
                        }`}
                      >
                        {effect.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="min-w-0 rounded-xl border border-af-border bg-af-surface-2/40 p-3.5 sm:p-4">
              <h3 className="text-sm font-semibold text-af-text">Username effect</h3>
              <p className="mt-0.5 text-xs leading-relaxed text-af-muted">Styling applied to your @username.</p>
              <div className="af-effects-grid mt-3">
                {EFFECTS.map((effect) => {
                  const selected = selectedUsernameEffect === effect.id;
                  return (
                    <button
                      key={`username-${effect.id}`}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => { setSelectedUsernameEffect(effect.id); setDraft((prev) => ({ ...prev, usernameEffect: effect.id })); }}
                      className={`af-effect-card group flex min-h-[100px] min-w-0 flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border px-3 py-3 text-center transition-colors ${
                        selected
                          ? "border-af-brand bg-af-brand/10 shadow-sm shadow-af-brand/10"
                          : "border-af-border bg-af-surface/50 hover:border-af-border-strong hover:bg-af-surface-2"
                      }`}
                    >
                      <span className="flex min-h-[1.85rem] w-full min-w-0 items-center justify-center px-0.5 text-center text-sm font-semibold leading-snug text-af-text">
                        <span
                          className={`af-effect-preview-text ${effectClassName(effect.id, reducedMotion)}`}
                          data-glitch={`@${username}`}
                        >
                          @{username}
                        </span>
                      </span>
                      <span
                        className={`inline-flex max-w-full items-center truncate rounded-md px-2 py-0.5 text-[11px] font-medium ${
                          selected
                            ? "bg-af-brand/20 text-af-brand-soft"
                            : "bg-af-surface-raised/80 text-af-text-2 group-hover:text-af-text"
                        }`}
                      >
                        {effect.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="min-w-0 space-y-3.5 rounded-xl border border-af-border bg-af-surface-2/40 p-3.5 sm:p-4">
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-af-text">Display name colour</h3>
                <p className="mt-0.5 text-xs text-af-muted">Preset or custom hex colour for your display name.</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {CURATED_COLOURS.map((colour) => {
                    const selected = draft.displayNameColor === colour;
                    return (
                      <button
                        key={colour}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        aria-label={`Display name colour ${colour}`}
                        onClick={() => { setField("displayNameColor", colour); }}
                        className={`h-7 w-7 rounded-full border-2 transition-colors ${selected ? "ring-2 ring-af-brand ring-offset-1 ring-offset-af-surface" : "border-af-border hover:border-af-brand/40"}`}
                        style={{ backgroundColor: colour }}
                      />
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setField("displayNameColor", draft.displayNameColor ?? "#ffffff")}
                    className="relative flex h-7 w-7 items-center justify-center rounded-full border-2 border-af-border"
                    aria-label="Pick custom display name colour"
                  >
                    <input
                      type="color"
                      value={draft.displayNameColor ?? "#ffffff"}
                      onChange={(e) => setField("displayNameColor", e.target.value)}
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                      aria-label="Custom display name colour"
                    />
                    <span className="text-[10px]" aria-hidden="true">+</span>
                  </button>
                </div>
                <div className="mt-2 flex min-w-0 items-center gap-2">
                  <label className="shrink-0 text-xs text-af-muted">Custom hex</label>
                  <input
                    type="text"
                    value={draft.displayNameColor ?? ""}
                    onChange={(e) => setField("displayNameColor", e.target.value)}
                    className="af-field min-w-0 flex-1 bg-af-surface px-2 py-1 text-xs"
                    placeholder="#ffffff"
                    aria-label="Custom display name colour hex"
                    disabled={!colourInputValid}
                  />
                  {draft.displayNameColor && !isValidColour(draft.displayNameColor) && <span className="shrink-0 text-xs text-af-danger">Invalid hex</span>}
                </div>
              </div>

              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-af-text">Username colour</h3>
                <p className="mt-0.5 text-xs text-af-muted">Preset or custom hex colour for your @username.</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {CURATED_COLOURS.map((colour) => {
                    const selected = draft.usernameColor === colour;
                    return (
                      <button
                        key={`user-${colour}`}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        aria-label={`Username colour ${colour}`}
                        onClick={() => { setField("usernameColor", colour); }}
                        className={`h-7 w-7 rounded-full border-2 transition-colors ${selected ? "ring-2 ring-af-brand ring-offset-1 ring-offset-af-surface" : "border-af-border hover:border-af-brand/40"}`}
                        style={{ backgroundColor: colour }}
                      />
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setField("usernameColor", draft.usernameColor ?? "#ffffff")}
                    className="relative flex h-7 w-7 items-center justify-center rounded-full border-2 border-af-border"
                    aria-label="Pick custom username colour"
                  >
                    <input
                      type="color"
                      value={draft.usernameColor ?? "#ffffff"}
                      onChange={(e) => setField("usernameColor", e.target.value)}
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                      aria-label="Custom username colour"
                    />
                    <span className="text-[10px]" aria-hidden="true">+</span>
                  </button>
                </div>
                <div className="mt-2 flex min-w-0 items-center gap-2">
                  <label className="shrink-0 text-xs text-af-muted">Custom hex</label>
                  <input
                    type="text"
                    value={draft.usernameColor ?? ""}
                    onChange={(e) => setField("usernameColor", e.target.value)}
                    className="af-field min-w-0 flex-1 bg-af-surface px-2 py-1 text-xs"
                    placeholder="#ffffff"
                    aria-label="Custom username colour hex"
                  />
                  {draft.usernameColor && !isValidColour(draft.usernameColor) && <span className="shrink-0 text-xs text-af-danger">Invalid hex</span>}
                </div>
              </div>

              <div className="min-w-0 border-t border-af-border/70 pt-3.5 sm:col-span-2">
                <h3 className="text-sm font-semibold text-af-text">Profile accent & gradient colours</h3>
                <div className="mt-2 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                  <div className="min-w-0">
                    <p className="text-xs text-af-muted">Accent used across your profile UI.</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {CURATED_COLOURS.map((colour) => {
                        const selected = draft.accent === colour;
                        return (
                          <button
                            key={`accent-${colour}`}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            aria-label={`Profile accent colour ${colour}`}
                            onClick={() => { setField("accent", colour); }}
                            className={`h-7 w-7 rounded-full border-2 transition-colors ${selected ? "ring-2 ring-af-brand ring-offset-1 ring-offset-af-surface" : "border-af-border hover:border-af-brand/40"}`}
                            style={{ backgroundColor: colour }}
                          />
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => setField("accent", draft.accent ?? "#8b5cf6")}
                        className="relative flex h-7 w-7 items-center justify-center rounded-full border-2 border-af-border"
                        aria-label="Pick custom profile accent colour"
                      >
                        <input
                          type="color"
                          value={draft.accent ?? "#8b5cf6"}
                          onChange={(e) => setField("accent", e.target.value)}
                          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                          aria-label="Custom profile accent colour"
                        />
                        <span className="text-[10px]" aria-hidden="true">+</span>
                      </button>
                    </div>
                    <div className="mt-2 flex min-w-0 items-center gap-2">
                      <label className="shrink-0 text-xs text-af-muted">Custom hex</label>
                      <input
                        type="text"
                        value={draft.accent ?? ""}
                        onChange={(e) => setField("accent", e.target.value)}
                        className="af-field min-w-0 flex-1 bg-af-surface px-2 py-1 text-xs"
                        placeholder="#8b5cf6"
                        aria-label="Custom profile accent hex"
                      />
                      {draft.accent && !isValidColour(draft.accent) && <span className="shrink-0 text-xs text-af-danger">Invalid hex</span>}
                    </div>
                  </div>

                  <div className="min-w-0">
                    <p className="text-xs text-af-muted">Start and end colours for gradient effects.</p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <div className="flex min-w-0 flex-col gap-1">
                        <label className="text-xs text-af-muted">Gradient start</label>
                        <input
                          type="color"
                          value={draft.gradientStart ?? "#8b5cf6"}
                          onChange={(e) => setField("gradientStart", e.target.value)}
                          className="af-field h-9 w-full min-w-0 cursor-pointer bg-af-surface"
                          aria-label="Gradient start colour"
                        />
                      </div>
                      <div className="flex min-w-0 flex-col gap-1">
                        <label className="text-xs text-af-muted">Gradient end</label>
                        <input
                          type="color"
                          value={draft.gradientEnd ?? "#8b5cf6"}
                          onChange={(e) => setField("gradientEnd", e.target.value)}
                          className="af-field h-9 w-full min-w-0 cursor-pointer bg-af-surface"
                          aria-label="Gradient end colour"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="min-w-0 space-y-3 rounded-xl border border-af-border bg-af-surface-2/40 p-3.5 sm:p-4">
          <div>
            <h3 className="text-sm font-semibold text-af-text">Live preview</h3>
            <p className="mt-0.5 text-xs text-af-muted">Live preview of how your name will appear on your profile.</p>
          </div>
          <div className="flex min-h-[112px] w-full min-w-0 items-center justify-center overflow-hidden rounded-xl border border-af-border bg-af-surface p-4 sm:p-5">
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
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!hasChanges || saving || !colourInputValid}
              onClick={handleReset}
              className="min-h-9 rounded-lg border border-af-border bg-af-surface px-4 text-xs font-semibold text-af-text-2 transition-colors hover:text-af-text disabled:cursor-not-allowed disabled:opacity-40"
            >
              Reset
            </button>
            <button
              type="button"
              disabled={!hasChanges || saving || !colourInputValid}
              onClick={handleSave}
              className="min-h-9 rounded-lg bg-af-brand px-4 text-xs font-semibold text-white transition-colors hover:bg-af-brand-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save customisation"}
            </button>
            {!hasChanges && <span className="text-xs text-af-muted">No unsaved changes</span>}
          </div>
        </div>
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
    <div className="af-live-preview flex w-full min-w-0 max-w-full flex-col items-center justify-center gap-1.5 px-1 text-center">
      <span
        className={`af-effect-preview-text max-w-full min-w-0 break-words text-xl font-semibold leading-snug tracking-tight ${fontClassName(font)} ${effectClassName(displayNameEffect, reducedMotion)}`}
        style={dStyle}
        data-glitch={displayName}
      >
        {displayName}
      </span>
      <span
        className={`af-effect-preview-text max-w-full min-w-0 break-words text-xs leading-snug ${fontClassName(font)} ${effectClassName(usernameEffect, reducedMotion)}`}
        style={uStyle}
        data-glitch={username}
      >
        @{username}
      </span>
    </div>
  );
}
