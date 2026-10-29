export type BadgeCategory = "staff" | "membership" | "milestone" | "trust" | "creator" | "achievement" | "community";
export type BadgeDefinition = { id: string; label: string; category: BadgeCategory; order: number; mark: string };

export const STAFF_BADGE_IDS = ["staff_founder", "staff_moderator", "staff_developer", "staff_tester"] as const;
export const STAFF_BADGES: BadgeDefinition[] = [
  { id: "staff_founder", label: "Founder", category: "staff", order: 10, mark: "✦" },
  { id: "staff_moderator", label: "Moderator", category: "staff", order: 20, mark: "⬟" },
  { id: "staff_developer", label: "Developer", category: "staff", order: 30, mark: "⌘" },
  { id: "staff_tester", label: "Tester", category: "staff", order: 40, mark: "✓" },
];
export const PAWPASS_BADGES: BadgeDefinition[] = Array.from({ length: 12 }, (_, index) => ({
  id: `pawpass_month_${index + 1}`,
  label: `PawPass Month ${index + 1}`,
  category: "membership",
  order: 110 + index * 10,
  mark: String(index + 1),
}));
// Active PawPass membership badge — shown only when a verified active entitlement exists.
export const PAWPASS_MEMBER_BADGE: BadgeDefinition = {
  id: "pawpass_member",
  label: "PawPass",
  category: "membership",
  order: 100,
  mark: "🐾",
};
export const PAWPASS_PRIME_BADGE: BadgeDefinition = {
  id: "pawpass_prime",
  label: "PawPass Prime",
  category: "membership",
  order: 105,
  mark: "Prime",
};
export const PAWPASS_YEAR_BADGES: BadgeDefinition[] = Array.from({ length: 50 }, (_, index) => ({
  id: `pawpass_year_${index + 1}`,
  label: `PawPass Year ${index + 1}`,
  category: "membership",
  order: 500 + index,
  mark: "✦",
}));
export const MILESTONE_BADGES: BadgeDefinition[] = [
  { id: "milestone_first_post", label: "First post", category: "milestone", order: 300, mark: "✎" },
  ...Array.from({ length: 50 }, (_, index) => ({
    id: `milestone_account_year_${index + 1}`,
    label: `Account anniversary ${index + 1}`,
    category: "milestone" as const,
    order: 1001 + index,
    mark: "✧",
  })),
];
export const TRUST_BADGES: BadgeDefinition[] = [
  // Trust/access badges. These are NOT auto-awarded here: After Dark must reflect a real
  // access entitlement, Age Verified must follow a genuine verification process, and
  // Approved has no defined meaning or award source yet. They are registered so the UI can
  // display them once entitlement logic is implemented (see Task D / Task E).
  { id: "access_after_dark", label: "After Dark", category: "trust", order: 600, mark: "🌙" },
  { id: "access_age_verified", label: "Age Verified", category: "trust", order: 610, mark: "🔞" },
  { id: "access_approved", label: "Approved", category: "trust", order: 620, mark: "✅" },
];
export const CREATOR_BADGES: BadgeDefinition[] = [
  { id: "ad_creator", label: "AD Creator", category: "creator", order: 655, mark: "🌙" },
  { id: "creator_featured", label: "Featured Creator", category: "creator", order: 660, mark: "⭐" },
];
export const COMMUNITY_BADGES: BadgeDefinition[] = [
  { id: "community_helper", label: "Community Helper", category: "community", order: 700, mark: "🤝" },
];
export const ACHIEVEMENT_BADGES: BadgeDefinition[] = [
  { id: "achievement_event_winner", label: "Event Winner", category: "achievement", order: 750, mark: "🏆" },
];
export const MEMBERSHIP_EXTRA_BADGES: BadgeDefinition[] = [
  { id: "early_supporter", label: "Early Supporter", category: "membership", order: 108, mark: "🌱" },
  { id: "founding_50", label: "Founding 50", category: "membership", order: 109, mark: "50" },
];
export const WEB_DESIGNER_BADGE: BadgeDefinition = {
  id: "web_designer",
  label: "Web Designer",
  category: "staff",
  order: 45,
  mark: "🎨",
};
export const MANUAL_BADGE_IDS = ["staff_founder", "staff_moderator", "staff_developer", "staff_tester", "access_age_verified", "access_approved", "creator_featured", "achievement_event_winner", "community_helper", "web_designer", "ad_creator"] as const;
export const BADGE_REGISTRY: BadgeDefinition[] = [...STAFF_BADGES, WEB_DESIGNER_BADGE, PAWPASS_MEMBER_BADGE, PAWPASS_PRIME_BADGE, ...PAWPASS_BADGES, ...PAWPASS_YEAR_BADGES, ...MILESTONE_BADGES, ...TRUST_BADGES, ...CREATOR_BADGES, ...COMMUNITY_BADGES, ...ACHIEVEMENT_BADGES, ...MEMBERSHIP_EXTRA_BADGES];
export const MANAGEABLE_BADGES: BadgeDefinition[] = BADGE_REGISTRY.filter((badge) => (MANUAL_BADGE_IDS as readonly string[]).includes(badge.id));
const badgeById = new Map(BADGE_REGISTRY.map((badge) => [badge.id, badge]));

