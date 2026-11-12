export type BadgeCategory = "staff" | "membership" | "milestone" | "trust" | "creator" | "achievement" | "community";
export type BadgeDefinition = { id: string; label: string; category: BadgeCategory; order: number; mark: string; description: string };

const BADGE_IMAGE: Record<string, string> = {
  staff_founder: "/badges/founder.png",
  staff_moderator: "/badges/moderator.png",
  staff_developer: "/badges/developer.png",
  staff_tester: "/badges/tester.png",
  web_designer: "/badges/web-designer.png",
  pawpass_member: "/badges/pawpass-member.png",
  pawpass_prime: "/badges/afterfur-prime.png",
  access_age_verified: "/badges/age-verified.png",
  access_approved: "/badges/approved.png",
  ad_creator: "/badges/ad-creator.png",
  creator_featured: "/badges/featured-creator.png",
  community_helper: "/badges/community-helper.png",
  achievement_event_winner: "/badges/event-winner.png",
  early_supporter: "/badges/early-supporter.png",
  founding_50: "/badges/founding-50.png",
  milestone_first_post: "/badges/first-post.png",
};

export function badgeImageFor(id: string): string | null {
  if (id.startsWith("milestone_account_year_")) return "/badges/account-anniversary.png";
  return BADGE_IMAGE[id] ?? null;
}

export const STAFF_BADGE_IDS = ["staff_founder", "staff_moderator", "staff_developer", "staff_tester"] as const;
export type StaffBadgeId = (typeof STAFF_BADGE_IDS)[number];

/**
 * Maps a moderator role to the staff badge that should be active while the
 * user holds that role.
 *
 * Only `moderator` and `senior_moderator` map to an existing badge
 * (`staff_moderator`). There is no `staff_administrator` or
 * `staff_senior_moderator` badge in `badge_registry`, so those roles do not
 * auto-award a staff badge via this mapping. No badge IDs are invented here;
 * only existing `badge_registry` identifiers are referenced.
 *
 * Changing a role between moderator and senior_moderator does not change the
 * badge (both map to `staff_moderator`). Moving to or from administrator
 * adds or removes `staff_moderator` accordingly.
 */
export type ModeratorRole = "moderator" | "senior_moderator" | "administrator";

export const STAFF_ROLE_BADGE_IDS: Record<ModeratorRole, StaffBadgeId | null> = {
  moderator: "staff_moderator",
  senior_moderator: "staff_moderator",
  administrator: null,
};

