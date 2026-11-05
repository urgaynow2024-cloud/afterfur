export type ModerationNavRole = "moderator" | "senior_moderator" | "administrator";

export function hasModerationNavAccess(me: { ok?: boolean; role?: ModerationNavRole | null; canModerate?: boolean } | null | undefined): boolean {
  if (!me || me.ok !== true) return false;
  if (me.canModerate === true) return true;
  return me.role === "moderator" || me.role === "senior_moderator" || me.role === "administrator";
}

export async function fetchModerationNavAccess(init?: RequestInit): Promise<boolean> {
  try {
    const res = await fetch("/api/moderation/me", { cache: "no-store", ...init });
    if (!res.ok) return false;
    const data = await res.json().catch(() => null);
    return hasModerationNavAccess(data);
  } catch {
    return false;
  }
}