function utcAnniversary(start: Date, months: number): Date {
  const monthOffset = start.getUTCMonth() + months;
  const year = start.getUTCFullYear() + Math.floor(monthOffset / 12);
  const month = monthOffset % 12;
  const day = Math.min(start.getUTCDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
  const result = new Date(0);
  result.setUTCFullYear(year, month, day);
  result.setUTCHours(start.getUTCHours(), start.getUTCMinutes(), start.getUTCSeconds(), start.getUTCMilliseconds());
  return result;
}

export function knownBadges(ids: readonly string[]): BadgeDefinition[] {
  const unique = new Set(ids);
  return [...unique].flatMap((id) => {
    const badge = badgeById.get(id);
    return badge ? [badge] : [];
  }).sort((a, b) => a.order - b.order);
}

export type PawPassStatus = "active" | "cancel_at_period_end" | "past_due" | "expired" | "refunded";
export function eligiblePawPassBadgeIds(eligibleSince: string, status: PawPassStatus, periodEnd: string | null, evaluatedAt: string): string[] {
  if (status !== "active" && status !== "cancel_at_period_end") return [];
  const start = Date.parse(eligibleSince);
  const now = Date.parse(evaluatedAt);
  const end = periodEnd === null ? now : Math.min(now, Date.parse(periodEnd));
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];
  const eligible: string[] = [];
  for (let month = 1; month <= 12; month++) {
    const anniversary = utcAnniversary(new Date(start), month);
    if (anniversary.getTime() <= end) eligible.push(`pawpass_month_${month}`);
  }
  for (let year = 1; year <= 50; year++) {
    const anniversary = utcAnniversary(new Date(start), year * 12);
    if (anniversary.getTime() <= end) eligible.push(`pawpass_year_${year}`);
  }
  return eligible;
}

export function mergeBadgeAwards(existing: readonly string[], eligible: readonly string[]): string[] {
  return [...new Set([...existing, ...eligible])];
}

export function eligibleAccountAnniversaryBadges(accountCreatedAt: string, evaluatedAt: string): string[] {
  const start = new Date(accountCreatedAt);
  const now = new Date(evaluatedAt);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(now.getTime()) || now < start) return [];
  let years = now.getUTCFullYear() - start.getUTCFullYear();
  const anniversaryThisYear = new Date(Date.UTC(
    now.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate(),
    start.getUTCHours(), start.getUTCMinutes(), start.getUTCSeconds(), start.getUTCMilliseconds(),
  ));
  if (now < anniversaryThisYear) years--;
  return Array.from({ length: Math.min(Math.max(0, years), 50) }, (_, index) => `milestone_account_year_${index + 1}`);
}

export function canManageStaffBadge(actorId: string | null, targetId: string, appMetadata: Record<string, unknown> | null | undefined): boolean {
  // Verified platform owners (afterfur_staff_admin claim, set only via the secure
  // service-role bootstrap) may manage badges for any account including their own.
  // Ordinary users and non-owner staff cannot self-promote.
  return Boolean(actorId && appMetadata?.afterfur_staff_admin === true);
}

export function changeStaffBadge(
  current: readonly string[], actorId: string | null, targetId: string, badgeId: string,
  action: "grant" | "revoke", appMetadata: Record<string, unknown> | null | undefined,
): { assignments: string[]; error: "forbidden" | "invalid_badge" | null } {
  if (!STAFF_BADGE_IDS.includes(badgeId as (typeof STAFF_BADGE_IDS)[number])) return { assignments: [...current], error: "invalid_badge" };
  if (!canManageStaffBadge(actorId, targetId, appMetadata)) return { assignments: [...current], error: "forbidden" };
  const next = new Set(current);
  if (action === "grant") next.add(badgeId);
  else next.delete(badgeId);
  return { assignments: [...next], error: null };
}
