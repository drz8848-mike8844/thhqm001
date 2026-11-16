-- ============================================================
-- 0008 service_role 补充授权
-- 数据迁移 / 服务器端维护脚本用 service key 调 recalc 时需要 EXECUTE
-- （0004 已把默认 EXECUTE 全部收回）
-- ============================================================

grant execute on function public.recalc_profile_stats(uuid) to service_role;
