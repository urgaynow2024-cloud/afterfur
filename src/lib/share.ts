import { publicPostUrl, publicProfileUrl } from "@/lib/follow";

export type SharePlatform = "discord" | "whatsapp" | "email" | "facebook" | "x";

export function resolvePostPath(post: { id: string; profiles?: { username?: string | null } | null }): string {
  const username = post.profiles?.username?.trim();
  if (username && post.id?.trim()) {
    try {
      return publicPostUrl(username, post.id);
    } catch {
      // Fallback if username or post.id is invalid
    }
  }
  return `/posts/${encodeURIComponent(post.id ?? "")}`;
}

export function resolveProfilePath(profile: { username: string }): string {
  try {
    return publicProfileUrl(profile.username);
  } catch {
    return "/";
  }
}

export function getAbsoluteShareUrl(pathOrUrl: string, originOverride?: string): string {
  if (!pathOrUrl) return "";
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }
  const normalizedPath = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}${normalizedPath}`;
  }
  return `${originOverride ?? "https://afterfur.site"}${normalizedPath}`;
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text || typeof text !== "string") return false;

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall back to legacy copy path if clipboard API permission is denied
    }
  }

  if (typeof document !== "undefined") {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      textarea.style.pointerEvents = "none";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const succeeded = document.execCommand("copy");
      document.body.removeChild(textarea);
      return succeeded;
    } catch {
      return false;
    }
  }

  return false;
}

export function buildShareTargetUrl(
  platform: SharePlatform,
  url: string,
  options?: { title?: string; text?: string },
): string {
  const encodedUrl = encodeURIComponent(url);
  const title = options?.title?.trim() || "Check out this post on AfterFur";
  const snippet = options?.text?.trim() || "";
  const combinedMessage = snippet ? `${title} — ${snippet}` : title;

  switch (platform) {
    case "discord":
      return "https://discord.com/channels/@me";
    case "whatsapp":
      return `https://api.whatsapp.com/send?text=${encodeURIComponent(`${combinedMessage}\n${url}`)}`;
    case "email":
      return `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`${snippet ? `${snippet}\n\n` : ""}${url}`)}`;
    case "facebook":
      return `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;
    case "x":
      return `https://twitter.com/intent/tweet?text=${encodeURIComponent(combinedMessage)}&url=${encodedUrl}`;
    default:
      return url;
  }
}

export function openExternalShareWindow(targetUrl: string): void {
  if (typeof window === "undefined" || !targetUrl) return;
  window.open(targetUrl, "_blank", "noopener,noreferrer");
}