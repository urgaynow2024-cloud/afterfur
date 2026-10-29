"use client";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";

export default function PolicySection({ part, title }: { part: string; title: string }) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/policies/master.md")
      .then((r) => { if (!r.ok) throw new Error("Could not load policy."); return r.text(); })
      .then((raw) => {
        const startRe = new RegExp(`^PART ${part} — [A-Z]`, "m");
        const startIndex = raw.search(startRe);
        if (startIndex === -1) { setError("Policy section not found."); setLoading(false); return; }
        const rest = raw.slice(startIndex);
        const nextMatch = rest.slice(1).search(/^PART [A-Z] —/m);
        const section = nextMatch === -1 ? rest : rest.slice(0, nextMatch + 1);
        setText(section.trim());
        setLoading(false);
      })
      .catch((e) => { setError(e instanceof Error ? e.message : "Could not load policy."); setLoading(false); });
  }, [part]);
  return (
    <div className="max-w-4xl p-4 sm:p-6">
      <h1 className="text-xl font-semibold text-af-text">{title}</h1>
      {loading && <p className="mt-4 text-sm text-af-muted">Loading…</p>}
      {error && <p role="alert" className="mt-4 text-sm text-af-danger">{error}</p>}
      {!loading && !error && <div className="mt-4 space-y-3 text-sm leading-relaxed text-af-text"><ReactMarkdown>{text}</ReactMarkdown></div>}
    </div>
  );
}
