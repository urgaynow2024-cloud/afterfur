-- AFTERFUR_FULL_DATABASE_AUDIT.sql
-- Comprehensive READ-ONLY audit for AfterFur on Supabase PostgreSQL.
-- Purpose: inspect actual database state and report structure, security, automation,
--          migration integrity, known AfterFur issues, and schema consistency/drift.
--
-- HOW TO RUN (once): open Supabase Dashboard -> SQL Editor -> paste this entire file -> Run.
--   Review all result sets/tabs in order. Each finding row includes status/object/explanation.
--
-- SAFETY: SELECT/catalog queries only. No INSERT/UPDATE/DELETE/ALTER/DROP/CREATE/TRUNCATE/DO
--         and no migration execution. Does not modify data, schema, RLS, or privileges.
--         Does not expose secrets (no credential/token columns selected).
-- STATUSES: PASS | WARNING | FAIL | UNKNOWN. UNKNOWN = check could not be performed/verified.
--
-- NOTE (migration history): migration history tables are not queried by this executable audit
-- because their presence/name/access can vary and direct references can fail parse/execute
-- (e.g. missing relation). This script reports migration-history checks as UNKNOWN/unavailable
-- and instead reports: (1) migration files present in repository (embedded list),
-- (2) whether expected database objects currently exist, and (3) that migration application
-- status is NOT confirmed by object existence alone. Use the standalone review notes for
-- history verification outside this audit if/when history is safely accessible.

-- ============================================================
-- SECTION 00: AUDIT META
-- ============================================================

-- CONSOLIDATED: all findings returned in ONE final result set (sections 00-06 + 99_complete).
-- CTE-based union-all (read-only); no temp/permanent tables or data changes.

-- CONSOLIDATED: all findings returned in ONE final result set (sections 00-06 + 99_complete).
-- Single top-level WITH; each audit check is a named CTE (read-only). No temp/permanent tables or data changes.

