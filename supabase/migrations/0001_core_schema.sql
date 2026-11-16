-- ============================================================
-- 0001 core schema
-- 东方幻绮梦 · Supabase 原生重写
-- 依据旧 Django 模型 (accounts/posts) 一一对应重建
-- ============================================================

create extension if not exists pgcrypto;
create extension if not exists citext;
create extension if not exists pg_trgm;

-- ---------- enums ----------
do $$ begin
  create type public.user_role as enum ('user', 'mod', 'owner');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.notification_type as enum
    ('like', 'comment', 'reply', 'follow', 'message', 'mention', 'essence', 'system', 'moderation');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.report_reason as enum ('spam', 'abuse', 'porn', 'political', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.report_status as enum ('open', 'resolved', 'dismissed');
exception when duplicate_object then null; end $$;

-- ---------- helpers ----------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- 经验→等级（与旧 LEVEL_DEFINITIONS 完全一致）
create or replace function public.level_for_xp(p_xp integer)
returns smallint language sql immutable as $$
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

-- ---------- profiles ----------
create table if not exists public.profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  username         citext not null unique check (username ~ '^[A-Za-z0-9_]{2,20}$'),
  nickname         text check (char_length(nickname) <= 50),
  bio              text check (char_length(bio) <= 300),
  avatar_url       text,
  role             public.user_role not null default 'user',
  xp               integer not null default 0 check (xp >= 0),
  bonus_xp         integer not null default 0 check (bonus_xp >= 0),
  level            smallint not null default 1 check (level between 1 and 10),
  is_muted         boolean not null default false,
  muted_until      timestamptz,
  posts_count      integer not null default 0,
  likes_received   integer not null default 0,
  comments_count   integer not null default 0,
  followers_count  integer not null default 0,
  following_count  integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists profiles_username_trgm_idx
  on public.profiles using gin (username gin_trgm_ops);

drop trigger if exists trg_profiles_touch on public.profiles;
create trigger trg_profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- 角色判断（security definer，避免 RLS 递归）
create or replace function public.is_staff(p_uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select role in ('mod', 'owner') from public.profiles where id = p_uid), false)
$$;

create or replace function public.is_owner(p_uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select role = 'owner' from public.profiles where id = p_uid), false)
$$;

-- 注册后自动建 profile（username 冲突时自动加随机后缀）
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_username citext;
  v_nickname text;
  v_try integer := 0;
