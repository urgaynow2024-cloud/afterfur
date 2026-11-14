-- 0059_moderator_report_notifications.sql
-- Moderator Notifications - New Report Alerts
--
-- Reuses the existing public.notifications table and the existing
-- user_ui_preferences notification settings (notifications.moderation_alerts).
--
-- Design:
--   * AFTER INSERT on reports  -> notify every currently authorised moderator
--     (except the reporter and the reported user/author) once per report.
--   * AFTER UPDATE OF assigned_to on reports -> notify only the newly assigned
--     moderator when the assignee actually changes to a non-null moderator.
--   * Notification failures are caught and logged; they never roll back the
--     report insert/update.
--   * Recipients are read from moderator_roles at notification time, so users
--     whose moderator permissions were removed receive no new alerts.
--   * Payloads contain only safe metadata (reason, target type, report id,
--     link). Reporter identity, reporter explanation, report notes and reported
--     content are never included.
--
-- Forward-only and idempotent. Not applied automatically to production.

-- ---------------------------------------------------------------------------
-- 1. Idempotency: one new-report alert per moderator per report.
-- ---------------------------------------------------------------------------
create unique index if not exists notifications_moderation_report_unique
  on public.notifications (user_id, (payload->>'report_id'))
  where type = 'moderation_report';

-- ---------------------------------------------------------------------------
-- 2. New report alerts
-- ---------------------------------------------------------------------------
create or replace function public.notify_moderators_new_report()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_reason_label text;
  v_target_label text;
  v_summary text;
  v_href text;
  v_reported_user uuid;
  v_enabled boolean;
  m record;
begin
  begin
    v_reason_label := case NEW.reason
      when 'harassment' then 'harassment or bullying'
      when 'hate_speech' then 'hate or discriminatory abuse'
      when 'threats_violence' then 'threats or violence'
      when 'sexual_content' then 'sexual or adult content'
      when 'illegal_exploitation' then 'suspected illegal content or exploitation'
      when 'spam_scam_impersonation' then 'spam, scams or impersonation'
      when 'copyright' then 'copyright concerns'
      when 'privacy_doxxing' then 'privacy violations or doxxing'
      else coalesce(NEW.reason, 'other')
    end;

    v_target_label := case NEW.target_type
      when 'post' then 'post'
      when 'reply' then 'reply'
      when 'user' then 'account'
      else coalesce(NEW.target_type, 'item')
    end;

    v_summary := case when v_target_label = 'account' then 'An ' else 'A ' end
      || v_target_label || ' was reported for ' || v_reason_label || '.';
    v_href := '/moderator/reports?report=' || NEW.id;

    -- Resolve the reported user (author for content reports) so they are never
    -- notified about their own content.
    if NEW.target_type = 'post' then
      select author_id into v_reported_user from public.posts where id = NEW.target_id;
    elsif NEW.target_type = 'reply' then
      select author_id into v_reported_user from public.replies where id = NEW.target_id;
    else
      v_reported_user := NEW.target_id;
    end if;

    for m in
      select mr.user_id
      from public.moderator_roles mr
      where mr.user_id <> NEW.reporter_id
        and (v_reported_user is null or mr.user_id <> v_reported_user)
    loop
      -- Moderation Alerts preference; enabled by default when unset.
      select coalesce((u.preferences->'notifications'->>'moderation_alerts')::boolean, true)
        into v_enabled
        from public.user_ui_preferences u
        where u.user_id = m.user_id;
      if v_enabled is null then
        v_enabled := true;
      end if;
      if not v_enabled then
        continue;
      end if;

      if exists (
        select 1 from public.notifications n
        where n.user_id = m.user_id
          and n.type = 'moderation_report'
          and n.payload->>'report_id' = NEW.id::text
      ) then
        continue;
      end if;

      insert into public.notifications (user_id, type, payload, read)
      values (
        m.user_id,
        'moderation_report',
        jsonb_build_object(
          'title', 'New report received',
          'report_id', NEW.id,
          'reason', NEW.reason,
          'reason_label', v_reason_label,
          'target_type', NEW.target_type,
          'summary', v_summary,
          'href', v_href
        ),
        false
      )
      on conflict (user_id, (payload->>'report_id')) where type = 'moderation_report' do nothing;
    end loop;
  exception when others then
    -- Notification delivery must never block report submission.
    raise log 'moderator new-report notification failed: %', sqlerrm;
  end;
  return NEW;
