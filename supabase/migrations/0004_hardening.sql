-- ============================================================
-- 0004 加固：函数权限 / 索引 / search_path / 策略合并
-- 依据 get_advisors 的 security + performance 报告
-- ============================================================

-- ---------- 1. 函数 EXECUTE 收口 ----------
-- 默认所有函数对 public 可执行；先全部收回，再按需显式授权
revoke execute on all functions in schema public from public, anon, authenticated;

-- RLS 策略内部会调用这些，必须允许查询方执行
grant execute on function public.is_staff(uuid)          to anon, authenticated;
grant execute on function public.is_owner(uuid)          to anon, authenticated;
grant execute on function public.can_post(uuid)          to anon, authenticated;
grant execute on function public.is_muted(uuid)          to anon, authenticated;
grant execute on function public.level_for_xp(integer)   to anon, authenticated;

-- 业务 RPC
grant execute on function public.toggle_post_like(uuid)            to authenticated;
grant execute on function public.toggle_comment_like(uuid)         to authenticated;
grant execute on function public.toggle_favorite(uuid)             to authenticated;
grant execute on function public.toggle_follow(uuid)               to authenticated;
grant execute on function public.get_or_create_conversation(uuid)  to authenticated;
grant execute on function public.mark_conversation_read(uuid)      to authenticated;
grant execute on function public.mark_all_notifications_read()     to authenticated;
grant execute on function public.soft_delete_post(uuid)            to authenticated;
grant execute on function public.soft_delete_comment(uuid)         to authenticated;
grant execute on function public.set_post_pinned(uuid, boolean)    to authenticated;
grant execute on function public.set_post_essence(uuid, boolean)   to authenticated;
grant execute on function public.set_user_role(uuid, public.user_role)      to authenticated;
grant execute on function public.set_user_muted(uuid, boolean, timestamptz) to authenticated;
grant execute on function public.resolve_report(uuid, public.report_status) to authenticated;
grant execute on function public.increment_post_views(uuid)        to anon, authenticated;
grant execute on function public.search_posts(text, integer, integer) to anon, authenticated;

-- ---------- 2. search_path 固化 ----------
create or replace function public.touch_updated_at()
returns trigger language plpgsql
set search_path = public, pg_temp as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace function public.level_for_xp(p_xp integer)
returns smallint language sql immutable
set search_path = '' as $$
  select (case
    when p_xp >= 7000 then 10
    when p_xp >= 4000 then 9
    when p_xp >= 2500 then 8
    when p_xp >= 1500 then 7
    when p_xp >= 1000 then 6
    when p_xp >=  600 then 5
    when p_xp >=  300 then 4
    when p_xp >=  150 then 3
    when p_xp >=   50 then 2
    else 1
  end)::smallint
$$;

-- ---------- 3. 外键覆盖索引 ----------
create index if not exists comment_likes_comment_idx on public.comment_likes (comment_id);
create index if not exists messages_sender_idx       on public.messages (sender_id);
create index if not exists notifications_actor_idx   on public.notifications (actor_id);
create index if not exists reports_comment_idx       on public.reports (comment_id);
create index if not exists reports_post_idx          on public.reports (post_id);
create index if not exists reports_reporter_idx      on public.reports (reporter_id);
create index if not exists reports_handled_by_idx    on public.reports (handled_by);

-- ---------- 4. 合并重复的 permissive 策略 ----------
drop policy if exists post_images_write on public.post_images;
create policy post_images_insert on public.post_images
  for insert to authenticated
  with check (exists (
    select 1 from public.posts p where p.id = post_id
      and (p.author_id = (select auth.uid()) or public.is_staff())
  ));
create policy post_images_update on public.post_images
  for update to authenticated
  using (exists (
    select 1 from public.posts p where p.id = post_id
      and (p.author_id = (select auth.uid()) or public.is_staff())
  ));
create policy post_images_delete on public.post_images
  for delete to authenticated
  using (exists (
    select 1 from public.posts p where p.id = post_id
      and (p.author_id = (select auth.uid()) or public.is_staff())
  ));

drop policy if exists post_tags_write on public.post_tags;
create policy post_tags_insert on public.post_tags
  for insert to authenticated
  with check (exists (
    select 1 from public.posts p where p.id = post_id
      and (p.author_id = (select auth.uid()) or public.is_staff())
  ));
create policy post_tags_delete on public.post_tags
  for delete to authenticated
  using (exists (
    select 1 from public.posts p where p.id = post_id
      and (p.author_id = (select auth.uid()) or public.is_staff())
  ));
