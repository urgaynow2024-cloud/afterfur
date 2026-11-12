"use client";
import { useState } from "react";
import Link from "next/link";

const MASTER_REGEX =
  /(\*\*[^\*\s][^\*]*?\*\*|\*[^\*\s][^\*]*?\*|~~[^~\s][^~]*?~~|\|\|[^|\s][^|]*?\|\||https?:\/\/[^\s"<>]+)|(?<![\w.])(@[A-Za-z0-9_]{3,})|(?<![\w\/])(#[A-Za-z0-9_\p{L}]*[A-Za-z\p{L}][A-Za-z0-9_\p{L}]*)/gu;
const TRAILING_PUNCTUATION = /[.,;:!?"' ]+$/;
const HEX_COLOUR = /^[0-9a-fA-F]{3,6}$/;

type PostTextSegment =
  | { type: "text"; value: string }
  | { type: "bold"; value: string }
  | { type: "italic"; value: string }
  | { type: "strikethrough"; value: string }
  | { type: "spoiler"; value: string }
  | { type: "url"; value: string; href: string }
  | { type: "mention"; value: string; href: string }
  | { type: "hashtag"; value: string; href: string };

function tokenize(content: string): PostTextSegment[] {
  const segments: PostTextSegment[] = [];
  let lastPos = 0;
  let match: RegExpExecArray | null;
  MASTER_REGEX.lastIndex = 0;
  while ((match = MASTER_REGEX.exec(content)) !== null) {
    if (match.index > lastPos) {
      segments.push({ type: "text", value: content.slice(lastPos, match.index) });
    }
    const raw = match[0];
    if (raw.startsWith("**") && raw.endsWith("**")) {
      segments.push({ type: "bold", value: raw.slice(2, -2) });
    } else if (raw.startsWith("*") && raw.endsWith("*")) {
      segments.push({ type: "italic", value: raw.slice(1, -1) });
    } else if (raw.startsWith("~~") && raw.endsWith("~~")) {
      segments.push({ type: "strikethrough", value: raw.slice(2, -2) });
    } else if (raw.startsWith("||") && raw.endsWith("||")) {
      segments.push({ type: "spoiler", value: raw.slice(2, -2) });
    } else if (raw.startsWith("http://") || raw.startsWith("https://")) {
      const url = raw.replace(TRAILING_PUNCTUATION, "");
      segments.push({ type: "url", value: url, href: url });
      const rest = raw.slice(url.length);
      if (rest) segments.push({ type: "text", value: rest });
    } else if (raw.startsWith("@")) {
      const username = raw.slice(1);
      segments.push({ type: "mention", value: username, href: `/${encodeURIComponent(username)}` });
    } else if (raw.startsWith("#")) {
      const tag = raw.slice(1);
      if (HEX_COLOUR.test(tag)) {
        segments.push({ type: "text", value: raw });
      } else {
        segments.push({ type: "hashtag", value: tag, href: `/search?q=${encodeURIComponent("#" + tag)}` });
      }
    }
    lastPos = match.index + match[0].length;
  }
  if (lastPos < content.length) {
    segments.push({ type: "text", value: content.slice(lastPos) });
  }
  return segments.filter((segment) => segment.value.length > 0);
}

const stopPropagation = (event: React.MouseEvent) => {
  event.stopPropagation();
};

function SpoilerText({ value }: { value: string }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <span className="rounded bg-af-surface-2 px-1">
      <button
        type="button"
        aria-label={revealed ? "Hide spoiler" : "Reveal spoiler"}
        onClick={stopPropagation}
        onMouseDown={(e) => { e.preventDefault(); setRevealed(true); }}
        className="flex items-center gap-1 px-1 py-0.5 rounded text-af-brand hover:text-af-brand-soft underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-af-focus"
      >
        {revealed ? <span>{value}</span> : <span className="text-xs">···</span>}
      </button>
    </span>
  );
}

export default function PostText({ content, className }: { content: string; className?: string }) {
  const segments = tokenize(content);
  return (
    <span className={`whitespace-pre-wrap break-words text-[15px] leading-6 text-af-text ${className ?? ""}`}>
      {segments.map((segment, index) => {
        if (segment.type === "text") {
          return <span key={index}>{segment.value}</span>;
        }
        if (segment.type === "bold") {
          return <span key={index} className="font-semibold">{segment.value}</span>;
        }
        if (segment.type === "italic") {
          return <span key={index} className="italic">{segment.value}</span>;
        }
        if (segment.type === "strikethrough") {
          return <span key={index} className="line-through">{segment.value}</span>;
        }
        if (segment.type === "spoiler") {
          return <SpoilerText key={index} value={segment.value} />;
        }
        if (segment.type === "url") {
          return (
            <a
              key={index}
              href={segment.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-af-brand hover:underline"
              onClick={stopPropagation}
            >
              {segment.value}
            </a>
          );
        }
        if (segment.type === "mention") {
          return (
            <Link key={index} href={segment.href} className="text-af-brand hover:underline" onClick={stopPropagation}>
              @{segment.value}
            </Link>
          );
        }
        return (
          <Link key={index} href={segment.href} className="text-af-brand hover:underline" onClick={stopPropagation}>
            #{segment.value}
          </Link>
        );
      })}
    </span>
  );
}
