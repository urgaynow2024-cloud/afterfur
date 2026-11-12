# AfterFur Database Schema Inventory

Generated from repository migration files and application code.

## Confirmed Tables

| Table | Source | PK | RLS |
|---|---|---|---|
| profiles | 0001_initial.sql | id (uuid) | enabled |
| posts | 0001_initial.sql | id (uuid) | enabled |
| likes | 0001_initial.sql | (user_id, post_id) | enabled |
| reposts | 0001_initial.sql | (user_id, post_id) | enabled |
| replies | 0001_initial.sql | id (uuid) | enabled |
| bookmarks | 0001_initial.sql | (user_id, post_id) | enabled |
| follows | 0001_initial.sql | (follower_id, following_id) | enabled |
| notifications | 0001_initial.sql | id (uuid) | enabled |
| conversations | 0001_initial.sql | id (uuid) | enabled |
| conversation_participants | 0001_initial.sql | (conversation_id, user_id) | enabled |
| messages | 0001_initial.sql | id (uuid) | enabled |
| badge_registry | 0015_badge_catalogue.sql | id (text) | N/A |
| staff_badge_assignments | 0011_badges_pawpass_milestones.sql | (user_id, badge_id) | enabled |
| staff_badge_audit | 0011_badges_pawpass_milestones.sql | id (bigint) | enabled |
| user_badge_awards | 0011_badges_pawpass_milestones.sql | (user_id, badge_id) | enabled |
| badge_account_origins | 0011_badges_pawpass_milestones.sql | user_id (uuid) | enabled |
| pawpass_entitlements | 0013_pawpass_membership_canonical.sql | user_id (uuid) | enabled |
| pawpass_event_receipts | 0013_pawpass_membership_canonical.sql | (provider, provider_event_id) | enabled |
| pawpass_founding_claims | 0013_pawpass_membership_canonical.sql | id (bigint) | enabled |
| pawpass_membership_audit | 0013_pawpass_membership_canonical.sql | id (bigint) | enabled |
| user_ui_preferences | 0017_customisation.sql | user_id (uuid) | enabled |
| bookmark_folders | 0019_bookmark_folders.sql | id (uuid) | enabled |
| bookmark_folder_items | 0019_bookmark_folders.sql | (folder_id, post_id) | enabled |
| media | STAGE_21B_MEDIA_PRIVATE_MIGRATION.sql | id (uuid) | enabled |
| message_attachments | STAGE_25_MESSAGE_ATTACHMENTS.sql | id (uuid) | enabled |
| message_reads | STAGE_25_MESSAGE_READ_RECEIPTS.sql | id (uuid) | enabled |
| conversation_mutes | STAGE_26_CONVERSATION_MUTES.sql | id (uuid) | enabled |
| reports | 0024_user_reports.sql | id (uuid) | enabled |
| moderator_roles | 0033_moderator_administration.sql | id (uuid) | enabled |
| moderation_audit_log | 0033_moderator_administration.sql | id (uuid) | enabled |
| user_enforcements | 0045_enforcement_and_rate_limiting.sql | id (uuid) | enabled |
| appeals | 0045_enforcement_and_rate_limiting.sql | id (uuid) | enabled |
| rate_limits | 0045_enforcement_and_rate_limiting.sql | id (uuid) | enabled |

## Unresolved (referenced in code, no DDL found)

- **blocks** - blocker_id, blocked_id, created_at. Referenced by 15+ application files and STAGE_21A_FINAL_BLOCKING_MIGRATION.sql. No CREATE TABLE in any migration file.
- **notification_preferences** - user_id, likes, replies, reposts, follows, follow_requests, mentions, messages, updated_at. Referenced by src/lib/notificationPreferences.ts and src/app/api/notifications/preferences/route.ts. No CREATE TABLE in any migration file.
- **message_requests** - id, from_user_id, to_user_id, status, created_at. Referenced by src/app/api/messages/requests/route.ts. No CREATE TABLE in any migration file.

## Migration History

UNKNOWN - supabase_migrations.schema_migrations not referenced. Migration application status cannot be confirmed from object existence alone.
