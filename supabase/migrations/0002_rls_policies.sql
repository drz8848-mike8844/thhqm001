-- ============================================================
-- 0002 RLS 策略 + 字段保护 + Storage
-- 原则：客户端只能改"属于自己且业务允许"的字段，
--       计数/经验/角色/置顶 等由触发器或 RPC 维护。
-- ============================================================

-- ---------- 辅助函数 ----------
create or replace function public.is_muted(p_uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((
    select is_muted and (muted_until is null or muted_until > now())
    from public.profiles where id = p_uid
  ), false)
$$;

create or replace function public.can_post(p_uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((
    select not (is_muted and (muted_until is null or muted_until > now()))
    from public.profiles where id = p_uid
  ), false)
$$;

-- ---------- 字段保护触发器 ----------
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
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

drop trigger if exists trg_profiles_guard on public.profiles;
create trigger trg_profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_update();

create or replace function public.guard_post_update()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- 计数与作者永远由系统维护
  new.author_id       := old.author_id;
  new.views_count     := old.views_count;
  new.likes_count     := old.likes_count;
  new.favorites_count := old.favorites_count;
  new.comments_count  := old.comments_count;

  if not public.is_staff() then
    new.is_pinned  := old.is_pinned;
    new.is_essence := old.is_essence;
  end if;
  return new;
end $$;

drop trigger if exists trg_posts_guard on public.posts;
create trigger trg_posts_guard before update on public.posts
  for each row execute function public.guard_post_update();

create or replace function public.guard_comment_update()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  new.post_id   := old.post_id;
  new.author_id := old.author_id;
  new.parent_id := old.parent_id;
  new.likes_count := old.likes_count;
  return new;
end $$;

drop trigger if exists trg_comments_guard on public.comments;
create trigger trg_comments_guard before update on public.comments
  for each row execute function public.guard_comment_update();

-- ---------- 开启 RLS ----------
alter table public.profiles       enable row level security;
alter table public.posts          enable row level security;
alter table public.post_images    enable row level security;
alter table public.tags           enable row level security;
alter table public.post_tags      enable row level security;
alter table public.comments       enable row level security;
alter table public.post_likes     enable row level security;
alter table public.comment_likes  enable row level security;
alter table public.favorites      enable row level security;
alter table public.follows        enable row level security;
alter table public.reports        enable row level security;
alter table public.conversations  enable row level security;
alter table public.messages       enable row level security;
alter table public.notifications  enable row level security;

-- ---------- profiles ----------
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles
  for select to anon, authenticated using (true);

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- ---------- posts ----------
drop policy if exists posts_read on public.posts;
create policy posts_read on public.posts
  for select to anon, authenticated
  using (deleted_at is null or author_id = auth.uid() or public.is_staff());

drop policy if exists posts_insert on public.posts;
create policy posts_insert on public.posts
  for insert to authenticated
  with check (author_id = auth.uid() and public.can_post());

drop policy if exists posts_update on public.posts;
create policy posts_update on public.posts
  for update to authenticated
  using (author_id = auth.uid() or public.is_staff())
  with check (author_id = auth.uid() or public.is_staff());

drop policy if exists posts_delete_staff on public.posts;
create policy posts_delete_staff on public.posts
  for delete to authenticated using (public.is_staff());

-- ---------- post_images ----------
drop policy if exists post_images_read on public.post_images;
create policy post_images_read on public.post_images
  for select to anon, authenticated using (true);

drop policy if exists post_images_write on public.post_images;
create policy post_images_write on public.post_images
  for all to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id and (p.author_id = auth.uid() or public.is_staff())))
  with check (exists (select 1 from public.posts p where p.id = post_id and (p.author_id = auth.uid() or public.is_staff())));

-- ---------- tags ----------
drop policy if exists tags_read on public.tags;
create policy tags_read on public.tags
  for select to anon, authenticated using (true);

drop policy if exists tags_insert on public.tags;
create policy tags_insert on public.tags
  for insert to authenticated with check (true);

drop policy if exists post_tags_read on public.post_tags;
create policy post_tags_read on public.post_tags
  for select to anon, authenticated using (true);

drop policy if exists post_tags_write on public.post_tags;
create policy post_tags_write on public.post_tags
  for all to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id and (p.author_id = auth.uid() or public.is_staff())))
  with check (exists (select 1 from public.posts p where p.id = post_id and (p.author_id = auth.uid() or public.is_staff())));

-- ---------- comments ----------
drop policy if exists comments_read on public.comments;
create policy comments_read on public.comments
  for select to anon, authenticated
  using (deleted_at is null or author_id = auth.uid() or public.is_staff());

drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments
  for insert to authenticated
  with check (author_id = auth.uid() and public.can_post());

drop policy if exists comments_update on public.comments;
create policy comments_update on public.comments
  for update to authenticated
  using (author_id = auth.uid() or public.is_staff())
  with check (author_id = auth.uid() or public.is_staff());

-- ---------- likes / favorites / follows ----------
drop policy if exists post_likes_read on public.post_likes;
create policy post_likes_read on public.post_likes
  for select to anon, authenticated using (true);

drop policy if exists post_likes_write on public.post_likes;
create policy post_likes_write on public.post_likes
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists post_likes_delete on public.post_likes;
create policy post_likes_delete on public.post_likes
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists comment_likes_read on public.comment_likes;
create policy comment_likes_read on public.comment_likes
  for select to anon, authenticated using (true);

drop policy if exists comment_likes_write on public.comment_likes;
create policy comment_likes_write on public.comment_likes
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists comment_likes_delete on public.comment_likes;
create policy comment_likes_delete on public.comment_likes
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists favorites_read on public.favorites;
create policy favorites_read on public.favorites
  for select to authenticated using (user_id = auth.uid() or public.is_staff());

drop policy if exists favorites_write on public.favorites;
create policy favorites_write on public.favorites
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists favorites_delete on public.favorites;
create policy favorites_delete on public.favorites
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists follows_read on public.follows;
create policy follows_read on public.follows
  for select to anon, authenticated using (true);

drop policy if exists follows_insert on public.follows;
create policy follows_insert on public.follows
  for insert to authenticated with check (follower_id = auth.uid());

drop policy if exists follows_delete on public.follows;
create policy follows_delete on public.follows
  for delete to authenticated using (follower_id = auth.uid());

-- ---------- reports ----------
drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports
  for insert to authenticated with check (reporter_id = auth.uid());

drop policy if exists reports_read on public.reports;
create policy reports_read on public.reports
  for select to authenticated using (reporter_id = auth.uid() or public.is_staff());

drop policy if exists reports_update on public.reports;
create policy reports_update on public.reports
  for update to authenticated using (public.is_staff()) with check (public.is_staff());

-- ---------- conversations / messages ----------
drop policy if exists conversations_read on public.conversations;
create policy conversations_read on public.conversations
  for select to authenticated
  using (participant_a = auth.uid() or participant_b = auth.uid());

drop policy if exists conversations_insert on public.conversations;
create policy conversations_insert on public.conversations
  for insert to authenticated
  with check (
    (participant_a = auth.uid() or participant_b = auth.uid())
    and participant_a <> participant_b
  );

drop policy if exists messages_read on public.messages;
create policy messages_read on public.messages
  for select to authenticated
  using (exists (
    select 1 from public.conversations c
    where c.id = conversation_id and (c.participant_a = auth.uid() or c.participant_b = auth.uid())
  ));

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and (c.participant_a = auth.uid() or c.participant_b = auth.uid())
    )
  );

drop policy if exists messages_update_read on public.messages;
create policy messages_update_read on public.messages
  for update to authenticated
  using (
    sender_id <> auth.uid()
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and (c.participant_a = auth.uid() or c.participant_b = auth.uid())
    )
  )
  with check (
    sender_id <> auth.uid()
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and (c.participant_a = auth.uid() or c.participant_b = auth.uid())
    )
  );

-- ---------- notifications ----------
drop policy if exists notifications_read on public.notifications;
create policy notifications_read on public.notifications
  for select to authenticated using (recipient_id = auth.uid());

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications
  for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

drop policy if exists notifications_delete on public.notifications;
create policy notifications_delete on public.notifications
  for delete to authenticated using (recipient_id = auth.uid());

-- ============================================================
-- Storage
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 2097152, array['image/jpeg','image/png','image/webp','image/gif']),
  ('post-images', 'post-images', true, 10485760, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 公开读
drop policy if exists storage_public_read on storage.objects;
create policy storage_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id in ('avatars', 'post-images'));

-- 只能写自己 uid 目录下的文件
drop policy if exists storage_own_insert on storage.objects;
create policy storage_own_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('avatars', 'post-images')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists storage_own_update on storage.objects;
create policy storage_own_update on storage.objects
  for update to authenticated
  using (
    bucket_id in ('avatars', 'post-images')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists storage_own_delete on storage.objects;
create policy storage_own_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('avatars', 'post-images')
    and (storage.foldername(name))[1] = auth.uid()::text
  );