export function staffBadgeIdForRole(role: ModeratorRole | null): StaffBadgeId | null {
  if (!role) return null;
  return STAFF_ROLE_BADGE_IDS[role];
}
export const STAFF_BADGES: BadgeDefinition[] = [
{ id: "staff_founder", label: "Founder", category: "staff", order: 10, mark: "✦", description: "One of the original AfterFur founders who helped launch the platform." },
  { id: "staff_moderator", label: "Moderator", category: "staff", order: 20, mark: "⬡", description: "Community moderator responsible for keeping discussions safe and respectful." },
  { id: "staff_developer", label: "Developer", category: "staff", order: 30, mark: "⌘", description: "Core developer who builds and maintains AfterFur features and infrastructure." },
  { id: "staff_tester", label: "Tester", category: "staff", order: 40, mark: "✓", description: "Quality assurance tester who validates new releases before they ship." },
];
export const PAWPASS_BADGES: BadgeDefinition[] = Array.from({ length: 12 }, (_, index) => ({
  id: `pawpass_month_${index + 1}`,
  label: `PawPass Month ${index + 1}`,
  category: "membership",
  order: 110 + index * 10,
  mark: String(index + 1),
  description: `Recognises ${index + 1} consecutive month${index + 1 === 1 ? "" : "s"} of active PawPass membership.`,
}));
// Active PawPass membership badge — shown only when a verified active entitlement exists.
export const PAWPASS_MEMBER_BADGE: BadgeDefinition = {
  id: "pawpass_member",
  label: "PawPass",
  category: "membership",
  order: 100,
  mark: "🐾",
  description: "Active PawPass member with a current, verified subscription entitlement.",
};
export const PAWPASS_PRIME_BADGE: BadgeDefinition = {
  id: "pawpass_prime",
  label: "PawPass Prime",
  category: "membership",
  order: 105,
  mark: "Prime",
  description: "PawPass Prime tier member receiving premium benefits and perks.",
};
export const PAWPASS_YEAR_BADGES: BadgeDefinition[] = Array.from({ length: 50 }, (_, index) => ({
  id: `pawpass_year_${index + 1}`,
  label: `PawPass Year ${index + 1}`,
  category: "membership",
  order: 500 + index,
  mark: "✦",
  description: `Recognises ${index + 1} year${index + 1 === 1 ? "" : "s"} of continuous PawPass membership.`,
}));
export const MILESTONE_BADGES: BadgeDefinition[] = [
  { id: "milestone_first_post", label: "First post", category: "milestone", order: 300, mark: "✎", description: "The account published its very first post." },
  ...Array.from({ length: 50 }, (_, index) => ({
    id: `milestone_account_year_${index + 1}`,
    label: `Account anniversary ${index + 1}`,
    category: "milestone" as const,
    order: 1001 + index,
    mark: "✧",
    description: `Celebrates ${index + 1} year${index + 1 === 1 ? "" : "s"} since the account was created.`,
  })),
];
export const TRUST_BADGES: BadgeDefinition[] = [
  // Trust/access badges. These are NOT auto-awarded here: After Dark must reflect a real
  // access entitlement, Age Verified must follow a genuine verification process, and
  // Approved has no defined meaning or award source yet. They are registered so the UI can
  // display them once entitlement logic is implemented (see Task D / Task E).
  { id: "access_after_dark", label: "After Dark", category: "trust", order: 600, mark: "🌙", description: "Account has verified access to After Dark content." },
  { id: "access_age_verified", label: "Age Verified", category: "trust", order: 610, mark: "🔞", description: "Account age has been verified through a trusted verification process." },
  { id: "access_approved", label: "Approved", category: "trust", order: 620, mark: "✅", description: "Account has been reviewed and approved by AfterFur staff." },
];
export const CREATOR_BADGES: BadgeDefinition[] = [
  { id: "ad_creator", label: "AD Creator", category: "creator", order: 655, mark: "🌙", description: "Account has reached 500 followers and is eligible to create ads." },
  { id: "creator_featured", label: "Featured Creator", category: "creator", order: 660, mark: "⭐", description: "Creator featured by AfterFur for outstanding community contributions." },
];
export const COMMUNITY_BADGES: BadgeDefinition[] = [
  { id: "community_helper", label: "Community Helper", category: "community", order: 700, mark: "🤝", description: "Recognised for consistently helping other members and improving community health." },
];
export const ACHIEVEMENT_BADGES: BadgeDefinition[] = [
  { id: "achievement_event_winner", label: "Event Winner", category: "achievement", order: 750, mark: "🏆", description: "Won an official AfterFur community event or competition." },
];
export const MEMBERSHIP_EXTRA_BADGES: BadgeDefinition[] = [
  { id: "early_supporter", label: "Early Supporter", category: "membership", order: 108, mark: "🌱", description: "Supported AfterFur during the early access period before public launch." },
  { id: "founding_50", label: "Founding 50", category: "membership", order: 109, mark: "50", description: "One of the first 50 members to join AfterFur during the founding phase." },
];
export const WEB_DESIGNER_BADGE: BadgeDefinition = {
  id: "web_designer",
  label: "Web Designer",
  category: "staff",
  order: 45,
  mark: "🎨",
  description: "Staff member responsible for AfterFur's web design, layout and visual identity.",
};
export const MANUAL_BADGE_IDS = ["staff_founder", "staff_moderator", "staff_developer", "staff_tester", "access_age_verified", "access_approved", "creator_featured", "achievement_event_winner", "community_helper", "web_designer", "ad_creator"] as const;
export type ManualBadgeId = (typeof MANUAL_BADGE_IDS)[number];
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
): { assignments: string[]; error: "forbidden" | "invalid_badge" | "duplicate_active" | "not_active" | null } {
  if (!(MANUAL_BADGE_IDS as readonly string[]).includes(badgeId)) return { assignments: [...current], error: "invalid_badge" };
  if (!canManageStaffBadge(actorId, targetId, appMetadata)) return { assignments: [...current], error: "forbidden" };
  const next = new Set(current);
  if (action === "grant") {
    if (next.has(badgeId)) return { assignments: [...current], error: "duplicate_active" };
    next.add(badgeId);
  } else {
    if (!next.has(badgeId)) return { assignments: [...current], error: "not_active" };
    next.delete(badgeId);
  }
  return { assignments: [...next], error: null };
}