begin
  v_username := nullif(btrim(coalesce(new.raw_user_meta_data->>'username', '')), '')::citext;
  if v_username is null or v_username !~ '^[A-Za-z0-9_]{2,20}$' then
    v_username := ('user_' || substr(replace(new.id::text, '-', ''), 1, 8))::citext;
  end if;
  v_nickname := nullif(btrim(coalesce(new.raw_user_meta_data->>'nickname', '')), '');

  loop
    begin
      insert into public.profiles (id, username, nickname, avatar_url)
      values (
        new.id,
        v_username,
        coalesce(v_nickname, v_username::text),
        nullif(new.raw_user_meta_data->>'avatar_url', '')
      );
      exit;
    exception when unique_violation then
      v_try := v_try + 1;
      if v_try > 5 then
        v_username := ('user_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))::citext;
      else
        v_username := (left(v_username::text, 12) || '_' || v_try::text)::citext;
      end if;
    end;
  end loop;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- posts ----------
create table if not exists public.posts (
  id               uuid primary key default gen_random_uuid(),
  author_id        uuid not null references public.profiles(id) on delete cascade,
  title            text not null check (char_length(title) between 1 and 200),
  content          text not null check (char_length(content) between 1 and 100000),
  link             text,
  cover_image_url  text,
  is_pinned        boolean not null default false,
  is_essence       boolean not null default false,
  views_count      integer not null default 0,
  likes_count      integer not null default 0,
  favorites_count  integer not null default 0,
  comments_count   integer not null default 0,
  deleted_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists posts_created_idx on public.posts (created_at desc) where deleted_at is null;
create index if not exists posts_author_idx on public.posts (author_id, created_at desc);
create index if not exists posts_pinned_idx on public.posts (is_pinned desc, created_at desc) where deleted_at is null;
create index if not exists posts_title_trgm_idx on public.posts using gin (title gin_trgm_ops);
create index if not exists posts_content_trgm_idx on public.posts using gin (content gin_trgm_ops);

drop trigger if exists trg_posts_touch on public.posts;
create trigger trg_posts_touch before update on public.posts
  for each row execute function public.touch_updated_at();

create table if not exists public.post_images (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts(id) on delete cascade,
  url        text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists post_images_post_idx on public.post_images (post_id, sort_order);

-- ---------- tags ----------
create table if not exists public.tags (
  id         uuid primary key default gen_random_uuid(),
  name       citext not null unique check (char_length(name) between 1 and 30),
  created_at timestamptz not null default now()
);

create table if not exists public.post_tags (
  post_id uuid not null references public.posts(id) on delete cascade,
  tag_id  uuid not null references public.tags(id) on delete cascade,
  primary key (post_id, tag_id)
);
create index if not exists post_tags_tag_idx on public.post_tags (tag_id);

-- ---------- comments ----------
create table if not exists public.comments (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.posts(id) on delete cascade,
  author_id   uuid not null references public.profiles(id) on delete cascade,
  parent_id   uuid references public.comments(id) on delete cascade,
  content     text not null check (char_length(content) between 1 and 5000),
  likes_count integer not null default 0,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists comments_post_idx on public.comments (post_id, created_at) where deleted_at is null;
create index if not exists comments_parent_idx on public.comments (parent_id);
create index if not exists comments_author_idx on public.comments (author_id);

-- ---------- social ----------
create table if not exists public.post_likes (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  post_id    uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create index if not exists post_likes_post_idx on public.post_likes (post_id);

create table if not exists public.comment_likes (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  comment_id uuid not null references public.comments(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, comment_id)
);

create table if not exists public.favorites (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  post_id    uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create index if not exists favorites_post_idx on public.favorites (post_id);

create table if not exists public.follows (
  follower_id  uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);
create index if not exists follows_following_idx on public.follows (following_id);

create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  post_id     uuid references public.posts(id) on delete cascade,
  comment_id  uuid references public.comments(id) on delete cascade,
  reason      public.report_reason not null default 'other',
  description text check (char_length(description) <= 1000),
  status      public.report_status not null default 'open',
  handled_by  uuid references public.profiles(id) on delete set null,
  handled_at  timestamptz,
  created_at  timestamptz not null default now(),
  check (post_id is not null or comment_id is not null)
);
create index if not exists reports_status_idx on public.reports (status, created_at desc);

-- ---------- messaging ----------
create table if not exists public.conversations (
  id              uuid primary key default gen_random_uuid(),
  participant_a   uuid not null references public.profiles(id) on delete cascade,
  participant_b   uuid not null references public.profiles(id) on delete cascade,
  last_message_at timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  check (participant_a < participant_b),
  unique (participant_a, participant_b)
);
create index if not exists conversations_a_idx on public.conversations (participant_a, last_message_at desc);
create index if not exists conversations_b_idx on public.conversations (participant_b, last_message_at desc);

create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id       uuid not null references public.profiles(id) on delete cascade,
  content         text not null check (char_length(content) between 1 and 5000),
  is_read         boolean not null default false,
  created_at      timestamptz not null default now()
);
create index if not exists messages_conversation_idx on public.messages (conversation_id, created_at);
create index if not exists messages_unread_idx on public.messages (conversation_id) where is_read = false;

-- ---------- notifications ----------
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id    uuid references public.profiles(id) on delete set null,
  type        public.notification_type not null default 'system',
  verb        text not null,
  url         text,
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists notifications_recipient_idx
  on public.notifications (recipient_id, is_read, created_at desc);

-- ============================================================
-- 计数与经验：全部由触发器维护，客户端无法篡改
-- ============================================================

create or replace function public.recalc_profile_stats(p_uid uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_posts    integer;
  v_likes    integer;
  v_comments integer;
  v_followers integer;
  v_following integer;
  v_xp       integer;
begin
  select count(*) into v_posts    from public.posts      where author_id = p_uid and deleted_at is null;
  select count(*) into v_likes    from public.post_likes pl join public.posts p on p.id = pl.post_id where p.author_id = p_uid;
  select count(*) into v_comments from public.comments   where author_id = p_uid and deleted_at is null;
  select count(*) into v_followers from public.follows   where following_id = p_uid;
  select count(*) into v_following from public.follows   where follower_id = p_uid;

  v_xp := v_posts * 5 + v_likes * 2 + v_comments + v_followers * 3
          + coalesce((select bonus_xp from public.profiles where id = p_uid), 0);

  update public.profiles
     set posts_count     = v_posts,
         likes_received  = v_likes,
         comments_count  = v_comments,
         followers_count = v_followers,
         following_count = v_following,
         xp              = v_xp,
         level           = public.level_for_xp(v_xp),
         updated_at      = now()
   where id = p_uid;
end $$;

-- posts：作者统计 + 通知提及
create or replace function public.on_post_change()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    perform public.recalc_profile_stats(old.author_id);
    return old;
  end if;
  perform public.recalc_profile_stats(new.author_id);
  if tg_op = 'UPDATE' and old.author_id <> new.author_id then
    perform public.recalc_profile_stats(old.author_id);
  end if;
  return new;
end $$;

drop trigger if exists trg_posts_stats on public.posts;
create trigger trg_posts_stats after insert or update of deleted_at, author_id or delete on public.posts
  for each row execute function public.on_post_change();

create or replace function public.on_comment_change()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_author uuid;
begin
  if tg_op = 'DELETE' then
    v_author := old.author_id;
    update public.posts set comments_count = greatest(comments_count - 1, 0) where id = old.post_id;
    perform public.recalc_profile_stats(v_author);
    return old;
  end if;

  update public.posts set comments_count = comments_count + 1 where id = new.post_id;
  perform public.recalc_profile_stats(new.author_id);

  -- 通知：回复→父评论作者，否则→帖子作者；不通知自己
  if new.parent_id is not null then
    insert into public.notifications (recipient_id, actor_id, type, verb, url)
    select pc.author_id, new.author_id, 'reply',
           '回复了你的评论', '/posts/' || new.post_id::text
    from public.comments pc
    where pc.id = new.parent_id and pc.author_id <> new.author_id;
  else
    insert into public.notifications (recipient_id, actor_id, type, verb, url)
    select p.author_id, new.author_id, 'comment',
           '评论了你的帖子', '/posts/' || new.post_id::text
    from public.posts p
    where p.id = new.post_id and p.author_id <> new.author_id;
  end if;

  return new;
end $$;

drop trigger if exists trg_comments_count on public.comments;
create trigger trg_comments_count after insert or delete on public.comments
  for each row execute function public.on_comment_change();

create or replace function public.on_post_like_change()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_post_id uuid;
  v_author  uuid;
begin
  v_post_id := case when tg_op = 'DELETE' then old.post_id else new.post_id end;

  update public.posts
     set likes_count = greatest(likes_count + (case when tg_op = 'DELETE' then -1 else 1 end), 0)
   where id = v_post_id;

  select author_id into v_author from public.posts where id = v_post_id;
  perform public.recalc_profile_stats(v_author);

  if tg_op = 'INSERT' then
    insert into public.notifications (recipient_id, actor_id, type, verb, url)
    select p.author_id, new.user_id, 'like', '赞了你的帖子', '/posts/' || p.id::text
    from public.posts p
    where p.id = new.post_id and p.author_id <> new.user_id;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end $$;

drop trigger if exists trg_post_likes_count on public.post_likes;
create trigger trg_post_likes_count after insert or delete on public.post_likes
  for each row execute function public.on_post_like_change();

create or replace function public.on_favorite_change()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_post_id uuid;
begin
  v_post_id := case when tg_op = 'DELETE' then old.post_id else new.post_id end;
  update public.posts
     set favorites_count = greatest(favorites_count + (case when tg_op = 'DELETE' then -1 else 1 end), 0)
   where id = v_post_id;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

drop trigger if exists trg_favorites_count on public.favorites;
create trigger trg_favorites_count after insert or delete on public.favorites
  for each row execute function public.on_favorite_change();

create or replace function public.on_comment_like_change()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_comment_id uuid;
begin
  v_comment_id := case when tg_op = 'DELETE' then old.comment_id else new.comment_id end;
  update public.comments
     set likes_count = greatest(likes_count + (case when tg_op = 'DELETE' then -1 else 1 end), 0)
   where id = v_comment_id;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

drop trigger if exists trg_comment_likes_count on public.comment_likes;
create trigger trg_comment_likes_count after insert or delete on public.comment_likes
  for each row execute function public.on_comment_like_change();

create or replace function public.on_follow_change()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    perform public.recalc_profile_stats(old.follower_id);
    perform public.recalc_profile_stats(old.following_id);
    return old;
  end if;
  perform public.recalc_profile_stats(new.follower_id);
  perform public.recalc_profile_stats(new.following_id);
  insert into public.notifications (recipient_id, actor_id, type, verb, url)
  select new.following_id, new.follower_id, 'follow', '关注了你',
         '/u/' || p.username::text
  from public.profiles p where p.id = new.follower_id;
  return new;
end $$;

drop trigger if exists trg_follows_stats on public.follows;
create trigger trg_follows_stats after insert or delete on public.follows
  for each row execute function public.on_follow_change();

-- 私信：更新会话时间 + 通知
create or replace function public.on_message_insert()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_recipient uuid;
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;

  select case when participant_a = new.sender_id then participant_b else participant_a end
    into v_recipient
  from public.conversations where id = new.conversation_id;

  if v_recipient is not null then
    insert into public.notifications (recipient_id, actor_id, type, verb, url)
    values (v_recipient, new.sender_id, 'message', '给你发了一条私信',
            '/messages/' || new.conversation_id::text);
  end if;
  return new;
end $$;

drop trigger if exists trg_messages_meta on public.messages;
create trigger trg_messages_meta after insert on public.messages
  for each row execute function public.on_message_insert();

-- ---------- 热门视图（security_invoker 才会走 RLS） ----------
drop view if exists public.hot_posts;
create view public.hot_posts with (security_invoker = true) as
select
  p.*,
  (
    (p.likes_count * 3 + p.comments_count * 5 + p.views_count * 0.05) /
    power(extract(epoch from (now() - p.created_at)) / 3600.0 + 2.0, 1.5)
  )::numeric(12, 4) as hot_score
from public.posts p
where p.deleted_at is null
order by hot_score desc;
