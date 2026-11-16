-- ============================================================
-- 0003 RPC：原子操作 + 管理动作
-- security definer，内部自行校验身份，客户端无需多条语句
-- ============================================================

-- ---------- 点赞 / 收藏 / 关注 ----------
create or replace function public.toggle_post_like(p_post_id uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare v_exists boolean;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  delete from public.post_likes where user_id = auth.uid() and post_id = p_post_id
  returning true into v_exists;
  if coalesce(v_exists, false) then return false; end if;
  insert into public.post_likes (user_id, post_id) values (auth.uid(), p_post_id);
  return true;
end $$;

create or replace function public.toggle_comment_like(p_comment_id uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare v_exists boolean;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  delete from public.comment_likes where user_id = auth.uid() and comment_id = p_comment_id
  returning true into v_exists;
  if coalesce(v_exists, false) then return false; end if;
  insert into public.comment_likes (user_id, comment_id) values (auth.uid(), p_comment_id);
  return true;
end $$;

create or replace function public.toggle_favorite(p_post_id uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare v_exists boolean;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  delete from public.favorites where user_id = auth.uid() and post_id = p_post_id
  returning true into v_exists;
  if coalesce(v_exists, false) then return false; end if;
  insert into public.favorites (user_id, post_id) values (auth.uid(), p_post_id);
  return true;
end $$;

create or replace function public.toggle_follow(p_target uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare v_exists boolean;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  if p_target = auth.uid() then raise exception 'CANNOT_FOLLOW_SELF'; end if;
  delete from public.follows where follower_id = auth.uid() and following_id = p_target
  returning true into v_exists;
  if coalesce(v_exists, false) then return false; end if;
  insert into public.follows (follower_id, following_id) values (auth.uid(), p_target);
  return true;
end $$;

-- ---------- 浏览计数（匿名也可） ----------
create or replace function public.increment_post_views(p_post_id uuid)
returns void language sql security definer set search_path = public, pg_temp as $$
  update public.posts set views_count = views_count + 1
  where id = p_post_id and deleted_at is null;
$$;

-- ---------- 私信 ----------
create or replace function public.get_or_create_conversation(p_other uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_me uuid := auth.uid();
  v_a uuid;
  v_b uuid;
  v_id uuid;
begin
  if v_me is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  if p_other = v_me then raise exception 'CANNOT_MESSAGE_SELF'; end if;
  v_a := least(v_me, p_other);
  v_b := greatest(v_me, p_other);

  select id into v_id from public.conversations
  where participant_a = v_a and participant_b = v_b;

  if v_id is null then
    insert into public.conversations (participant_a, participant_b)
    values (v_a, v_b) returning id into v_id;
  end if;
  return v_id;
end $$;

create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  if not exists (
    select 1 from public.conversations
    where id = p_conversation_id and (participant_a = v_me or participant_b = v_me)
  ) then
    raise exception 'NOT_A_PARTICIPANT' using errcode = '42501';
  end if;
  update public.messages set is_read = true
  where conversation_id = p_conversation_id and sender_id <> v_me and is_read = false;
end $$;

create or replace function public.mark_all_notifications_read()
returns void language sql security definer set search_path = public, pg_temp as $$
  update public.notifications set is_read = true
  where recipient_id = auth.uid() and is_read = false;
$$;

-- ---------- 内容管理 ----------
create or replace function public.soft_delete_post(p_post_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists (
    select 1 from public.posts
    where id = p_post_id and (author_id = auth.uid() or public.is_staff())
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  update public.posts set deleted_at = now() where id = p_post_id and deleted_at is null;
end $$;

create or replace function public.soft_delete_comment(p_comment_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists (
    select 1 from public.comments
    where id = p_comment_id and (author_id = auth.uid() or public.is_staff())
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  update public.comments set deleted_at = now() where id = p_comment_id and deleted_at is null;
end $$;

create or replace function public.set_post_pinned(p_post_id uuid, p_pinned boolean)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_staff() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  update public.posts set is_pinned = p_pinned where id = p_post_id;
end $$;

create or replace function public.set_post_essence(p_post_id uuid, p_essence boolean)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_author uuid;
begin
  if not public.is_staff() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  update public.posts set is_essence = p_essence where id = p_post_id
  returning author_id into v_author;
  if v_author is not null then
    update public.profiles
       set bonus_xp = greatest(bonus_xp + (case when p_essence then 10 else -10 end), 0)
     where id = v_author;
    perform public.recalc_profile_stats(v_author);
  end if;
end $$;

create or replace function public.set_user_muted(p_user uuid, p_muted boolean, p_until timestamptz default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_staff() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if public.is_staff(p_user) and not public.is_owner() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  update public.profiles
     set is_muted = p_muted,
         muted_until = case when p_muted then p_until else null end
   where id = p_user;
end $$;

create or replace function public.set_user_role(p_user uuid, p_role public.user_role)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_owner() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  update public.profiles set role = p_role where id = p_user;
end $$;

create or replace function public.resolve_report(p_report_id uuid, p_status public.report_status)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_staff() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  update public.reports
     set status = p_status, handled_by = auth.uid(), handled_at = now()
   where id = p_report_id;
end $$;

-- ---------- 搜索（走 RLS） ----------
create or replace function public.search_posts(p_query text, p_limit integer default 20, p_offset integer default 0)
returns setof public.posts
language sql stable security invoker set search_path = public, pg_temp as $$
  select *
  from public.posts
  where deleted_at is null
    and (title ilike '%' || p_query || '%' or content ilike '%' || p_query || '%')
  order by created_at desc
  limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0);
$$;

-- ---------- 授权 ----------
revoke all on function public.set_user_role(uuid, public.user_role) from public;
revoke all on function public.set_user_muted(uuid, boolean, timestamptz) from public;
revoke all on function public.resolve_report(uuid, public.report_status) from public;

grant execute on function public.toggle_post_like(uuid)          to authenticated;
grant execute on function public.toggle_comment_like(uuid)       to authenticated;
grant execute on function public.toggle_favorite(uuid)           to authenticated;
grant execute on function public.toggle_follow(uuid)             to authenticated;
grant execute on function public.get_or_create_conversation(uuid) to authenticated;
grant execute on function public.mark_conversation_read(uuid)    to authenticated;
grant execute on function public.mark_all_notifications_read()   to authenticated;
grant execute on function public.soft_delete_post(uuid)          to authenticated;
grant execute on function public.soft_delete_comment(uuid)       to authenticated;
grant execute on function public.set_post_pinned(uuid, boolean)  to authenticated;
grant execute on function public.set_post_essence(uuid, boolean) to authenticated;
grant execute on function public.set_user_role(uuid, public.user_role)   to authenticated;
grant execute on function public.set_user_muted(uuid, boolean, timestamptz) to authenticated;
grant execute on function public.resolve_report(uuid, public.report_status) to authenticated;
grant execute on function public.increment_post_views(uuid)      to anon, authenticated;
grant execute on function public.search_posts(text, integer, integer) to anon, authenticated;
