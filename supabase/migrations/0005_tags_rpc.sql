-- ============================================================
-- 0005 标签写入 RPC
-- 客户端无法安全地 upsert tags（缺 update 策略），
-- 统一走 security definer，一次事务完成「建标签 + 重置关联」。
-- ============================================================

create or replace function public.set_post_tags(p_post_id uuid, p_tags text[])
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tag    text;
  v_tag_id uuid;
  v_count  integer := 0;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.posts
    where id = p_post_id and (author_id = auth.uid() or public.is_staff())
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  delete from public.post_tags where post_id = p_post_id;

  if p_tags is null then
    return;
  end if;

  foreach v_tag in array p_tags loop
    v_tag := btrim(v_tag);
    if v_tag is null or v_tag = '' then
      continue;
    end if;
    if char_length(v_tag) > 30 then
      v_tag := left(v_tag, 30);
    end if;

    v_count := v_count + 1;
    if v_count > 8 then
      exit;
    end if;

    insert into public.tags (name) values (v_tag)
    on conflict (name) do nothing;

    select id into v_tag_id from public.tags where name = v_tag;

    insert into public.post_tags (post_id, tag_id)
    values (p_post_id, v_tag_id)
    on conflict do nothing;
  end loop;
end $$;

revoke all on function public.set_post_tags(uuid, text[]) from public, anon;
grant execute on function public.set_post_tags(uuid, text[]) to authenticated;
