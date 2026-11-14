"use client";

import React, { useState } from "react";

const PRESET_PRONOUNS = [
  "he/him",
  "she/her",
  "they/them",
  "it/its",
  "he/they",
  "she/they",
  "any pronouns",
];

type PronounsPickerProps = {
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  className?: string;
};

export function PronounsPicker({ value, onChange, disabled = false, className }: PronounsPickerProps) {
  const [customInput, setCustomInput] = useState("");

  const selected = React.useMemo(() => {
    if (!value) return new Set<string>();
    return new Set(value.split(",").map((p) => p.trim()).filter(Boolean));
  }, [value]);

  function togglePreset(pronoun: string) {
    const next = new Set(selected);
    if (next.has(pronoun)) next.delete(pronoun);
    else next.add(pronoun);
    commit(Array.from(next));
  }

  function addCustom() {
    const trimmed = customInput.trim();
    if (!trimmed) return;
    const next = new Set(selected);
    next.add(trimmed);
    setCustomInput("");
    commit(Array.from(next));
  }

  function removePronoun(pronoun: string) {
    const next = new Set(selected);
    next.delete(pronoun);
    commit(Array.from(next));
  }

  function clearAll() {
    commit([]);
  }

  function commit(list: string[]) {
    const cleaned = list.filter(Boolean);
    const serialized = cleaned.length ? cleaned.join(", ") : null;
    onChange(serialized);
    setCustomInput("");
  }

  return (
    <div className={["space-y-2", className].filter(Boolean).join(" ")}>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {PRESET_PRONOUNS.map((p) => (
          <button
            key={p}
            type="button"
            disabled={disabled}
            onClick={() => togglePreset(p)}
            className={`min-h-9 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
              selected.has(p)
                ? "bg-af-brand text-white border-af-brand"
                : "bg-af-surface-2 text-af-text-2 border-af-border hover:bg-af-surface disabled:opacity-50 disabled:cursor-not-allowed"
            }`}
            aria-pressed={selected.has(p) || undefined}
          >
            {p}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          id="edit-pronouns-custom"
          disabled={disabled}
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }}
          placeholder="e.g. ey/em"
          className="af-field flex-1 px-3 py-2 text-sm disabled:opacity-50"
        />
        <button type="button" disabled={disabled || !customInput.trim()} onClick={addCustom} className="min-h-9 rounded-md border border-af-border bg-af-surface-2 px-3 text-xs font-medium text-af-text-2 disabled:opacity-50 disabled:cursor-not-allowed">Add</button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {Array.from(selected).map((p) => (
          <span key={p} className="inline-flex items-center gap-1.5 rounded-md border border-af-brand/50 bg-af-brand/10 px-2 py-0.5 text-[11px] font-medium text-af-brand">
            {p}
            <button type="button" onClick={(e) => { e.stopPropagation(); removePronoun(p); }} className="ml-0.5 -mt-0.5 rounded hover:bg-af-brand/20" aria-label={`Remove ${p}`} data-testid={`remove-pronoun-${p}`}>
              <span aria-hidden="true" className="text-[10px]">×</span>
            </button>
          </span>
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        <button type="button" disabled={disabled || selected.size === 0} onClick={clearAll} className="min-h-8 rounded-md border border-af-border/50 px-2 text-[10px] text-af-danger-soft hover:bg-af-danger/5 disabled:opacity-50 disabled:cursor-not-allowed">Clear all</button>
        <span className="ml-auto text-[11px] text-af-muted">{selected.size} selected</span>
      </div>
    </div>
  );
}

export default PronounsPicker;
