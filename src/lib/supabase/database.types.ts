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

type ProfileRow = {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  website: string | null;
  created_at: string | null;
  location: string | null;
};

type PostRow = {
  id: string;
  author_id: string;
  content: string;
  classification: string;
  created_at: string | null;
  edited_at: string | null;
  media_urls: string[] | null;
};

type ReplyRow = {
  id: string;
  post_id: string | null;
  author_id: string | null;
  content: string;
  created_at: string | null;
  parent_reply_id: string | null;
};

type MessageRow = {
  id: string;
  conversation_id: string | null;
  sender_id: string | null;
  content: string;
  created_at: string | null;
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<ProfileRow, Pick<ProfileRow, "id" | "username"> & Partial<Omit<ProfileRow, "id" | "username">>, Partial<Omit<ProfileRow, "id">>>;
      posts: Table<PostRow, Pick<PostRow, "author_id" | "content"> & Partial<Omit<PostRow, "id" | "author_id" | "content">>, Partial<Omit<PostRow, "id">>>;
      likes: Table<{ user_id: string; post_id: string }, { user_id: string; post_id: string }, { user_id?: string; post_id?: string }>;
      reposts: Table<{ user_id: string; post_id: string }, { user_id: string; post_id: string }, { user_id?: string; post_id?: string }>;
      bookmarks: Table<{ user_id: string; post_id: string }, { user_id: string; post_id: string }, { user_id?: string; post_id?: string }>;
      follows: Table<{ follower_id: string; following_id: string }, { follower_id: string; following_id: string }, { follower_id?: string; following_id?: string }>;
      replies: Table<ReplyRow, Pick<ReplyRow, "content"> & Partial<Omit<ReplyRow, "id" | "content">>, Partial<Omit<ReplyRow, "id">>>;
      notifications: Table<{ id: string; user_id: string | null; type: string; payload: Json | null; read: boolean | null; created_at: string | null }, { id?: string; user_id?: string | null; type: string; payload?: Json | null; read?: boolean | null; created_at?: string | null }, { id?: string; user_id?: string | null; type?: string; payload?: Json | null; read?: boolean | null; created_at?: string | null }>;
      conversations: Table<{ id: string; created_at: string | null }, { id?: string; created_at?: string | null }, { id?: string; created_at?: string | null }>;
      conversation_participants: Table<{ conversation_id: string; user_id: string }, { conversation_id: string; user_id: string }, { conversation_id?: string; user_id?: string }>;
      messages: Table<MessageRow, Pick<MessageRow, "content"> & Partial<Omit<MessageRow, "id" | "content">>, Partial<Omit<MessageRow, "id">>>;
      badge_registry: Table<{ id: string; category: string; display_name: string; display_order: number; is_public: boolean }, { id: string; category: string; display_name: string; display_order: number; is_public?: boolean }, Partial<{ category: string; display_name: string; display_order: number; is_public: boolean }>>;
      staff_badge_assignments: Table<{ user_id: string; badge_id: string; assigned_by: string; assigned_at: string }, { user_id: string; badge_id: string; assigned_by: string; assigned_at?: string }, never>;
      staff_badge_audit: Table<{ id: number; actor_id: string; target_id: string; badge_id: string; action: string; occurred_at: string }, never, never>;
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
      get_public_badges: { Args: { p_user_ids: string[] }; Returns: { user_id: string; badge_id: string }[] };
      search_staff_badge_targets: { Args: { p_query: string }; Returns: { user_id: string; username: string; display_name: string | null }[] };
      get_staff_badges_for_admin: { Args: { p_target_id: string }; Returns: { badge_id: string }[] };
      manage_staff_badge: { Args: { p_target_id: string; p_badge_id: string; p_action: string }; Returns: boolean };
      process_pawpass_entitlement_event: { Args: { p_user_id: string; p_provider: string; p_customer_id: string; p_subscription_id: string; p_event_id: string; p_event_type: string; p_status: string; p_eligible_since: string; p_current_period_end: string | null; p_occurred_at: string }; Returns: boolean };
      get_my_pawpass_entitlement: { Args: Record<PropertyKey, never>; Returns: { is_active: boolean; status: string; current_period_end: string | null }[] };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
