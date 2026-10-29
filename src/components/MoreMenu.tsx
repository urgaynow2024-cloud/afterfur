"use client";
import { useState } from "react";
import Link from "next/link";

export default function MoreMenu() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-[15px] font-medium text-af-text-2 transition-colors hover:bg-af-surface hover:text-af-text" aria-expanded={open}>
        <span aria-hidden="true" className="h-5 w-5 shrink-0 bg-current opacity-75" />
        More
      </button>
      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-56 rounded-lg border border-af-border bg-af-surface p-2 shadow-lg">
          <Link href="/settings" onClick={() => setOpen(false)} className="block rounded-md px-3 py-2 text-sm text-af-text-2 hover:bg-af-surface-2 hover:text-af-text">Settings and privacy</Link>
          <Link href="/privacy" onClick={() => setOpen(false)} className="block rounded-md px-3 py-2 text-sm text-af-text-2 hover:bg-af-surface-2 hover:text-af-text">Privacy Policy</Link>
          <Link href="/terms" onClick={() => setOpen(false)} className="block rounded-md px-3 py-2 text-sm text-af-text-2 hover:bg-af-surface-2 hover:text-af-text">Terms of Service</Link>
          <Link href="/safety" onClick={() => setOpen(false)} className="block rounded-md px-3 py-2 text-sm text-af-text-2 hover:bg-af-surface-2 hover:text-af-text">Safety</Link>
        </div>
      )}
    </div>
  );
}