end;
$$;

drop trigger if exists reports_notify_moderators on public.reports;
create trigger reports_notify_moderators
  after insert on public.reports
  for each row execute function public.notify_moderators_new_report();

-- ---------------------------------------------------------------------------
-- 3. Assignment alerts
-- ---------------------------------------------------------------------------
create or replace function public.notify_moderator_report_assignment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_reason_label text;
  v_target_label text;
  v_summary text;
  v_href text;
  v_reported_user uuid;
  v_enabled boolean;
  v_is_moderator boolean;
begin
  begin
    -- No alert when unassigned or when the assignee did not actually change.
    if NEW.assigned_to is null or NEW.assigned_to = OLD.assigned_to then
      return NEW;
    end if;

    -- Only notify a user who is still an authorised moderator.
    select exists (
      select 1 from public.moderator_roles mr where mr.user_id = NEW.assigned_to
    ) into v_is_moderator;
    if not v_is_moderator then
      return NEW;
    end if;

    -- Never notify the reporter or the reported user.
    if NEW.assigned_to = NEW.reporter_id then
      return NEW;
    end if;
    if NEW.target_type = 'post' then
      select author_id into v_reported_user from public.posts where id = NEW.target_id;
    elsif NEW.target_type = 'reply' then
      select author_id into v_reported_user from public.replies where id = NEW.target_id;
    else
      v_reported_user := NEW.target_id;
    end if;
    if v_reported_user is not null and NEW.assigned_to = v_reported_user then
      return NEW;
    end if;

    select coalesce((u.preferences->'notifications'->>'moderation_alerts')::boolean, true)
      into v_enabled
      from public.user_ui_preferences u
      where u.user_id = NEW.assigned_to;
    if v_enabled is null then
      v_enabled := true;
    end if;
    if not v_enabled then
      return NEW;
    end if;

    v_reason_label := case NEW.reason
      when 'harassment' then 'harassment or bullying'
      when 'hate_speech' then 'hate or discriminatory abuse'
      when 'threats_violence' then 'threats or violence'
      when 'sexual_content' then 'sexual or adult content'
      when 'illegal_exploitation' then 'suspected illegal content or exploitation'
      when 'spam_scam_impersonation' then 'spam, scams or impersonation'
      when 'copyright' then 'copyright concerns'
      when 'privacy_doxxing' then 'privacy violations or doxxing'
      else coalesce(NEW.reason, 'other')
    end;

    v_target_label := case NEW.target_type
      when 'post' then 'post'
      when 'reply' then 'reply'
      when 'user' then 'account'
      else coalesce(NEW.target_type, 'item')
    end;

    v_summary := case when v_target_label = 'account' then 'An account' else 'A ' || v_target_label end
      || ' report was assigned to you.';
    v_href := '/moderator/reports?report=' || NEW.id;

    insert into public.notifications (user_id, type, payload, read)
    values (
      NEW.assigned_to,
      'moderation_assignment',
      jsonb_build_object(
        'title', 'Report assigned to you',
        'report_id', NEW.id,
        'reason', NEW.reason,
        'reason_label', v_reason_label,
        'target_type', NEW.target_type,
        'summary', v_summary,
        'href', v_href
      ),
      false
    );
  exception when others then
    -- Assignment must succeed even if the alert cannot be delivered.
    raise log 'moderator assignment notification failed: %', sqlerrm;
  end;
  return NEW;
end;
$$;

drop trigger if exists reports_notify_moderator_assignment on public.reports;
create trigger reports_notify_moderator_assignment
  after update of assigned_to on public.reports
  for each row execute function public.notify_moderator_report_assignment();

-- ---------------------------------------------------------------------------
-- 4. Verification
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    where c.relname = 'reports'
      and t.tgname = 'reports_notify_moderators'
      and not t.tgisinternal
  ) then
    raise exception 'reports_notify_moderators trigger missing';
  end if;

  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    where c.relname = 'reports'
      and t.tgname = 'reports_notify_moderator_assignment'
      and not t.tgisinternal
  ) then
    raise exception 'reports_notify_moderator_assignment trigger missing';
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'notifications'
      and indexname = 'notifications_moderation_report_unique'
  ) then
    raise exception 'notifications_moderation_report_unique index missing';
  end if;

  raise notice 'Moderator report notifications verified';
end;
$$;