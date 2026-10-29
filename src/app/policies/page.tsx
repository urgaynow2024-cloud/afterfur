"use client";
import { useEffect, useState } from "react";
import { Shell, PageHeader } from "@/components/Shell";
import ReactMarkdown from "react-markdown";

export default function Policies() {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/policies/master.md")
      .then((r) => { if (!r.ok) throw new Error("Could not load policies."); return r.text(); })
      .then((t) => { setText(t); setLoading(false); })
      .catch((e) => { setError(e instanceof Error ? e.message : "Could not load policies."); setLoading(false); });
  }, []);
  return (
    <Shell>
      <PageHeader title="Policies" subtitle="AfterFur terms, privacy and platform policies (draft)" />
      <div className="max-w-4xl p-4 sm:p-6">
        {loading && <p className="text-sm text-af-muted">Loading…</p>}
        {error && <p role="alert" className="text-sm text-af-danger">{error}</p>}
        {!loading && !error && <div className="space-y-3 text-sm leading-relaxed text-af-text"><ReactMarkdown>{text}</ReactMarkdown></div>}
      </div>
    </Shell>
  );
}
