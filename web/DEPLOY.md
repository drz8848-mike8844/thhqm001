# 部署指南

## Vercel（推荐，当前方案）

### 一次性配置

1. 把本仓库推送到 GitHub（或 GitLab/Bitbucket）：
   ```bash
   git remote add github git@github.com:<你的用户名>/my_thhqm_001.git
   git push github feat/supabase-rewrite
   ```
2. 打开 https://vercel.com/new，选择刚推的仓库，Vercel 会自动识别 `web/` 子目录里的 `next.config.ts`
3. 在 **Environment Variables** 填两个值（Supabase Dashboard → Settings → API）：
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://ssyqvncljewjdbtaozsy.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = `sb_pub_...`（publishable 那把）
4. 点 **Deploy**，约 1 分钟后拿到 `https://xxx.vercel.app`

### 拿到域名后（重要）

回到 Supabase Dashboard → Authentication → URL Configuration：

- **Site URL**：`https://你的vercel域名`
- **Redirect URLs**：追加 `https://你的vercel域名/auth/callback`

然后发一封测试邮件验证 SMTP 通了没（Dashboard → Authentication → SMTP → Send Test Email）。

### 自定义域名（可选）

Vercel → 项目 → Settings → Domains → Add，按提示在 DNS 加一条 CNAME 即可，Vercel 自动签 HTTPS 证书。

---

## Cloudflare（备选，需全量 Workers 才能跑 SSR）

> 注意：Cloudflare **Pages** 只能传静态文件，跑不了 Next.js SSR。
> 要走 Cloudflare 必须用 **Workers**（非 Pages），且 token 需要 `Workers Scripts: Edit` 权限。

```bash
cd web
# wrangler.jsonc / worker.ts 已就位
# 构建并部署（产物在 dist/）
npx next build
rm -rf dist && mkdir dist
cp -r .next/standalone/* dist/
cp -r .next/static dist/.next/static 2>/dev/null || true
npx wrangler deploy
```

部署后同样要改 Supabase 的 Site URL / Redirect URLs。

---

## 通用检查清单

- [ ] Supabase Auth 的 Site URL 已改成线上域名
- [ ] Redirect URLs 包含 `<域名>/auth/callback`
- [ ] SMTP 测试邮件能收到
- [ ] 线上注册一个测试账号 → 能登录 → 能发帖
- [ ] 测试账号设为 owner 后，删掉 seed 测试账号（Dashboard → Authentication → Users）
