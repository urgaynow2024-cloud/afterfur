"use client";
import { useState } from "react";

const EMOJIS = ["😀","😂","🥰","😍","🤔","😎","😭","😡","👍","👎","❤️","🔥","✨","🎉","👀","🙏","💯","🥹","🙂","🤝"];

export default function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} className="rounded-full px-3 py-1.5 text-lg text-af-muted hover:bg-af-surface-2 hover:text-af-text" aria-label="Emoji picker">
        😊
      </button>
      {open && (
        <div className="absolute bottom-10 left-0 z-50 grid w-64 grid-cols-5 gap-1 rounded-2xl border border-af-border bg-af-surface p-2 shadow-xl">
          {EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => { onPick(emoji); setOpen(false); }}
              className="rounded-lg p-1 text-xl hover:bg-af-surface-2"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
