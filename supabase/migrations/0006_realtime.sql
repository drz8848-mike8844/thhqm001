-- ============================================================
-- 0006 Realtime：私信与通知
-- 客户端订阅需要表加入 realtime publication
-- ============================================================

do $$
begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null;
end $$;

-- Realtime 只会发送订阅者有权限读取的行；RLS 已覆盖
