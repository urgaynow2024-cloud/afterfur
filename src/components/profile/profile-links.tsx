"use client";

export type ProfileLink = {
  id: string;
  url: string;
  label: string | null;
  display_order: number;
};

const PLATFORMS: Array<{ id: string; name: string; icon: string; test: (u: string) => boolean }> = [
  { id: "discord", name: "Discord", icon: "💬", test: (u) => /discord\.(gg|com|me)\b/i.test(u) },
  { id: "x", name: "X", icon: "X", test: (u) => /twitter\.com|x\.com\b/i.test(u) },
  { id: "bluesky", name: "Bluesky", icon: "🦋", test: (u) => /bsky\.social|bsky\.app/i.test(u) },
  { id: "jinxxy", name: "Jinxxy", icon: "🐾", test: (u) => /jinxxy\./i.test(u) },
  { id: "patreon", name: "Patreon", icon: "🅿", test: (u) => /patreon\.com/i.test(u) },
  { id: "ko-fi", name: "Ko-fi", icon: "☕", test: (u) => /ko-fi\.com/i.test(u) },
  { id: "youtube", name: "YouTube", icon: "▶", test: (u) => /youtube\.com|youtu\.be/i.test(u) },
  { id: "twitch", name: "Twitch", icon: "🟣", test: (u) => /twitch\.tv/i.test(u) },
  { id: "tiktok", name: "TikTok", icon: "♬", test: (u) => /tiktok\.com/i.test(u) },
  { id: "instagram", name: "Instagram", icon: "📷", test: (u) => /instagram\.com/i.test(u) },
  { id: "github", name: "GitHub", icon: "🐙", test: (u) => /github\.com/i.test(u) },
];

export function detectPlatform(url: string): { id: string; name: string; icon: string } | null {
  const match = PLATFORMS.find((p) => p.test(url));
  return match ? { id: match.id, name: match.name, icon: match.icon } : null;
}

export function linkTitle(url: string, label: string | null): string {
  return label && label.trim() ? label : PLATFORMS.find((p) => p.test(url))?.name ?? "Website";
}

type LinkChipProps = { link: ProfileLink };
export function LinkChip({ link }: LinkChipProps) {
  const platform = detectPlatform(link.url);
  const title = linkTitle(link.url, link.label);
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-md border border-af-border bg-af-surface-2 px-2 py-1 text-xs font-medium text-af-text-2 hover:bg-af-surface hover:text-af-text hover:border-af-border-strong transition-colors"
      title={link.url}
    >
      <span aria-hidden="true">{platform?.icon ?? "🔗"}</span>
      <span className="truncate max-w-[14rem]">{title}</span>
    </a>
  );
}

type LinkPreviewProps = { link: ProfileLink; className?: string };
export function LinkPreview({ link, className }: LinkPreviewProps) {
  const platform = detectPlatform(link.url);
  const title = linkTitle(link.url, link.label);
  return (
    <div className={["flex items-center gap-1.5 rounded-md border border-af-border/50 bg-af-surface px-2 py-1 text-xs text-af-text-2", className].filter(Boolean).join(" ")}>
      <span aria-hidden="true">{platform?.icon ?? "🔗"}</span>
      <span className="truncate">{title}</span>
      <span className="ml-auto text-[10px] text-af-muted">{platform ? platform.name : "Website"}</span>
    </div>
  );
}

export function linksHaveUrls(links: ProfileLink[]): boolean {
  return links.some((l) => l.url && l.url.trim() !== "");
}

export function cleanLinks(links: ProfileLink[]): ProfileLink[] {
  return links
    .map((l, i) => ({ ...l, url: l.url.trim(), label: l.label?.trim() || null, display_order: i }))
    .filter((l) => l.url !== "");
}

export default LinkChip;
