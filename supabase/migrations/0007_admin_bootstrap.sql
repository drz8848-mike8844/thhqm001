-- ============================================================
-- 0007 服务器端管理上下文放行
-- 问题：guard_profile_update 把「改角色/禁言」限制给了 staff，
--       导致初始 owner 只能用普通 SQL 提升时也被拦截。
-- 方案：无 JWT 的服务器端连接（迁移 / Management API / SQL 编辑器）
--       以及显式 service_role JWT 视为可信管理上下文，直接放行；
--       anon / authenticated 仍走原校验。
-- ============================================================

create or replace function public.is_admin_context()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select auth.uid() is null and (
    current_setting('request.jwt.claims', true) is null
    or current_setting('request.jwt.claims', true) like '%"role":"service_role"%'
  )
$$;

revoke all on function public.is_admin_context() from public, anon;
grant execute on function public.is_admin_context() to authenticated;

create or replace function public.guard_profile_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.is_admin_context() then
    return new;
  end if;

  if not public.is_staff(old.id) then
    new.role             := old.role;
    new.xp               := old.xp;
    new.bonus_xp         := old.bonus_xp;
    new.level            := old.level;
    new.is_muted         := old.is_muted;
    new.muted_until      := old.muted_until;
    new.posts_count      := old.posts_count;
    new.likes_received   := old.likes_received;
    new.comments_count   := old.comments_count;
    new.followers_count  := old.followers_count;
    new.following_count  := old.following_count;
  end if;

  if new.id <> old.id then
    raise exception 'profile id is immutable';
  end if;
  return new;
end $$;

create or replace function public.guard_post_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- 计数与作者永远由系统维护
  new.author_id       := old.author_id;
  new.views_count     := old.views_count;
  new.likes_count     := old.likes_count;
  new.favorites_count := old.favorites_count;
  new.comments_count  := old.comments_count;

  if public.is_admin_context() then
    return new;
  end if;

  if not public.is_staff() then
    new.is_pinned  := old.is_pinned;
    new.is_essence := old.is_essence;
  end if;
  return new;
end $$;
