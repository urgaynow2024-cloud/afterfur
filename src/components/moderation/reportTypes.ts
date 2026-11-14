import type { ReportPriority } from "@/lib/reportMeta";

export type ReportPriorityInfo = { level: ReportPriority; label: string; rank: number };

export type ReportListItem = {
  id: string;
  reporter_id: string;
  target_type: string;
  target_id: string;
  reason: string;
  description: string | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  assigned_to: string | null;
  assigned_at: string | null;
  created_at: string | null;
  reporter_username: string | null;
  reporter_display_name: string | null;
  reporter_avatar_url: string | null;
  assignee_username: string | null;
  assignee_display_name: string | null;
  priority: ReportPriorityInfo;
};

export type ReportProfile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio?: string | null;
  created_at?: string | null;
  is_private?: boolean | null;
};

export type ReportNote = {
  id: string;
  reportId: string;
  authorId: string;
  authorUsername: string | null;
  authorDisplayName: string | null;
  body: string;
  createdAt: string | null;
};

export type ReportAction = {
  id: string;
  actorId: string;
  actorUsername: string | null;
  actorDisplayName: string | null;
  targetType: string;
  targetId: string;
  action: string;
  details: Record<string, unknown> | null;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  createdAt: string | null;
};

export type ReportDetailReport = {
  id: string;
  reporterId: string;
  targetType: string;
  targetId: string;
  reason: string;
  description: string | null;
  status: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  assignedTo: string | null;
  assignedAt: string | null;
  createdAt: string | null;
  priority: ReportPriorityInfo;
};

export type ReportTargetContent = {
  type: string;
  id: string;
  content?: string;
  post_id?: string | null;
  parent_reply_id?: string | null;
  author_id?: string | null;
  classification?: string | null;
  created_at?: string | null;
  media_urls?: string[] | null;
  moderation_status?: string | null;
  moderation_reason?: string | null;
};

export type ReportDetail = {
  ok: boolean;
  report: ReportDetailReport;
  reporter: ReportProfile | null;
  reportedUser: ReportProfile | null;
  targetContent: ReportTargetContent | null;
  assignee: ReportProfile | null;
  reviewer: ReportProfile | null;
  notes: ReportNote[];
  actions: ReportAction[];
};

export type AssignableModerator = {
  id: string;
  username: string;
  displayName: string | null;
  role: string;
};

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function shortId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

export function actionLabel(action: string): string {
  return action
    .replace(/^resolve_report_/, "Resolved: ")
    .replace(/^content_/, "Content: ")
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());
}