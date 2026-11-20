/**
 * Schema types derived from supabase/migrations/0001_initial.sql and the
 * reviewed local migrations. Regenerate from the approved development project
 * when one is linked, then keep the app and migration definitions in sync.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Table<Row, Insert, Update> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

type MediaRow = {
  id: string;
  owner_id: string;
  post_id: string | null;
  storage_path: string;
  bucket_id: string;
  media_type: string | null;
  created_at: string | null;
};

type ProfileRow = {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  created_at: string | null;
  location: string | null;
  website: string | null;
  pronouns: string | null;
  profile_customisation: Json | null;
  is_private: boolean | null;
  age_verified: boolean | null;
  age_verified_at: string | null;
  age_assurance_approved: boolean | null;
  age_assurance_approved_at: string | null;
};

type ProfileLinkRow = {
  id: string;
  user_id: string;
  url: string;
  label: string | null;
  display_order: number;
  created_at: string | null;
  updated_at: string | null;
};

type PostRow = {
  id: string;
  author_id: string;
  content: string;
  classification: string | null;
  created_at: string | null;
  edited_at: string | null;
  media_urls: string[] | null;
  moderation_status?: string | null;
  moderated_at?: string | null;
  moderated_by?: string | null;
  moderation_reason?: string | null;
};

type ReplyRow = {
  id: string;
  post_id: string | null;
  author_id: string | null;
  content: string;
  created_at: string | null;
  parent_reply_id: string | null;
  moderation_status?: string | null;
  moderated_at?: string | null;
  moderated_by?: string | null;
  moderation_reason?: string | null;
};

type MessageRow = {
  id: string;
  conversation_id: string | null;
  sender_id: string | null;
  content: string;
  created_at: string | null;
};

type MessageReadRow = {
  id: string;
  conversation_id: string;
  message_id: string;
  user_id: string;
  read_at: string | null;
};

type MessageAttachmentRow = {
  id: string;
  message_id: string;
  conversation_id: string;
  uploader_id: string;
  storage_path: string;
  bucket_id: string;
  media_type: string | null;
  file_size: number | null;
  created_at: string | null;
};

type ConversationMuteRow = {
  id: string;
  conversation_id: string;
  user_id: string;
  muted_at: string | null;
};

type ModeratorRoleRow = {
  id: string;
  user_id: string;
  role: string;
  assigned_by: string | null;
  assigned_at: string | null;
  reason: string | null;
};

type ModerationAuditLogRow = {
  id: string;
  actor_id: string;
  target_type: string;
  target_id: string;
  action: string;
  details: Json | null;
  before_state: Json | null;
  after_state: Json | null;
  created_at: string | null;
};

type UserEnforcementRow = {
  id: string;
  user_id: string;
  type: string;
  reason: string;
  starts_at: string | null;
  ends_at: string | null;
  created_by: string;
  created_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  revoked_reason: string | null;
};

type AppealRow = {
  id: string;
  user_id: string;
  report_id: string | null;
  enforcement_type: string | null;
  enforcement_id: string | null;
  reason: string;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  response_message: string | null;
  created_at: string | null;
};

type ReportRow = {
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
};

type ReportNoteRow = {
  id: string;
  report_id: string;
  author_id: string;
  body: string;
  created_at: string | null;
};

type AgeVerificationRequestRow = {
  id: string;
  user_id: string;
  status: string;
  requested_at: string | null;
  reviewed_at: string | null;
  reviewer_id: string | null;
  review_note: string | null;
  evidence: Json | null;
};

type AgeAssuranceRequestRow = {
  id: string;
  user_id: string;
  status: string;
  requested_at: string | null;
  reviewed_at: string | null;
  reviewer_id: string | null;
  review_note: string | null;
  evidence: Json | null;
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<ProfileRow, Pick<ProfileRow, "id" | "username"> & Partial<Omit<ProfileRow, "id" | "username">>, Partial<Omit<ProfileRow, "id">>>;
      posts: Table<PostRow, Pick<PostRow, "author_id" | "content"> & Partial<Omit<PostRow, "id" | "author_id" | "content">>, Partial<Omit<PostRow, "id">>>;
      likes: Table<{ user_id: string; post_id: string }, { user_id: string; post_id: string }, { user_id?: string; post_id?: string }>;
      media: Table<MediaRow, Omit<MediaRow, "id" | "created_at"> & { id?: string; created_at?: string }, Partial<Omit<MediaRow, "id">>>;
      reposts: Table<{ user_id: string; post_id: string }, { user_id: string; post_id: string }, { user_id?: string; post_id?: string }>;
      bookmarks: Table<{ user_id: string; post_id: string }, { user_id: string; post_id: string }, { user_id?: string; post_id?: string }>;
      follows: Table<{ follower_id: string; following_id: string; status: string }, { follower_id: string; following_id: string; status?: string }, { follower_id?: string; following_id?: string; status?: string }>;
      replies: Table<ReplyRow, Pick<ReplyRow, "content"> & Partial<Omit<ReplyRow, "id" | "content">>, Partial<Omit<ReplyRow, "id">>>;
      notifications: Table<{ id: string; user_id: string | null; type: string; payload: Json | null; read: boolean | null; created_at: string | null }, { id?: string; user_id?: string | null; type: string; payload?: Json | null; read?: boolean | null; created_at?: string | null }, { id?: string; user_id?: string | null; type?: string; payload?: Json | null; read?: boolean | null; created_at?: string | null }>;
      conversations: Table<{ id: string; created_at: string | null }, { id?: string; created_at?: string | null }, { id?: string; created_at?: string | null }>;
      conversation_participants: Table<{ conversation_id: string; user_id: string }, { conversation_id: string; user_id: string }, { conversation_id?: string; user_id?: string }>;
      messages: Table<MessageRow, Pick<MessageRow, "content"> & Partial<Omit<MessageRow, "id" | "content">>, Partial<Omit<MessageRow, "id">>>;
      message_reads: Table<MessageReadRow, Pick<MessageReadRow, "conversation_id" | "message_id" | "user_id"> & Partial<Omit<MessageReadRow, "id" | "conversation_id" | "message_id" | "user_id">>, Partial<Omit<MessageReadRow, "id">>>;
      message_attachments: Table<MessageAttachmentRow, Pick<MessageAttachmentRow, "message_id" | "conversation_id" | "uploader_id" | "storage_path" | "media_type" | "file_size"> & Partial<Omit<MessageAttachmentRow, "id" | "message_id" | "conversation_id" | "uploader_id" | "storage_path" | "media_type" | "file_size">>, Partial<Omit<MessageAttachmentRow, "id">>>;
      conversation_mutes: Table<ConversationMuteRow, Pick<ConversationMuteRow, "conversation_id" | "user_id"> & Partial<Omit<ConversationMuteRow, "id" | "conversation_id" | "user_id">>, Partial<Omit<ConversationMuteRow, "id">>>;
      moderator_roles: Table<ModeratorRoleRow, Pick<ModeratorRoleRow, "user_id" | "role" | "reason"> & Partial<Omit<ModeratorRoleRow, "id" | "user_id" | "role">>, Partial<Omit<ModeratorRoleRow, "id">>>;
      moderation_audit_log: Table<ModerationAuditLogRow, Pick<ModerationAuditLogRow, "actor_id" | "target_type" | "target_id" | "action" | "details" | "before_state" | "after_state"> & Partial<Omit<ModerationAuditLogRow, "id">>, Partial<Omit<ModerationAuditLogRow, "id">>>;
      user_enforcements: Table<UserEnforcementRow, Pick<UserEnforcementRow, "user_id" | "type" | "reason" | "starts_at" | "ends_at" | "created_by"> & Partial<Omit<UserEnforcementRow, "id" | "user_id" | "type" | "reason" | "starts_at" | "ends_at" | "created_by">>, Partial<Omit<UserEnforcementRow, "id">>>;
      appeals: Table<AppealRow, Pick<AppealRow, "user_id" | "reason" | "report_id" | "enforcement_type" | "enforcement_id"> & Partial<Omit<AppealRow, "id" | "user_id" | "reason">>, Partial<Omit<AppealRow, "id">>>;
      reports: Table<ReportRow, Pick<ReportRow, "reporter_id" | "target_type" | "target_id" | "reason"> & Partial<Omit<ReportRow, "id" | "reporter_id" | "target_type" | "target_id" | "reason">>, Partial<Omit<ReportRow, "id">>>;
      report_notes: Table<ReportNoteRow, Pick<ReportNoteRow, "report_id" | "author_id" | "body"> & Partial<Omit<ReportNoteRow, "id" | "report_id" | "author_id" | "body">>, Partial<Omit<ReportNoteRow, "id">>>;
      profile_links: Table<ProfileLinkRow, Omit<ProfileLinkRow, "id" | "created_at" | "updated_at"> & { id?: string; created_at?: string; updated_at?: string }, Partial<Omit<ProfileLinkRow, "id">>>;
      staff_badge_assignments: Table<{ user_id: string; badge_id: string; assigned_by: string; assigned_at: string }, { user_id: string; badge_id: string; assigned_by: string; assigned_at?: string }, never>;
      staff_badge_audit: Table<{ id: number; actor_id: string; target_id: string; badge_id: string; action: string; occurred_at: string }, never, never>;
      age_verification_requests: Table<AgeVerificationRequestRow, Pick<AgeVerificationRequestRow, "user_id"> & Partial<Omit<AgeVerificationRequestRow, "id" | "user_id">>, Partial<Omit<AgeVerificationRequestRow, "id">>>;
      age_assurance_requests: Table<AgeAssuranceRequestRow, Pick<AgeAssuranceRequestRow, "user_id"> & Partial<Omit<AgeAssuranceRequestRow, "id" | "user_id">>, Partial<Omit<AgeAssuranceRequestRow, "id">>>;
      user_badge_awards: Table<{ user_id: string; badge_id: string; awarded_at: string }, { user_id: string; badge_id: string; awarded_at?: string }, never>;
      badge_account_origins: Table<{ user_id: string; account_created_at: string }, { user_id: string; account_created_at: string }, never>;
      pawpass_entitlements: Table<{ user_id: string; provider: string; provider_customer_id: string; provider_subscription_id: string; status: string; eligible_since: string; current_period_end: string | null; status_changed_at: string; updated_at: string }, never, never>;
      pawpass_event_receipts: Table<{ provider: string; provider_event_id: string; user_id: string; event_type: string; processed_at: string }, never, never>;
    };
    Views: Record<string, never>;
    Functions: {
      get_post_like_counts: { Args: { p_post_ids: string[] }; Returns: { post_id: string; like_count: number }[] };
      get_post_repost_counts: { Args: { p_post_ids: string[] }; Returns: { post_id: string; repost_count: number }[] };
      get_post_reply_counts: { Args: { p_post_ids: string[] }; Returns: { post_id: string; reply_count: number }[] };
      is_conversation_member: { Args: { p_conversation_id: string }; Returns: boolean };
      create_direct_conversation: { Args: { p_recipient_id: string }; Returns: string };
      create_post_notification: { Args: { p_recipient_id: string; p_post_id: string; p_type: string }; Returns: undefined };
      mark_notification_read: { Args: { p_notification_id: string }; Returns: undefined };
      mark_all_notifications_read: { Args: Record<PropertyKey, never>; Returns: undefined };
      get_latest_conversation_messages: { Args: { p_conversation_ids: string[] }; Returns: MessageRow[] };
      mark_messages_read: { Args: { p_conversation_id: string; p_message_ids: string[] }; Returns: undefined };
      submit_report: { Args: { p_target_type: string; p_target_id: string; p_reason: string; p_description: string | null }; Returns: string };
      get_public_badges: { Args: { p_user_ids: string[] }; Returns: { user_id: string; badge_id: string }[] };
      search_staff_badge_targets: { Args: { p_query: string }; Returns: { user_id: string; username: string; display_name: string | null }[] };
      get_staff_badges_for_admin: { Args: { p_target_id: string }; Returns: { badge_id: string }[] };
      manage_staff_badge: { Args: { p_target_id: string; p_badge_id: string; p_action: string }; Returns: boolean };
      process_pawpass_entitlement_event: { Args: { p_user_id: string; p_provider: string; p_customer_id: string; p_subscription_id: string; p_event_id: string; p_event_type: string; p_status: string; p_eligible_since: string; p_current_period_end: string | null; p_occurred_at: string }; Returns: boolean };
      get_my_pawpass_entitlement: { Args: Record<PropertyKey, never>; Returns: { is_active: boolean; status: string; current_period_end: string | null }[] };
      get_my_profile_accent: { Args: Record<PropertyKey, never>; Returns: string | null };
      update_profile_accent: { Args: { p_accent: string | null }; Returns: boolean };
      is_prime_member: { Args: { p_user_id: string }; Returns: boolean };
      get_my_membership_status: { Args: Record<PropertyKey, never>; Returns: { source: string; plan_interval: string | null; status: string; eligible_since: string; current_period_end: string | null; is_test: boolean; grant_reason: string | null }[] };
      get_membership_for_admin: { Args: { p_target_id: string }; Returns: { user_id: string; source: string; plan_interval: string | null; status: string; eligible_since: string; current_period_end: string | null; is_test: boolean; granted_by: string | null; grant_reason: string | null }[] };
      set_owner_test_prime: { Args: { p_target_id: string; p_active: boolean; p_days?: number; p_reason?: string | null }; Returns: boolean };
      grant_free_prime_membership: { Args: { p_target_id: string; p_months: number; p_reason?: string | null }; Returns: boolean };
      revoke_free_prime_membership: { Args: { p_target_id: string; p_reason?: string | null }; Returns: boolean };
      claim_founding_prime: { Args: Record<PropertyKey, never>; Returns: boolean };
      get_my_founding_status: { Args: Record<PropertyKey, never>; Returns: { claimed: boolean; claimed_at: string | null; expires_at: string | null }[] };
      get_founding_rewards_remaining: { Args: Record<PropertyKey, never>; Returns: number };
      get_membership_audit: { Args: { p_target_id?: string | null; p_limit?: number }; Returns: { id: number; actor_id: string | null; target_id: string; action: string; source: string | null; details: Json | null; occurred_at: string }[] };
      get_my_ui_preferences: { Args: Record<PropertyKey, never>; Returns: Json };
      update_ui_preferences: { Args: { p_preferences: Json }; Returns: boolean };
      update_profile_customisation: { Args: { p_config: Json }; Returns: boolean };
      has_ad_badge: { Args: { p_user_id: string }; Returns: boolean };
      has_moderator_role: { Args: { p_user_id: string; p_min_role: string }; Returns: boolean };
      record_moderation_action: { Args: { p_actor_id: string; p_target_type: string; p_target_id: string; p_action: string; p_details: Json | null; p_before_state: Json | null; p_after_state: Json | null }; Returns: string };
      reconcile_age_verified_badges: { Args: { p_actor_id: string }; Returns: { user_id: string; action: string }[] };
      get_my_profile_links: { Args: Record<PropertyKey, never>; Returns: Json };
      upsert_profile_links: { Args: { p_links: Json }; Returns: boolean };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