with
  f00_00_meta_audit_execution as (
    select
      '00_meta'::text as section,
      'audit_execution'::text as check_name,
      current_database()::text as object_name,
      'PASS'::text as status,
      'Read-only audit executed. Review all result sets below for PASS/WARNING/FAIL/UNKNOWN findings.'::text as explanation,
      jsonb_build_object(
        'database', current_database(),
        'current_user', current_user,
        'server_version', current_setting('server_version'),
        'executed_at_utc', now(),
        'script', 'docs/AFTERFUR_FULL_DATABASE_AUDIT.sql'
      ) as details
  ),

  f01_04_expected_repo_migration_files as (
    with expected_migrations(filename, kind) as (
      values
        ('0001_initial.sql','numeric'),
        ('0002_follow_read_policy.sql','numeric'),
        ('0003_profile_creation_trigger.sql','numeric'),
        ('0004_secure_post_like_counts.sql','numeric'),
        ('0005_secure_post_repost_counts.sql','numeric'),
        ('0006_secure_direct_messages.sql','numeric'),
        ('0007_own_post_edits.sql','numeric'),
        ('0008_public_post_reply_counts.sql','numeric'),
        ('0009_secure_notification_actions.sql','numeric'),
        ('0010_latest_conversation_messages.sql','numeric'),
        ('0011_badges_pawpass_milestones.sql','numeric'),
        ('0012_profile_accent.sql','numeric'),
        ('0013_pawpass_membership_canonical.sql','numeric'),
        ('0014_replies_management.sql','numeric'),
        ('0015_badge_catalogue.sql','numeric'),
        ('0016_terms_acceptance.sql','numeric'),
        ('0017_customisation.sql','numeric'),
        ('0018_terms_acceptance_trigger.sql','numeric'),
        ('0019_bookmark_folders.sql','numeric'),
        ('0020_ad_creator_badge.sql','numeric'),
        ('0021_ad_creator_auto.sql','numeric'),
        ('0022_badge_notifications.sql','numeric'),
        ('0023_post_length_check.sql','numeric'),
        ('0024_user_reports.sql','numeric'),
        ('0025_follow_and_mention_notifications.sql','numeric'),
        ('0033_moderator_administration.sql','numeric'),
        ('0034_moderation_content_status.sql','numeric'),
        ('0035_badge_reaward_fix.sql','numeric'),
        ('0036_moderator_administration_security_fix.sql','numeric'),
        ('0037_fix_report_submission_volatility.sql','numeric'),
        ('0038_sync_staff_role_badges.sql','numeric'),
        ('0039_ad_badge_posting_permission.sql','numeric'),
        ('0040_audit_nsfw_public_media.sql','numeric'),
        ('0041_nsfw_media_private_tracking.sql','numeric'),
        ('0042_posts_classification.sql','numeric'),
        ('0043_revoke_sync_staff_role_badge_public_execute.sql','numeric'),
        ('0044_posts_rls_hardening.sql','numeric'),
        ('0045_enforcement_and_rate_limiting.sql','numeric'),
        ('0046_harden_rate_limits_privileges.sql','numeric'),
        ('0047_fix_check_rate_limit_volatility.sql','numeric'),
        ('Account_Data_Rights_Migration.sql','named'),
        ('ALL_MIGRATIONS_CONSOLIDATED.sql','named'),
        ('PawPass_Migration.sql','named'),
        ('Posts_Classification_Migration.sql','named'),
        ('STAGE_21A_FINAL_BLOCKING_MIGRATION.sql','named'),
        ('STAGE_21A_FINAL_BLOCKING_ROLLBACK.sql','named'),
        ('STAGE_21B_FOLLOW_REQUESTS_RLS.sql','named'),
        ('STAGE_21B_MEDIA_PRIVATE_MIGRATION.sql','named'),
        ('STAGE_21B_PROFILE_PRIVACY_MIGRATION.sql','named'),
        ('STAGE_21B_PROFILE_PRIVACY_RECOVERY.sql','named'),
        ('STAGE_21B_PROFILE_PRIVACY_ROLLBACK.sql','named'),
        ('STAGE_25_MESSAGE_ATTACHMENTS.sql','named'),
        ('STAGE_25_MESSAGE_READ_RECEIPTS.sql','named'),
        ('STAGE_26_CONVERSATION_MUTES.sql','named'),
        ('STAGE_ACCOUNT_DATA_RIGHTS.sql','named'),
        ('STAGE_PAWPASS_BOOSTS.sql','named'),
        ('STAGE_PAWPASS_COMPLETE.sql','named')
    )
    select
      '04_migration_integrity'::text as section,
      'expected_repo_migration_file'::text as check_name,
      filename::text as object_name,
      'PASS'::text as status,
      case when kind='numeric' then 'SQL migration file present in repository (embedded reference) for comparison.'
           else 'Named/auxiliary SQL migration file present in repository (embedded reference); may not map 1:1 to Supabase CLI version history.' end as explanation,
      jsonb_build_object('filename', filename, 'kind', kind) as details
    from expected_migrations
    order by filename
  )
  ),

  f03_04_migration_integrity_numeric_sequence_gap as (
    select
      '04_migration_integrity'::text as section,
      'numeric_sequence_gap'::text as check_name,
      '0026-0032 (missing in repo)'::text as object_name,
      'WARNING'::text as status,
      'Numeric migration files jump from 0025 to 0033 in repository; 0026-0032 are not present. Verify intentional and consistent with applied history.'::text as explanation,
      jsonb_build_object('gap', array['0026','0027','0028','0029','0030','0031','0032'], 'after', '0025_follow_and_mention_notifications.sql', 'before', '0033_moderator_administration.sql') as details;
    
    -- ============================================================
    -- SECTION 01: DATABASE STRUCTURE
    -- ============================================================
    
    -- 1.1 Schemas
  ),

  f04_01_structure_schema as (
    select
      '01_structure'::text as section,
      'schema'::text as check_name,
      n.nspname::text as object_name,
      case when n.nspname in ('public','auth','storage','graphql_public','supabase_migrations','extensions','realtime','vault','pgsodium','supabase_functions') then 'PASS' else 'WARNING' end as status,
      case when n.nspname in ('public','auth','storage','graphql_public','supabase_migrations','extensions','realtime','vault','pgsodium','supabase_functions')
           then 'Schema present (common in Supabase/PostgreSQL environments).'
           else 'Schema present; review whether expected for this AfterFur project.' end as explanation,
      jsonb_build_object('schema', n.nspname, 'owner', pg_get_userbyid(n.nspowner)) as details
    from pg_namespace n
    where n.nspname not like 'pg_%' and n.nspname <> 'information_schema'
    order by n.nspname;
    
    -- 1.2 Tables (all non-system schemas, base tables/views/foreign)
  ),

  f05_01_structure_table_or_view_object as (
    select
      '01_structure'::text as section,
      'table_or_view_object'::text as check_name,
      (t.table_schema || '.' || t.table_name)::text as object_name,
      case when t.table_schema in ('public','supabase_migrations') then 'PASS' else 'WARNING' end as status,
      ('Relation present: ' || t.table_type || '.')::text as explanation,
      jsonb_build_object('schema', t.table_schema, 'name', t.table_name, 'type', t.table_type) as details
    from information_schema.tables t
    where t.table_schema not in ('pg_catalog','information_schema')
      and t.table_schema not like 'pg_toast%'
    order by t.table_schema, t.table_type, t.table_name;
    
    -- 1.3 Columns (types, defaults, nullability, identity, generated)
  ),

  f06_01_structure_column as (
    select
      '01_structure'::text as section,
      'column'::text as check_name,
      (c.table_schema || '.' || c.table_name || '.' || c.column_name)::text as object_name,
      'PASS'::text as status,
      'Column definition observed in catalog.'::text as explanation,
      jsonb_build_object(
        'schema', c.table_schema,
        'table', c.table_name,
        'column', c.column_name,
        'ordinal_position', c.ordinal_position,
        'data_type', c.data_type,
        'udt_schema', c.udt_schema,
        'udt_name', c.udt_name,
        'is_nullable', c.is_nullable,
        'column_default', c.column_default,
        'character_maximum_length', c.character_maximum_length,
        'numeric_precision', c.numeric_precision,
        'numeric_scale', c.numeric_scale,
        'datetime_precision', c.datetime_precision,
        'is_identity', c.is_identity,
        'identity_generation', c.identity_generation,
        'identity_start', c.identity_start,
        'identity_increment', c.identity_increment,
        'is_generated', c.is_generated,
        'generation_expression', c.generation_expression
      ) as details
    from information_schema.columns c
    where c.table_schema in ('public','supabase_migrations')
    order by c.table_schema, c.table_name, c.ordinal_position;
    
    -- 1.4 Primary keys
  ),

  f07_01_structure_primary_key as (
    select
      '01_structure'::text as section,
      'primary_key'::text as check_name,
      (tc.table_schema || '.' || tc.table_name || ' [' || tc.constraint_name || ']')::text as object_name,
      'PASS'::text as status,
      'Primary key constraint present.'::text as explanation,
      jsonb_build_object(
        'schema', tc.table_schema,
        'table', tc.table_name,
        'constraint', tc.constraint_name,
        'columns', (
          select jsonb_agg(kcu.column_name order by kcu.ordinal_position)
          from information_schema.key_column_usage kcu
          where kcu.constraint_schema = tc.constraint_schema and kcu.constraint_name = tc.constraint_name
            and kcu.table_schema = tc.table_schema and kcu.table_name = tc.table_name
        )
      ) as details
    from information_schema.table_constraints tc
    where tc.constraint_type = 'PRIMARY KEY' and tc.table_schema = 'public'
    order by tc.table_name, tc.constraint_name;
    
    -- Public tables without a primary key
  ),

  f08_01_structure_table_without_primary_key as (
    select
      '01_structure'::text as section,
      'table_without_primary_key'::text as check_name,
      (t.table_schema || '.' || t.table_name)::text as object_name,
      'WARNING'::text as status,
      'Public base table has no PRIMARY KEY; may be intentional (join/log/table) but review for integrity/replication needs.'::text as explanation,
      jsonb_build_object('schema', t.table_schema, 'table', t.table_name) as details
    from information_schema.tables t
    where t.table_schema = 'public' and t.table_type = 'BASE TABLE'
      and not exists (
        select 1 from information_schema.table_constraints tc
        where tc.table_schema = t.table_schema and tc.table_name = t.table_name and tc.constraint_type = 'PRIMARY KEY'
      )
    order by t.table_name;
    
    -- 1.5 Foreign keys
  ),

  f09_01_structure_foreign_key as (
    select
      '01_structure'::text as section,
      'foreign_key'::text as check_name,
      (tc.table_schema || '.' || tc.table_name || ' [' || tc.constraint_name || ']')::text as object_name,
      'PASS'::text as status,
      'Foreign key constraint present.'::text as explanation,
      jsonb_build_object(
        'schema', tc.table_schema,
        'table', tc.table_name,
        'constraint', tc.constraint_name,
        'columns', (
          select jsonb_agg(kcu.column_name order by kcu.ordinal_position)
          from information_schema.key_column_usage kcu
          where kcu.constraint_schema = tc.constraint_schema
            and kcu.constraint_name = tc.constraint_name
            and kcu.table_schema = tc.table_schema
            and kcu.table_name = tc.table_name
        ),
        'referenced_schema', rc.unique_constraint_schema,
        'referenced_table', ref_tc.table_name,
        'referenced_columns', (
          select jsonb_agg(rkcu.column_name order by rkcu.ordinal_position)
          from information_schema.key_column_usage rkcu
          where rkcu.constraint_schema = rc.unique_constraint_schema
            and rkcu.constraint_name = rc.unique_constraint_name
        ),
        'match_option', rc.match_option,
        'update_rule', rc.update_rule,
        'delete_rule', rc.delete_rule,
        'is_deferrable', tc.is_deferrable,
        'initially_deferred', tc.initially_deferred
      ) as details
    from information_schema.table_constraints tc
    join information_schema.referential_constraints rc
      on rc.constraint_schema = tc.constraint_schema
     and rc.constraint_name = tc.constraint_name
    join information_schema.table_constraints ref_tc
      on ref_tc.constraint_schema = rc.unique_constraint_schema
     and ref_tc.constraint_name = rc.unique_constraint_name
    where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'
    order by tc.table_name, tc.constraint_name;
    
    -- 1.6 Unique constraints
  ),

  f10_01_structure_unique_constraint as (
    select
      '01_structure'::text as section,
      'unique_constraint'::text as check_name,
      (tc.table_schema || '.' || tc.table_name || ' [' || tc.constraint_name || ']')::text as object_name,
      'PASS'::text as status,
      'Unique constraint present.'::text as explanation,
      jsonb_build_object(
        'schema', tc.table_schema,
        'table', tc.table_name,
        'constraint', tc.constraint_name,
        'columns', (
          select jsonb_agg(kcu.column_name order by kcu.ordinal_position)
          from information_schema.key_column_usage kcu
          where kcu.constraint_schema = tc.constraint_schema and kcu.constraint_name = tc.constraint_name
        ),
        'is_deferrable', tc.is_deferrable,
        'initially_deferred', tc.initially_deferred
      ) as details
    from information_schema.table_constraints tc
    where tc.constraint_type = 'UNIQUE' and tc.table_schema = 'public'
    order by tc.table_name, tc.constraint_name;
    
    -- 1.7 Check constraints
  ),

  f11_01_structure_check_constraint as (
    select
      '01_structure'::text as section,
      'check_constraint'::text as check_name,
      (n.nspname || '.' || c.relname || ' [' || con.conname || ']')::text as object_name,
      'PASS'::text as status,
      'Check constraint present.'::text as explanation,
      jsonb_build_object(
        'schema', n.nspname,
        'table', c.relname,
        'constraint', con.conname,
        'definition', pg_get_constraintdef(con.oid, true),
        'is_validated', con.convalidated,
        'is_local', con.conislocal
      ) as details
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where con.contype = 'c' and n.nspname = 'public'
    order by c.relname, con.conname;
    
    -- 1.8 Indexes and definitions
  ),

  f12_01_structure_index as (
    select
      '01_structure'::text as section,
      'index'::text as check_name,
      (i.schemaname || '.' || i.tablename || ' [' || i.indexname || ']')::text as object_name,
      'PASS'::text as status,
      'Index present with definition.'::text as explanation,
      jsonb_build_object(
        'schema', i.schemaname,
        'table', i.tablename,
        'index', i.indexname,
        'definition', i.indexdef,
        'is_unique', idx.indisunique,
        'is_primary', idx.indisprimary,
        'is_valid', idx.indisvalid
      ) as details
    from pg_indexes i
    join pg_namespace n on n.nspname = i.schemaname
    join pg_class t on t.relname = i.tablename and t.relnamespace = n.oid
    join pg_class ic on ic.relname = i.indexname and ic.relnamespace = n.oid
    join pg_index idx on idx.indexrelid = ic.oid
    where i.schemaname = 'public'
    order by i.tablename, i.indexname;
    
    -- ============================================================
    -- SECTION 02: SECURITY
    -- ============================================================
    
    -- 2.1 RLS enabled/disabled on public tables
  ),

  f13_02_security_rls_status as (
    select
      '02_security'::text as section,
      'rls_status'::text as check_name,
      (n.nspname || '.' || c.relname)::text as object_name,
      case when c.relrowsecurity then 'PASS' else 'WARNING' end as status,
      case when c.relrowsecurity then 'Row Level Security is ENABLED.'
           else 'Row Level Security is DISABLED; verify intentional for this table.' end as explanation,
      jsonb_build_object(
        'schema', n.nspname,
        'table', c.relname,
        'rls_enabled', c.relrowsecurity,
        'rls_forced', c.relforcerowsecurity
      ) as details
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
    order by c.relname;
    
    -- 2.2 RLS policies (commands, roles, conditions)
  ),

  f14_02_security_rls_policy as (
    select
      '02_security'::text as section,
      'rls_policy'::text as check_name,
      (p.schemaname || '.' || p.tablename || ' [' || p.policyname || ']')::text as object_name,
      'PASS'::text as status,
      'RLS policy present.'::text as explanation,
      jsonb_build_object(
        'schema', p.schemaname,
        'table', p.tablename,
        'policy', p.policyname,
        'permissive', p.permissive,
        'roles', p.roles,
        'command', p.cmd,
        'using_expression', p.qual,
        'with_check_expression', p.with_check
      ) as details
    from pg_policies p
    where p.schemaname = 'public'
    order by p.tablename, p.policyname;
    
    -- 2.3 Tables with RLS enabled but no policies
  ),

  f15_02_security_rls_enabled_no_policies as (
    select
      '02_security'::text as section,
      'rls_enabled_no_policies'::text as check_name,
      (n.nspname || '.' || c.relname)::text as object_name,
      'WARNING'::text as status,
      'RLS is enabled but no policies found; access may be fully restricted by default or unintended.'::text as explanation,
      jsonb_build_object('schema', n.nspname, 'table', c.relname) as details
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
      and not exists (
        select 1 from pg_policies p where p.schemaname = n.nspname and p.tablename = c.relname
      )
    order by c.relname;
    
    -- 2.4 Table grants/privileges (public schema)
  ),

  f16_02_security_table_grant as (
    select
      '02_security'::text as section,
      'table_grant'::text as check_name,
      (rtg.table_schema || '.' || rtg.table_name || ' -> ' || rtg.grantee || ' [' || rtg.privilege_type || ']')::text as object_name,
      case when rtg.grantee in ('anon','authenticated','service_role','postgres','supabase_admin','supabase_auth_admin','supabase_storage_admin') then 'PASS' else 'WARNING' end as status,
      'Table-level privilege grant observed.'::text as explanation,
      jsonb_build_object(
        'schema', rtg.table_schema,
        'table', rtg.table_name,
        'grantee', rtg.grantee,
        'privilege_type', rtg.privilege_type,
        'is_grantable', rtg.is_grantable
      ) as details
    from information_schema.role_table_grants rtg
    where rtg.table_schema = 'public'
    order by rtg.table_name, rtg.grantee, rtg.privilege_type;
    
    -- 2.5 Functions and procedures (security, search_path, volatility, ownership)
  ),

  f17_02_security_function_routine as (
    select
      '02_security'::text as section,
      'function_routine'::text as check_name,
      (n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')')::text as object_name,
      case
        when p.prosecdef and coalesce(array_to_string(p.proconfig, ' | '), '') !~* 'search_path' then 'WARNING'
        else 'PASS'
      end as status,
      case
        when p.prosecdef and coalesce(array_to_string(p.proconfig, ' | '), '') !~* 'search_path'
          then 'SECURITY DEFINER routine without explicit search_path in function config; review hardening.'
        when p.prosecdef then 'SECURITY DEFINER routine observed (review intended).'
        else 'Routine definition/attributes observed.'
      end as explanation,
      jsonb_build_object(
        'schema', n.nspname,
        'name', p.proname,
        'kind', case p.prokind when 'f' then 'function' when 'p' then 'procedure' when 'a' then 'aggregate' when 'w' then 'window' else p.prokind::text end,
        'language', l.lanname,
        'security_definer', p.prosecdef,
        'volatility', case p.provolatile when 'i' then 'IMMUTABLE' when 's' then 'STABLE' when 'v' then 'VOLATILE' end,
        'leakproof', p.proleakproof,
        'strict', p.proisstrict,
        'returns_set', p.proretset,
        'owner', pg_get_userbyid(p.proowner),
        'argument_types', pg_get_function_identity_arguments(p.oid),
        'result_type', pg_get_function_result(p.oid),
        'search_path_config', coalesce(p.proconfig, array[]::text[]),
        'acl', p.proacl::text[]
      ) as details
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_language l on l.oid = p.prolang
    where n.nspname = 'public'
    order by p.proname, pg_get_function_identity_arguments(p.oid);
    
    -- 2.6 Function execute permissions (routine_privileges)
  ),

  f18_02_security_function_execute_privilege as (
    select
      '02_security'::text as section,
      'function_execute_privilege'::text as check_name,
      (rp.routine_schema || '.' || rp.routine_name || ' -> ' || rp.grantee || ' [EXECUTE]')::text as object_name,
      'PASS'::text as status,
      'EXECUTE privilege observed on routine.'::text as explanation,
      jsonb_build_object(
        'schema', rp.routine_schema,
        'routine', rp.routine_name,
        'specific_name', rp.specific_name,
        'grantee', rp.grantee,
        'privilege_type', rp.privilege_type,
        'is_grantable', rp.is_grantable
      ) as details
    from information_schema.routine_privileges rp
    where rp.routine_schema = 'public' and rp.privilege_type = 'EXECUTE'
    order by rp.routine_name, rp.grantee;
    
    -- ============================================================
    -- SECTION 03: DATABASE AUTOMATION
    -- ============================================================
    
    -- 3.1 Triggers
  ),

  f19_03_automation_trigger as (
    select
      '03_automation'::text as section,
      'trigger'::text as check_name,
      (t.event_object_schema || '.' || t.event_object_table || ' [' || t.trigger_name || ' / ' || t.event_manipulation || ']')::text as object_name,
      'PASS'::text as status,
      'Trigger present.'::text as explanation,
      jsonb_build_object(
        'schema', t.event_object_schema,
        'table', t.event_object_table,
        'trigger', t.trigger_name,
        'event_manipulation', t.event_manipulation,
        'action_timing', t.action_timing,
        'action_orientation', t.action_orientation,
        'action_statement', t.action_statement,
        'action_condition', t.action_condition
      ) as details
    from information_schema.triggers t
    where t.event_object_schema = 'public'
    order by t.event_object_table, t.trigger_name, t.event_manipulation;
    
    -- 3.2 Trigger functions (pg_trigger -> function mapping)
  ),

  f20_03_automation_trigger_function_binding as (
    select
      '03_automation'::text as section,
      'trigger_function_binding'::text as check_name,
      (ns.nspname || '.' || tbl.relname || ' [' || tg.tgname || ']')::text as object_name,
      'PASS'::text as status,
      'Trigger bound to function.'::text as explanation,
      jsonb_build_object(
        'schema', ns.nspname,
        'table', tbl.relname,
        'trigger', tg.tgname,
        'enabled', tg.tgenabled,
        'function_schema', fns.nspname,
        'function_name', fn.proname,
        'function_args_identity', pg_get_function_identity_arguments(fn.oid),
        'function_security_definer', fn.prosecdef,
        'function_language', (select l.lanname from pg_language l where l.oid = fn.prolang)
      ) as details
    from pg_trigger tg
    join pg_class tbl on tbl.oid = tg.tgrelid
    join pg_namespace ns on ns.oid = tbl.relnamespace
    join pg_proc fn on fn.oid = tg.tgfoid
    join pg_namespace fns on fns.oid = fn.pronamespace
    where not tg.tgisinternal and ns.nspname = 'public'
    order by tbl.relname, tg.tgname;
    
    -- 3.3 Views
  ),

  f21_03_automation_view as (
    select
      '03_automation'::text as section,
      'view'::text as check_name,
      (v.table_schema || '.' || v.table_name)::text as object_name,
      'PASS'::text as status,
      'View present.'::text as explanation,
      jsonb_build_object(
        'schema', v.table_schema,
        'view', v.table_name,
        'is_updatable', v.is_updatable,
        'is_insertable_into', v.is_insertable_into,
        'definition', v.view_definition
      ) as details
    from information_schema.views v
    where v.table_schema = 'public'
    order by v.table_name;
    
    -- 3.4 Materialized views
  ),

  f22_03_automation_materialized_view as (
    select
      '03_automation'::text as section,
      'materialized_view'::text as check_name,
      (mv.schemaname || '.' || mv.matviewname)::text as object_name,
      'PASS'::text as status,
      'Materialized view present.'::text as explanation,
      jsonb_build_object(
        'schema', mv.schemaname,
        'matview', mv.matviewname,
        'owner', mv.matviewowner,
        'ispopulated', mv.ispopulated,
        'definition', mv.definition
      ) as details
    from pg_matviews mv
    where mv.schemaname = 'public'
    order by mv.matviewname;
    
    -- 3.5 Sequences
  ),

  f23_03_automation_sequence as (
    select
      '03_automation'::text as section,
      'sequence'::text as check_name,
      (s.sequence_schema || '.' || s.sequence_name)::text as object_name,
      'PASS'::text as status,
      'Sequence present.'::text as explanation,
      jsonb_build_object(
        'schema', s.sequence_schema,
        'sequence', s.sequence_name,
        'data_type', s.data_type,
        'start_value', s.start_value,
        'minimum_value', s.minimum_value,
        'maximum_value', s.maximum_value,
        'increment', s.increment,
        'cycle_option', s.cycle_option
      ) as details
    from information_schema.sequences s
    where s.sequence_schema = 'public'
    order by s.sequence_name;
    
    -- 3.6 Extensions
  ),

  f24_03_automation_extension as (
    select
      '03_automation'::text as section,
      'extension'::text as check_name,
      e.extname::text as object_name,
      'PASS'::text as status,
      'Installed extension.'::text as explanation,
      jsonb_build_object('extension', e.extname, 'schema', n.nspname, 'version', e.extversion) as details
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    order by e.extname;
    
    -- ============================================================
    -- SECTION 04: MIGRATION INTEGRITY
    -- ============================================================
    -- Migration history is NOT queried in this executable audit to avoid parse/execute
    -- failures when the history relation is missing or inaccessible in a given project.
    -- This section distinguishes: migration history availability, repo migration files,
    -- current database object existence, and migration application status (confirmed separately).
    
    -- 4.1 Migration history availability (not queried here)
  ),

  f25_04_migration_integrity_migration_history_availability as (
    select
      '04_migration_integrity'::text as section,
      'migration_history_availability'::text as check_name,
      'supabase migration history (not queried)'::text as object_name,
      'UNKNOWN'::text as status,
      'Migration history was not read by this audit script. Direct history queries are omitted to prevent failures if the history relation is missing/inaccessible. Recorded/applied status in history is UNCONFIRMED here.'::text as explanation,
      jsonb_build_object(
        'migration_history_unavailable_in_audit', true,
        'queried', false,
        'reason', 'avoid missing-relation parse/execute errors; history access varies by project',
        'verified_separately_required', true
      ) as details;
    
    -- 4.2 Recorded migrations / comparison / duplicates / 0034 history (unavailable without history read)
  ),

  f26_04_migration_integrity_recorded_migrations_listing as (
    select
      '04_migration_integrity'::text as section,
      'recorded_migrations_listing'::text as check_name,
      'migration history records'::text as object_name,
      'UNKNOWN'::text as status,
      'Cannot list recorded migrations because migration history is not queried by this audit. Do not infer recorded/applied status from database object existence.'::text as explanation,
      jsonb_build_object('history_read', false, 'application_status_confirmed', false) as details
    union all
  ),

  f27_s27_check27 as (
    select
      '04_migration_integrity'::text,
      'db_history_vs_repo_file_comparison'::text,
      'migration history vs embedded repo file list'::text,
      'UNKNOWN'::text,
      'Comparison of DB-recorded migrations to embedded repository file list is unavailable because migration history is not queried. Repository file presence (see expected_repo_migration_file rows) and database object existence (sections 05/06) are reported separately.'::text,
      jsonb_build_object('history_read', false, 'repo_files_reported', true, 'db_objects_reported', true)
    union all
  ),

  f28_s28_check28 as (
    select
      '04_migration_integrity'::text,
      'duplicate_migration_versions'::text,
      'migration history versions'::text,
      'UNKNOWN'::text,
      'Cannot detect duplicate recorded migration versions because migration history is not queried.'::text,
      jsonb_build_object('history_read', false)
    union all
  ),

  f29_s29_check29 as (
    select
      '04_migration_integrity'::text,
      'migration_0034_history_record'::text,
      '0034_moderation_content_status.sql'::text,
      'UNKNOWN'::text,
      'Migration history record for 0034 is UNCONFIRMED (history not queried). Repository file presence and current database object existence are reported separately below; object existence does NOT prove the migration was applied or recorded.'::text,
      jsonb_build_object(
        'repo_file_present_embedded', true,
        'history_read', false,
        'history_record_confirmed', false,
        'application_status_confirmed', false,
        'see_also', array['04_migration_integrity.expected_repo_migration_file','05_known_issues.posts_moderation_column','05_known_issues.replies_moderation_column','05_known_issues.moderation_index','05_known_issues.moderation_status_check','05_known_issues.moderated_by_foreign_key','06_migration_consistency.0034_object_consistency','06_migration_consistency.0034_consistency_summary']
      );
    
    -- 4.3 Repo file presence vs object existence (clarification)
  ),

  f30_04_migration_integrity_migration_evidence_clarification as (
    select
      '04_migration_integrity'::text as section,
      'migration_evidence_clarification'::text as check_name,
      'evidence separation'::text as object_name,
      'PASS'::text as status,
      'This audit reports distinct evidence: (A) migration history availability/records = UNKNOWN here (not queried), (B) migration file present in repository = shown by expected_repo_migration_file rows, (C) database object currently exists = shown by structure/security/05/06 checks, (D) migration application status confirmed = UNKNOWN unless verified from authoritative migration history. Existing objects must not be treated as proof a specific migration was applied.'::text as explanation,
      jsonb_build_object(
        'migration_history', 'UNKNOWN (not queried)',
        'repo_file_presence', 'reported via embedded list',
        'db_object_exists', 'reported via catalog checks',
        'application_status_confirmed', 'UNKNOWN in this audit'
      ) as details;
    
    -- ============================================================
    -- SECTION 05: KNOWN AFTERFUR ISSUES
    -- ============================================================
    
    -- 5.1 follows.created_at
  ),

  f31_05_known_issues_follows_created_at_exists as (
    select
      '05_known_issues'::text as section,
      'follows_created_at_exists'::text as check_name,
      'public.follows.created_at'::text as object_name,
      case when exists (
        select 1 from information_schema.columns
        where table_schema='public' and table_name='follows' and column_name='created_at'
      ) then 'PASS' else 'FAIL' end as status,
      case when exists (
        select 1 from information_schema.columns
        where table_schema='public' and table_name='follows' and column_name='created_at'
      ) then 'Column public.follows.created_at exists.'
           else 'Column public.follows.created_at is MISSING. Known issue: runtime queries referencing it will fail; intended schema historically had no created_at - align queries/deploys or add via approved migration.' end as explanation,
      (select to_jsonb(c) from information_schema.columns c
        where c.table_schema='public' and c.table_name='follows' and c.column_name='created_at') as details;
    
    -- 5.2 posts moderation columns
  ),

  f32_05_known_issues_posts_moderation_column as (
    select
      '05_known_issues'::text as section,
      'posts_moderation_column'::text as check_name,
      ('public.posts.' || v.col)::text as object_name,
      case
        when c.column_name is null then 'FAIL'
        when v.col = 'moderation_status' and c.data_type='text' and c.is_nullable='NO' and coalesce(c.column_default,'') ilike '%visible%' then 'PASS'
        when v.col = 'moderated_at' and c.udt_name='timestamptz' and c.is_nullable='YES' then 'PASS'
        when v.col = 'moderated_by' and c.udt_name='uuid' and c.is_nullable='YES' then 'PASS'
        when v.col = 'moderation_reason' and c.data_type='text' and c.is_nullable='YES' then 'PASS'
        when c.column_name is not null then 'WARNING'
        else 'FAIL'
      end as status,
      case
        when c.column_name is null then 'Expected 0034 moderation column is MISSING on public.posts.'
        when v.col = 'moderation_status' and c.data_type='text' and c.is_nullable='NO' and coalesce(c.column_default,'') ilike '%visible%' then 'Column exists with expected base definition (text, NOT NULL, default visible).'
        when v.col = 'moderated_at' and c.udt_name='timestamptz' and c.is_nullable='YES' then 'Column exists with expected definition (timestamptz, nullable).'
        when v.col = 'moderated_by' and c.udt_name='uuid' and c.is_nullable='YES' then 'Column exists with expected type/nullability (uuid, nullable). FK verified separately.'
        when v.col = 'moderation_reason' and c.data_type='text' and c.is_nullable='YES' then 'Column exists with expected definition (text, nullable).'
        else 'Column exists but definition differs from 0034 expectation; review details.'
      end as explanation,
      jsonb_build_object(
        'expected', jsonb_build_object('column', v.col, 'data_type', v.expected_type, 'nullable', v.expected_nullable, 'default_contains', v.expected_default_hint),
        'actual', case when c.column_name is null then null else jsonb_build_object('data_type', c.data_type, 'udt_name', c.udt_name, 'is_nullable', c.is_nullable, 'column_default', c.column_default) end
      ) as details
    from (values
      ('moderation_status','text','NO','visible'),
      ('moderated_at','timestamp with time zone','YES',null::text),
      ('moderated_by','uuid','YES',null::text),
      ('moderation_reason','text','YES',null::text)
    ) v(col, expected_type, expected_nullable, expected_default_hint)
    left join information_schema.columns c
      on c.table_schema='public' and c.table_name='posts' and c.column_name=v.col
    order by v.col;
    
    -- 5.3 replies moderation columns
  ),

  f33_05_known_issues_replies_moderation_column as (
    select
      '05_known_issues'::text as section,
      'replies_moderation_column'::text as check_name,
      ('public.replies.' || v.col)::text as object_name,
      case
        when c.column_name is null then 'FAIL'
        when v.col = 'moderation_status' and c.data_type='text' and c.is_nullable='NO' and coalesce(c.column_default,'') ilike '%visible%' then 'PASS'
        when v.col = 'moderated_at' and c.udt_name='timestamptz' and c.is_nullable='YES' then 'PASS'
        when v.col = 'moderated_by' and c.udt_name='uuid' and c.is_nullable='YES' then 'PASS'
        when v.col = 'moderation_reason' and c.data_type='text' and c.is_nullable='YES' then 'PASS'
        when c.column_name is not null then 'WARNING'
        else 'FAIL'
      end as status,
      case
        when c.column_name is null then 'Expected 0034 moderation column is MISSING on public.replies.'
        when v.col = 'moderation_status' and c.data_type='text' and c.is_nullable='NO' and coalesce(c.column_default,'') ilike '%visible%' then 'Column exists with expected base definition (text, NOT NULL, default visible).'
        when v.col = 'moderated_at' and c.udt_name='timestamptz' and c.is_nullable='YES' then 'Column exists with expected definition (timestamptz, nullable).'
        when v.col = 'moderated_by' and c.udt_name='uuid' and c.is_nullable='YES' then 'Column exists with expected type/nullability (uuid, nullable). FK verified separately.'
        when v.col = 'moderation_reason' and c.data_type='text' and c.is_nullable='YES' then 'Column exists with expected definition (text, nullable).'
        else 'Column exists but definition differs from 0034 expectation; review details.'
      end as explanation,
      jsonb_build_object(
        'expected', jsonb_build_object('column', v.col, 'data_type', v.expected_type, 'nullable', v.expected_nullable, 'default_contains', v.expected_default_hint),
        'actual', case when c.column_name is null then null else jsonb_build_object('data_type', c.data_type, 'udt_name', c.udt_name, 'is_nullable', c.is_nullable, 'column_default', c.column_default) end
      ) as details
    from (values
      ('moderation_status','text','NO','visible'),
      ('moderated_at','timestamp with time zone','YES',null::text),
      ('moderated_by','uuid','YES',null::text),
      ('moderation_reason','text','YES',null::text)
    ) v(col, expected_type, expected_nullable, expected_default_hint)
    left join information_schema.columns c
      on c.table_schema='public' and c.table_name='replies' and c.column_name=v.col
    order by v.col;
    
    -- 5.4 Moderation indexes
  ),

  f34_05_known_issues_moderation_index as (
    select
      '05_known_issues'::text as section,
      'moderation_index'::text as check_name,
      ('public.' || v.tbl || ' [' || v.idx || ']')::text as object_name,
      case when i.indexname is not null then 'PASS' else 'FAIL' end as status,
      case when i.indexname is not null then 'Expected 0034 moderation index exists.' else 'Expected 0034 moderation index is MISSING.' end as explanation,
      jsonb_build_object(
        'expected', jsonb_build_object('table', v.tbl, 'index', v.idx, 'column', 'moderation_status'),
        'actual_definition', i.indexdef
      ) as details
    from (values ('posts','posts_moderation_status_idx'), ('replies','replies_moderation_status_idx')) v(tbl, idx)
    left join pg_indexes i on i.schemaname='public' and i.tablename=v.tbl and i.indexname=v.idx
    order by v.tbl;
    
    -- 5.5 Moderation CHECK constraints (visible, removed)
  ),

  f35_s35_check35 as (
    with checks as (
      select
        n.nspname as schema_name,
        c.relname as table_name,
        con.conname as constraint_name,
        pg_get_constraintdef(con.oid, true) as definition,
        con.convalidated
      from pg_constraint con
      join pg_class c on c.oid = con.conrelid
      join pg_namespace n on n.oid = c.relnamespace
      where con.contype = 'c' and n.nspname='public' and c.relname in ('posts','replies')
    )
  ),

  f36_05_known_issues_moderation_status_check as (
    select
      '05_known_issues'::text as section,
      'moderation_status_check'::text as check_name,
      ('public.' || e.tbl || '.moderation_status')::text as object_name,
      case
        when exists (
          select 1 from checks ch
          where ch.table_name = e.tbl
            and ch.definition ilike '%moderation_status%'
            and ch.definition ilike '%visible%'
            and ch.definition ilike '%removed%'
        ) then 'PASS'
        when not exists (select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=e.tbl and c.column_name='moderation_status') then 'FAIL'
        else 'FAIL'
      end as status,
      case
        when exists (
          select 1 from checks ch
          where ch.table_name = e.tbl
            and ch.definition ilike '%moderation_status%'
            and ch.definition ilike '%visible%'
            and ch.definition ilike '%removed%'
        ) then 'CHECK constraint enforcing moderation_status IN (''visible'',''removed'') found.'
        when not exists (select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=e.tbl and c.column_name='moderation_status') then 'moderation_status column missing; expected CHECK constraint absent.'
        else 'moderation_status column exists but expected CHECK (visible, removed) not found - possible partial application or drift.'
      end as explanation,
      jsonb_build_object(
        'matching_moderation_checks', (
          select coalesce(jsonb_agg(jsonb_build_object('constraint', ch.constraint_name, 'definition', ch.definition, 'validated', ch.convalidated)), '[]'::jsonb)
          from checks ch where ch.table_name = e.tbl and ch.definition ilike '%moderation_status%'
        ),
        'all_table_checks', (
          select coalesce(jsonb_agg(jsonb_build_object('constraint', ch.constraint_name, 'definition', ch.definition)), '[]'::jsonb)
          from checks ch where ch.table_name = e.tbl
        )
      ) as details
    from (values ('posts'), ('replies')) e(tbl)
    order by e.tbl;
    
    -- 5.6 moderated_by foreign keys -> public.profiles(id)
  ),

  f37_s37_check37 as (
    with fks as (
      select
        tc.table_name,
        tc.constraint_name,
        kcu.column_name,
        ccu.table_schema as ref_schema,
        ccu.table_name as ref_table,
        ccu.column_name as ref_column,
        rc.update_rule,
        rc.delete_rule
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema and tc.table_name = kcu.table_name
      join information_schema.referential_constraints rc
        on rc.constraint_name = tc.constraint_name and rc.constraint_schema = tc.table_schema
      join information_schema.constraint_column_usage ccu
        on ccu.constraint_name = tc.constraint_name and ccu.constraint_schema = tc.table_schema
      where tc.constraint_type='FOREIGN KEY' and tc.table_schema='public' and tc.table_name in ('posts','replies') and kcu.column_name='moderated_by'
    )
  ),

  f38_05_known_issues_moderated_by_foreign_key as (
    select
      '05_known_issues'::text as section,
      'moderated_by_foreign_key'::text as check_name,
      ('public.' || e.tbl || '.moderated_by -> public.profiles(id)')::text as object_name,
      case
        when exists (select 1 from fks f where f.table_name=e.tbl and f.ref_schema='public' and f.ref_table='profiles' and f.ref_column='id') then 'PASS'
        else 'FAIL'
      end as status,
      case
        when exists (select 1 from fks f where f.table_name=e.tbl and f.ref_schema='public' and f.ref_table='profiles' and f.ref_column='id') then 'FK present: moderated_by references public.profiles(id).'
        when exists (select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=e.tbl and c.column_name='moderated_by') then 'moderated_by column exists but expected FK to public.profiles(id) is missing or different.'
        else 'moderated_by column and expected FK are missing.'
      end as explanation,
      jsonb_build_object(
        'expected', jsonb_build_object('column','moderated_by','references','public.profiles(id)'),
        'actual_fks', (
          select coalesce(jsonb_agg(jsonb_build_object('constraint', f.constraint_name, 'ref_schema', f.ref_schema, 'ref_table', f.ref_table, 'ref_column', f.ref_column, 'on_update', f.update_rule, 'on_delete', f.delete_rule)), '[]'::jsonb)
          from fks f where f.table_name=e.tbl
        ),
        'column_exists', exists(select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=e.tbl and c.column_name='moderated_by')
      ) as details
    from (values ('posts'), ('replies')) e(tbl)
    order by e.tbl;
    
    -- 5.7 classification remains separate from moderation_status
  ),

  f39_05_known_issues_classification_separate_from_moderation_ as (
    select
      '05_known_issues'::text as section,
      'classification_separate_from_moderation_status'::text as check_name,
      'public.posts.(classification vs moderation_status)'::text as object_name,
      case
        when exists (select 1 from information_schema.columns where table_schema='public' and table_name='posts' and column_name='classification')
         and exists (select 1 from information_schema.columns where table_schema='public' and table_name='posts' and column_name='moderation_status')
        then 'PASS'
        when exists (select 1 from information_schema.columns where table_schema='public' and table_name='posts' and column_name='classification')
         and not exists (select 1 from information_schema.columns where table_schema='public' and table_name='posts' and column_name='moderation_status')
        then 'FAIL'
        when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='posts' and column_name='classification')
        then 'WARNING'
        else 'UNKNOWN'
      end as status,
      case
        when exists (select 1 from information_schema.columns where table_schema='public' and table_name='posts' and column_name='classification')
         and exists (select 1 from information_schema.columns where table_schema='public' and table_name='posts' and column_name='moderation_status')
        then 'Both classification and moderation_status exist as separate columns (correct separation of content rating vs moderation visibility state).'
        when exists (select 1 from information_schema.columns where table_schema='public' and table_name='posts' and column_name='classification')
         and not exists (select 1 from information_schema.columns where table_schema='public' and table_name='posts' and column_name='moderation_status')
        then 'classification exists but moderation_status is missing; moderation state must not be replaced by classification - schema incomplete for moderation workflow.'
        when not exists (select 1 from information_schema.columns where table_schema='public' and table_name='posts' and column_name='classification')
        then 'classification column not found on posts; verify schema (unexpected).'
        else 'Unable to determine separation state.'
      end as explanation,
      jsonb_build_object(
        'classification', (select jsonb_build_object('data_type',c.data_type,'is_nullable',c.is_nullable,'column_default',c.column_default) from information_schema.columns c where c.table_schema='public' and c.table_name='posts' and c.column_name='classification'),
        'moderation_status', (select jsonb_build_object('data_type',c.data_type,'is_nullable',c.is_nullable,'column_default',c.column_default) from information_schema.columns c where c.table_schema='public' and c.table_name='posts' and c.column_name='moderation_status')
      ) as details;
    
    -- ============================================================
    -- SECTION 06: MIGRATION CONSISTENCY / SCHEMA DRIFT (0034 focus)
    -- ============================================================
    
    -- 6.1 0034 object-by-object consistency
  ),

  f40_s40_check40 as (
    with objs as (
      select 'public.posts.moderation_status (column)'::text as obj,
        case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='posts' and column_name='moderation_status') then 'PASS' else 'FAIL' end as st,
        case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='posts' and column_name='moderation_status') then 'Column exists.' else 'Missing column defined by 0034.' end as expl
      union all
      select 'public.posts.moderated_at (column)',
        case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='posts' and column_name='moderated_at') then 'PASS' else 'FAIL' end,
        case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='posts' and column_name='moderated_at') then 'Column exists.' else 'Missing column defined by 0034.' end
      union all
      select 'public.posts.moderated_by (column)',
        case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='posts' and column_name='moderated_by') then 'PASS' else 'FAIL' end,
        case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='posts' and column_name='moderated_by') then 'Column exists.' else 'Missing column defined by 0034.' end
      union all
      select 'public.posts.moderation_reason (column)',
        case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='posts' and column_name='moderation_reason') then 'PASS' else 'FAIL' end,
        case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='posts' and column_name='moderation_reason') then 'Column exists.' else 'Missing column defined by 0034.' end
      union all
      select 'public.replies.moderation_status (column)',
        case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='replies' and column_name='moderation_status') then 'PASS' else 'FAIL' end,
        case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='replies' and column_name='moderation_status') then 'Column exists.' else 'Missing column defined by 0034.' end
      union all
      select 'public.replies.moderated_at (column)',
        case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='replies' and column_name='moderated_at') then 'PASS' else 'FAIL' end,
        case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='replies' and column_name='moderated_at') then 'Column exists.' else 'Missing column defined by 0034.' end
      union all
      select 'public.replies.moderated_by (column)',
        case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='replies' and column_name='moderated_by') then 'PASS' else 'FAIL' end,
        case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='replies' and column_name='moderated_by') then 'Column exists.' else 'Missing column defined by 0034.' end
      union all
      select 'public.replies.moderation_reason (column)',
        case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='replies' and column_name='moderation_reason') then 'PASS' else 'FAIL' end,
        case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='replies' and column_name='moderation_reason') then 'Column exists.' else 'Missing column defined by 0034.' end
      union all
      select 'public.posts [posts_moderation_status_idx] (index)',
        case when exists(select 1 from pg_indexes where schemaname='public' and tablename='posts' and indexname='posts_moderation_status_idx') then 'PASS' else 'FAIL' end,
        case when exists(select 1 from pg_indexes where schemaname='public' and tablename='posts' and indexname='posts_moderation_status_idx') then 'Index exists.' else 'Missing index defined by 0034.' end
      union all
      select 'public.replies [replies_moderation_status_idx] (index)',
        case when exists(select 1 from pg_indexes where schemaname='public' and tablename='replies' and indexname='replies_moderation_status_idx') then 'PASS' else 'FAIL' end,
        case when exists(select 1 from pg_indexes where schemaname='public' and tablename='replies' and indexname='replies_moderation_status_idx') then 'Index exists.' else 'Missing index defined by 0034.' end
      union all
      select 'public.posts.moderation_status CHECK (visible,removed)',
        case when exists (
          select 1 from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
          where con.contype='c' and n.nspname='public' and c.relname='posts'
            and pg_get_constraintdef(con.oid,true) ilike '%moderation_status%' and pg_get_constraintdef(con.oid,true) ilike '%visible%' and pg_get_constraintdef(con.oid,true) ilike '%removed%'
        ) then 'PASS' else 'FAIL' end,
        case when exists (
          select 1 from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
          where con.contype='c' and n.nspname='public' and c.relname='posts'
            and pg_get_constraintdef(con.oid,true) ilike '%moderation_status%' and pg_get_constraintdef(con.oid,true) ilike '%visible%' and pg_get_constraintdef(con.oid,true) ilike '%removed%'
        ) then 'CHECK constraint exists.' else 'Missing or mismatched CHECK constraint defined by 0034.' end
      union all
      select 'public.replies.moderation_status CHECK (visible,removed)',
        case when exists (
          select 1 from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
          where con.contype='c' and n.nspname='public' and c.relname='replies'
            and pg_get_constraintdef(con.oid,true) ilike '%moderation_status%' and pg_get_constraintdef(con.oid,true) ilike '%visible%' and pg_get_constraintdef(con.oid,true) ilike '%removed%'
        ) then 'PASS' else 'FAIL' end,
        case when exists (
          select 1 from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
          where con.contype='c' and n.nspname='public' and c.relname='replies'
            and pg_get_constraintdef(con.oid,true) ilike '%moderation_status%' and pg_get_constraintdef(con.oid,true) ilike '%visible%' and pg_get_constraintdef(con.oid,true) ilike '%removed%'
        ) then 'CHECK constraint exists.' else 'Missing or mismatched CHECK constraint defined by 0034.' end
      union all
      select 'public.posts.moderated_by FK -> public.profiles(id)',
        case when exists (
          select 1 from information_schema.table_constraints tc
          join information_schema.key_column_usage kcu on tc.constraint_name=kcu.constraint_name and tc.table_schema=kcu.table_schema
          join information_schema.constraint_column_usage ccu on ccu.constraint_name=tc.constraint_name and ccu.constraint_schema=tc.table_schema
          where tc.constraint_type='FOREIGN KEY' and tc.table_schema='public' and tc.table_name='posts'
            and kcu.column_name='moderated_by' and ccu.table_schema='public' and ccu.table_name='profiles' and ccu.column_name='id'
        ) then 'PASS' else 'FAIL' end,
        case when exists (
          select 1 from information_schema.table_constraints tc
          join information_schema.key_column_usage kcu on tc.constraint_name=kcu.constraint_name and tc.table_schema=kcu.table_schema
          join information_schema.constraint_column_usage ccu on ccu.constraint_name=tc.constraint_name and ccu.constraint_schema=tc.table_schema
          where tc.constraint_type='FOREIGN KEY' and tc.table_schema='public' and tc.table_name='posts'
            and kcu.column_name='moderated_by' and ccu.table_schema='public' and ccu.table_name='profiles' and ccu.column_name='id'
        ) then 'FK exists.' else 'Missing or incorrect FK defined by 0034.' end
      union all
      select 'public.replies.moderated_by FK -> public.profiles(id)',
        case when exists (
          select 1 from information_schema.table_constraints tc
          join information_schema.key_column_usage kcu on tc.constraint_name=kcu.constraint_name and tc.table_schema=kcu.table_schema
          join information_schema.constraint_column_usage ccu on ccu.constraint_name=tc.constraint_name and ccu.constraint_schema=tc.table_schema
          where tc.constraint_type='FOREIGN KEY' and tc.table_schema='public' and tc.table_name='replies'
            and kcu.column_name='moderated_by' and ccu.table_schema='public' and ccu.table_name='profiles' and ccu.column_name='id'
        ) then 'PASS' else 'FAIL' end,
        case when exists (
          select 1 from information_schema.table_constraints tc
          join information_schema.key_column_usage kcu on tc.constraint_name=kcu.constraint_name and tc.table_schema=kcu.table_schema
          join information_schema.constraint_column_usage ccu on ccu.constraint_name=tc.constraint_name and ccu.constraint_schema=tc.table_schema
          where tc.constraint_type='FOREIGN KEY' and tc.table_schema='public' and tc.table_name='replies'
            and kcu.column_name='moderated_by' and ccu.table_schema='public' and ccu.table_name='profiles' and ccu.column_name='id'
        ) then 'FK exists.' else 'Missing or incorrect FK defined by 0034.' end
    )
  ),

  f41_06_migration_consistency_0034_object_consistency as (
    select
      '06_migration_consistency'::text as section,
      '0034_object_consistency'::text as check_name,
      obj::text as object_name,
      st::text as status,
      expl::text as explanation,
      jsonb_build_object('migration', '0034_moderation_content_status.sql') as details
    from objs
    order by st desc, obj;
    
    -- 6.2 0034 overall consistency summary
  ),

  f42_s42_check42 as (
    with objs as (
      select case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='posts' and column_name='moderation_status') then 1 else 0 end ok
      union all select case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='posts' and column_name='moderated_at') then 1 else 0 end
      union all select case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='posts' and column_name='moderated_by') then 1 else 0 end
      union all select case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='posts' and column_name='moderation_reason') then 1 else 0 end
      union all select case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='replies' and column_name='moderation_status') then 1 else 0 end
      union all select case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='replies' and column_name='moderated_at') then 1 else 0 end
      union all select case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='replies' and column_name='moderated_by') then 1 else 0 end
      union all select case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='replies' and column_name='moderation_reason') then 1 else 0 end
      union all select case when exists(select 1 from pg_indexes where schemaname='public' and tablename='posts' and indexname='posts_moderation_status_idx') then 1 else 0 end
      union all select case when exists(select 1 from pg_indexes where schemaname='public' and tablename='replies' and indexname='replies_moderation_status_idx') then 1 else 0 end
      union all select case when exists (
          select 1 from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
          where con.contype='c' and n.nspname='public' and c.relname='posts'
            and pg_get_constraintdef(con.oid,true) ilike '%moderation_status%' and pg_get_constraintdef(con.oid,true) ilike '%visible%' and pg_get_constraintdef(con.oid,true) ilike '%removed%'
        ) then 1 else 0 end
      union all select case when exists (
          select 1 from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
          where con.contype='c' and n.nspname='public' and c.relname='replies'
            and pg_get_constraintdef(con.oid,true) ilike '%moderation_status%' and pg_get_constraintdef(con.oid,true) ilike '%visible%' and pg_get_constraintdef(con.oid,true) ilike '%removed%'
        ) then 1 else 0 end
      union all select case when exists (
          select 1 from information_schema.table_constraints tc
          join information_schema.key_column_usage kcu on tc.constraint_name=kcu.constraint_name and tc.table_schema=kcu.table_schema
          join information_schema.constraint_column_usage ccu on ccu.constraint_name=tc.constraint_name and ccu.constraint_schema=tc.table_schema
          where tc.constraint_type='FOREIGN KEY' and tc.table_schema='public' and tc.table_name='posts'
            and kcu.column_name='moderated_by' and ccu.table_schema='public' and ccu.table_name='profiles' and ccu.column_name='id'
        ) then 1 else 0 end
      union all select case when exists (
          select 1 from information_schema.table_constraints tc
          join information_schema.key_column_usage kcu on tc.constraint_name=kcu.constraint_name and tc.table_schema=kcu.table_schema
          join information_schema.constraint_column_usage ccu on ccu.constraint_name=tc.constraint_name and ccu.constraint_schema=tc.table_schema
          where tc.constraint_type='FOREIGN KEY' and tc.table_schema='public' and tc.table_name='replies'
            and kcu.column_name='moderated_by' and ccu.table_schema='public' and ccu.table_name='profiles' and ccu.column_name='id'
        ) then 1 else 0 end
    ),
    agg as (
      select sum(ok)::int as pass_count, count(*)::int as total_count, (count(*) - sum(ok))::int as fail_count from objs
    )
  ),

  f43_06_migration_consistency_0034_consistency_summary as (
    select
      '06_migration_consistency'::text as section,
      '0034_consistency_summary'::text as check_name,
      '0034_moderation_content_status.sql'::text as object_name,
      case
        when fail_count = 0 then 'PASS'
        when fail_count > 0 and pass_count > 0 then 'WARNING'
        else 'FAIL'
      end as status,
      case
        when fail_count = 0 then 'All checked 0034-defined objects are present (columns, indexes, moderation CHECKs, moderated_by FKs). Review history/definitions as needed.'
        when fail_count > 0 and pass_count > 0 then 'Partially applied or schema drift detected for 0034: some expected objects present, others missing. Inspect object-by-object findings.'
        else '0034-defined objects not detected; migration likely unapplied in this database.'
      end as explanation,
      jsonb_build_object('pass', pass_count, 'fail', fail_count, 'total_checked', total_count) as details
    from agg;
    
    -- 6.3 follows.created_at consistency (known drift point)
  ),

  f44_06_migration_consistency_follows_schema_drift as (
    select
      '06_migration_consistency'::text as section,
      'follows_schema_drift'::text as check_name,
      'public.follows.created_at'::text as object_name,
      case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='follows' and column_name='created_at') then 'PASS' else 'WARNING' end as status,
      case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='follows' and column_name='created_at')
           then 'follows.created_at exists. If unintended by migrations, treat as schema drift; if required, ensure migrations/types aligned.'
           else 'follows.created_at absent (consistent with known base/21B migrations). Any runtime query selecting/ordering by it indicates app/deploy drift, not DB schema.' end as explanation,
      jsonb_build_object(
        'column_exists', exists(select 1 from information_schema.columns where table_schema='public' and table_name='follows' and column_name='created_at'),
        'follows_columns', (select coalesce(jsonb_agg(column_name order by ordinal_position), '[]'::jsonb) from information_schema.columns where table_schema='public' and table_name='follows')
      ) as details
    
    -- END OF AUDIT
  ),

  f45_99_complete_audit_complete as (
    select
      '99_complete'::text as section,
      'audit_complete'::text as check_name,
      'AFTERFUR_FULL_DATABASE_AUDIT.sql'::text as object_name,
      'PASS'::text as status,
      'Audit script completed. Review all sections (00-06) for PASS/WARNING/FAIL/UNKNOWN findings before taking action.'::text as explanation,
      jsonb_build_object('completed_at_utc', now()) as details
  ),

  audit_findings as (
  select * from f00_00_meta_audit_execution
  union all
  select * from f01_04_expected_repo_migration_files
  union all
  select * from f03_04_migration_integrity_numeric_sequence_gap
  union all
  select * from f04_01_structure_schema
  union all
  select * from f05_01_structure_table_or_view_object
  union all
  select * from f06_01_structure_column
  union all
  select * from f07_01_structure_primary_key
  union all
  select * from f08_01_structure_table_without_primary_key
  union all
  select * from f09_01_structure_foreign_key
  union all
  select * from f10_01_structure_unique_constraint
  union all
  select * from f11_01_structure_check_constraint
  union all
  select * from f12_01_structure_index
  union all
  select * from f13_02_security_rls_status
  union all
  select * from f14_02_security_rls_policy
  union all
  select * from f15_02_security_rls_enabled_no_policies
  union all
  select * from f16_02_security_table_grant
  union all
  select * from f17_02_security_function_routine
  union all
  select * from f18_02_security_function_execute_privilege
  union all
  select * from f19_03_automation_trigger
  union all
  select * from f20_03_automation_trigger_function_binding
  union all
  select * from f21_03_automation_view
  union all
  select * from f22_03_automation_materialized_view
  union all
  select * from f23_03_automation_sequence
  union all
  select * from f24_03_automation_extension
  union all
  select * from f25_04_migration_integrity_migration_history_availability
  union all
  select * from f26_04_migration_integrity_recorded_migrations_listing
  union all
  select * from f27_s27_check27
  union all
  select * from f28_s28_check28
  union all
  select * from f29_s29_check29
  union all
  select * from f30_04_migration_integrity_migration_evidence_clarification
  union all
  select * from f31_05_known_issues_follows_created_at_exists
  union all
  select * from f32_05_known_issues_posts_moderation_column
  union all
  select * from f33_05_known_issues_replies_moderation_column
  union all
  select * from f34_05_known_issues_moderation_index
  union all
  select * from f35_s35_check35
  union all
  select * from f36_05_known_issues_moderation_status_check
  union all
  select * from f37_s37_check37
  union all
  select * from f38_05_known_issues_moderated_by_foreign_key
  union all
  select * from f39_05_known_issues_classification_separate_from_moderation_
  union all
  select * from f40_s40_check40
  union all
  select * from f41_06_migration_consistency_0034_object_consistency
  union all
  select * from f42_s42_check42
  union all
  select * from f43_06_migration_consistency_0034_consistency_summary
  union all
  select * from f44_06_migration_consistency_follows_schema_drift
  union all
  select * from f45_99_complete_audit_complete
  )
select
  section,
  check_name,
  object_name,
  status,
  explanation,
  details
from audit_findings
order by
  section,
  case status
    when 'FAIL' then 1
    when 'WARNING' then 2
    when 'UNKNOWN' then 3
    when 'PASS' then 4
    else 5
  end,
  check_name,
  object_name;
 