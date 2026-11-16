# 旧数据迁移（Django SQLite → Supabase）

## 背景

旧论坛（仓库根目录的 Django 代码）的数据存在部署机器的 `db.sqlite3` 里，
本仓库不包含数据库文件。迁移分两步：先在旧机器上导出 JSON，再在新机器上导入 Supabase。

## 第一步：在旧机器上导出

在 Django 项目根目录（激活虚拟环境后）：

```bash
python manage.py dumpdata \
  --exclude contenttypes --exclude sessions --exclude admin \
  --exclude auth.permission --exclude auth.group \
  --indent 2 -o dump.json
```

> 如果 `db.sqlite3` 不在当前目录，先把 `settings.py` 里 DATABASES 指向的文件找齐再导出。

## 第二步：导入 Supabase

在任意能访问外网的机器上：

```bash
SUPABASE_URL=https://<项目ref>.supabase.co \
SUPABASE_SECRET_KEY=<service_role key（Supabase Dashboard → Settings → API）> \
node import_django_dump.mjs dump.json            # 正式导入

# 只看清单、不写库：
SUPABASE_URL=... SUPABASE_SECRET_KEY=... node import_django_dump.mjs dump.json --dry-run
```

依赖：Node 18+（只用内置 fetch，无需 npm install）。

## 迁移策略与已知限制

| 内容 | 处理方式 |
| --- | --- |
| 用户（auth.user） | 通过 Auth Admin API 重建，邮箱未验证状态改为已验证 |
| **密码** | Django 的 PBKDF2 哈希无法迁移 → 每人随机新密码，需用「忘记密码」重置 |
| 无邮箱用户 | 生成占位邮箱 `<username>@legacy.invalid`，此类用户需在个人设置里补邮箱 |
| 用户名 | 清洗为 `^[A-Za-z0-9_]{2,20}$`（中文/超长用户名会被替换为 `_`），冲突自动加后缀 |
| profile（昵称/简介） | 直接映射；经验值见下 |
| 帖子 | 标题/正文/时间/置顶/精华/封面映射；**浏览量** 从 0 开始（可接受） |
| 评论（含楼中楼） | 按 pk 顺序两轮插入，保证父评论先建 |
| 标签 | M2M 与独立表两种旧结构都支持；新标签表按名字唯一 |
| 点赞/收藏/关注 | 直插关联表，计数由触发器自动维护 |
| 举报 | 迁为 `resolved` 状态的历史记录 |
| 私信 | 按发/收双方自动建会话（get_or_create 语义） |
| **经验/等级** | 以旧 `experience` 为准：差额写入 `bonus_xp`，再 `recalc_profile_stats`，等级与旧站一致 |
| 旧通知 | 不迁移；导入期间触发器产生的互动通知会自动清理 |
| `/media/` 图片 | **不在范围内**。正文里的旧图片链接迁移后会 404，建议：把 media 目录手动上传到 Storage `post-images` 桶，再批量替换正文域名 |

## 导入后验证清单

1. Supabase Dashboard → Table Editor 抽查 posts / comments / profiles
2. 前端 `/_u/<某个用户名>` 看等级、发帖数是否合理
3. 抽一篇旧帖子核对正文与时间
4. 通知一位老用户走「忘记密码」流程，确认能登录发帖

## 重复导入

脚本不幂等（用户按邮箱去重，帖子会重复插入）。如需重跑，请先清库：
Supabase Dashboard → SQL Editor 依次执行
`truncate table public.notifications, public.messages, public.conversations, public.reports,
public.favorites, public.comment_likes, public.post_likes, public.follows, public.comments,
public.post_tags, public.post_images, public.posts, public.tags cascade;`
再删除 auth.users 里的导入用户，然后重新运行脚本。
