#!/usr/bin/env node
/**
 * 东方幻绮梦 · Django dumpdata → Supabase 导入脚本
 *
 * 用法：
 *   1) 在旧 Django 机器上导出数据（在项目根目录，激活虚拟环境后）：
 *      python manage.py dumpdata \\
 *        --exclude contenttypes --exclude sessions --exclude admin \\
 *        --exclude auth.permission --exclude auth.group \\
 *        --indent 2 -o dump.json
 *   2) 拷贝 dump.json 到本机，然后：
 *      SUPABASE_URL=https://xxx.supabase.co \\
 *      SUPABASE_SECRET_KEY=eyJ... \\
 *      node import_django_dump.mjs dump.json            # 正式导入
 *      node import_django_dump.mjs dump.json --dry-run  # 只打印清单，不写库
 *
 * 说明：
 *   - Django 的 PBKDF2 密码无法迁移到 Supabase Auth，
 *     每个用户会被赋予随机密码，需要用「忘记密码」邮件重置；
 *     没有邮箱的用户会生成占位邮箱 <username>@legacy.invalid。
 *   - /media/ 里的图片不在本脚本范围内：正文里的旧图片链接会 404，
 *     建议迁移后把 media 目录上传到 Storage 并在数据库里替换域名。
 *   - 旧的通知不迁移（触发器会按新规则重新生成互动通知）。
 *   - 经验值策略：以旧 experience 为准，差额写入 bonus_xp，
 *     再调用 recalc_profile_stats，使等级与旧站一致。
 */

import { readFileSync } from "node:fs";

const SUPABASE_URL = (process.env.SUPABASE_URL ?? "").replace(/\/+$/, "");
const SERVICE_KEY = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = process.argv.includes("--dry-run");
const file = process.argv[2];

if (!file || !SUPABASE_URL || !SERVICE_KEY) {
  console.error("用法: SUPABASE_URL=... SUPABASE_SECRET_KEY=... node import_django_dump.mjs dump.json [--dry-run]");
  process.exit(1);
}

const startedAt = new Date().toISOString();
const summary = { users: 0, profiles: 0, posts: 0, comments: 0, tags: 0, postTags: 0, likes: 0, favorites: 0, follows: 0, reports: 0, messages: 0 };
const warnings = [];
const skippedModels = new Map();

const userMap = new Map();      // django user pk -> uuid
const postMap = new Map();      // django post pk -> uuid
const commentMap = new Map();   // django comment pk -> uuid

function rest(path, options = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(options.headers ?? {}),
    },
  });
}

async function insertOne(table, row, query = "") {
  const res = await rest(`${table}?${query}`, {
    method: "POST",
    body: JSON.stringify(row),
    headers: { Prefer: "return=representation" },
  });
  if (!res.ok) {
    throw new Error(`insert ${table}: ${res.status} ${truncate(await res.text())}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data[0] : data;
}

async function selectOne(table, query) {
  const res = await rest(`${table}?${query}`);
  if (!res.ok) throw new Error(`select ${table}: ${res.status} ${truncate(await res.text())}`);
  const data = await res.json();
  return data[0] ?? null;
}

function truncate(text, max = 220) {
  return String(text).replace(/\s+/g, " ").slice(0, max);
}

function pick(fields, ...keys) {
  for (const key of keys) {
    if (fields[key] !== undefined && fields[key] !== null) return fields[key];
  }
  return undefined;
}

function iso(value) {
  if (!value) return undefined;
  return typeof value === "string" ? value : new Date(value).toISOString();
}

/** 老站用户名可能含中文/过长/为空，清洗到新站约束 ^[A-Za-z0-9_]{2,20}$ */
function sanitizeUsername(raw) {
  let name = String(raw ?? "")
    .replace(/[^A-Za-z0-9_]/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 20);
  while (name.length < 2) name = `_${name}`;
  if (!/[A-Za-z0-9]/.test(name)) name = `legacy_${Math.random().toString(36).slice(2, 8)}`;
  return name;
}

function randomPassword() {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#";
  return Array.from({ length: 20 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

// ---------------------------------------------------------------- load dump

const raw = JSON.parse(readFileSync(file, "utf8"));
const entries = Array.isArray(raw) ? raw : [raw];

const byModel = new Map();
for (const entry of entries) {
  const model = entry.model; // e.g. "accounts.userprofile"
  if (!byModel.has(model)) byModel.set(model, []);
  byModel.get(model).push(entry);
}

console.log("== dump 清单 ==");
for (const [model, list] of [...byModel.entries()].sort()) {
  console.log(`  ${model}: ${list.length}`);
}

// ------------------------------------------------------------ 1. users

const userModelNames = ["auth.user"];
const users = userModelNames.flatMap((name) => byModel.get(name) ?? []);
const takenUsernames = new Set();

for (const entry of users) {
  const f = entry.fields;
  const djangoPk = entry.pk;
  const rawUsername = f.username ?? `user${djangoPk}`;
  let username = sanitizeUsername(rawUsername);
  let suffix = 1;
  while (takenUsernames.has(username.toLowerCase())) {
    username = `${sanitizeUsername(rawUsername).slice(0, 16)}_${suffix++}`;
  }
  takenUsernames.add(username.toLowerCase());

  const email = (f.email ?? "").trim() || `${username}@legacy.invalid`;
  if (!f.email) warnings.push(`用户 ${username}（pk=${djangoPk}）没有邮箱，使用占位邮箱`);

  if (DRY_RUN) {
    userMap.set(djangoPk, `dry-${djangoPk}`);
    summary.users += 1;
    continue;
  }

  // 已存在（按邮箱找），否则创建
  let authUser = null;
  const found = await fetch(
    `${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(email.toLowerCase())}`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
  );
  if (found.ok) {
    const body = await found.json();
    authUser = (body.users ?? []).find((u) => (u.email ?? "").toLowerCase() === email.toLowerCase()) ?? null;
  }

  if (!authUser) {
    const created = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: "POST",
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password: randomPassword(),
        email_confirm: true,
        user_metadata: { username, nickname: username },
      }),
    });
    if (!created.ok) {
      warnings.push(`创建用户 ${username} 失败：${created.status} ${truncate(await created.text())}`);
      continue;
    }
    authUser = await created.json();
  }

  userMap.set(djangoPk, authUser.id);
  summary.users += 1;
}
console.log(`users: ${summary.users}（uuid 映射 ${userMap.size}）`);

// --------------------------------------------------------- 2. profiles

const profileModels = ["accounts.userprofile", "accounts.profile"];
const profiles = profileModels.flatMap((name) => byModel.get(name) ?? []);
// profile.user 可能是 pk 或 natural key 对象 {username}
const profileByUserPk = new Map();
for (const entry of profiles) {
  const ref = entry.fields.user;
  const pk = typeof ref === "object" && ref !== null ? ref.pk ?? null : ref;
  if (pk != null) profileByUserPk.set(pk, entry);
}

for (const [djangoPk, uuid] of userMap) {
  const p = profileByUserPk.get(djangoPk);
  if (!p) continue;
  summary.profiles += 1;
  if (DRY_RUN) continue;
  const f = p.fields;
  const nickname = (pick(f, "nickname", "nick") ?? "").toString().slice(0, 50) || null;
  const bio = (pick(f, "bio", "signature", "about") ?? "").toString().slice(0, 300) || null;
  const updates = {};
  if (nickname) updates.nickname = nickname;
  if (bio) updates.bio = bio;
  if (Object.keys(updates).length > 0) {
    const res = await rest(`profiles?id=eq.${uuid}`, { method: "PATCH", body: JSON.stringify(updates) });
    if (!res.ok) warnings.push(`更新 profile ${uuid}：${res.status} ${truncate(await res.text())}`);
  }
}

// ------------------------------------------------------------ 3. posts

const postModels = ["posts.post"];
const posts = postModels.flatMap((name) => byModel.get(name) ?? []);

for (const entry of posts) {
  const f = entry.fields;
  const authorPk = typeof f.author === "object" && f.author !== null ? f.author.pk : f.author;
  const authorUuid = userMap.get(authorPk);
  if (!authorUuid) { warnings.push(`帖子 pk=${entry.pk} 的作者(${authorPk})缺失，跳过`); continue; }

  const row = {
    author_id: authorUuid,
    title: String(f.title ?? "无标题").slice(0, 200),
    content: String(f.content ?? "（空）").slice(0, 100000),
  };
  const created = iso(pick(f, "created_at", "pub_date", "created"));
  const updated = iso(pick(f, "updated_at", "modified", "updated"));
  if (created) row.created_at = created;
  if (updated) row.updated_at = updated;
  const pinned = pick(f, "is_pinned", "pinned");
  const essence = pick(f, "is_essence", "essence", "highlight");
  if (typeof pinned === "boolean") row.is_pinned = pinned;
  if (typeof essence === "boolean") row.is_essence = essence;
  const cover = pick(f, "cover_image", "cover", "image");
  if (cover) row.cover_image_url = String(cover);

  if (DRY_RUN) { postMap.set(entry.pk, `dry-${entry.pk}`); summary.posts += 1; continue; }
  const inserted = await insertOne("posts", row, "select=id");
  postMap.set(entry.pk, inserted.id);
  summary.posts += 1;
}
console.log(`posts: ${summary.posts}`);

// --------------------------------------------------------- 4. comments

const commentModels = ["posts.comment"];
const comments = commentModels.flatMap((name) => byModel.get(name) ?? []);
comments.sort((a, b) => a.pk - b.pk);

for (const pass of [1, 2]) {
  for (const entry of comments) {
    if (pass === 2 && commentMap.has(entry.pk)) continue;
    const f = entry.fields;
    const postPk = typeof f.post === "object" && f.post !== null ? f.post.pk : f.post;
    const authorPk = typeof f.author === "object" && f.author !== null ? f.author.pk : f.author;
    const parentPk = f.parent != null ? (typeof f.parent === "object" ? f.parent.pk : f.parent) : null;
    const postUuid = postMap.get(postPk);
    const authorUuid = userMap.get(authorPk);
    const parentUuid = parentPk != null ? commentMap.get(parentPk) ?? null : null;
    if (!postUuid || !authorUuid) { if (pass === 2) warnings.push(`评论 pk=${entry.pk} 缺少帖子/作者，跳过`); continue; }
    if (pass === 1 && parentPk != null && !commentMap.has(parentPk)) continue; // 第二轮再插回复

    const row = { post_id: postUuid, author_id: authorUuid, content: String(f.content ?? f.body ?? "").slice(0, 5000) };
    if (!row.content) { if (pass === 2) warnings.push(`评论 pk=${entry.pk} 内容为空，跳过`); continue; }
    if (parentUuid) row.parent_id = parentUuid;
    const created = iso(pick(f, "created_at", "pub_date", "created"));
    if (created) row.created_at = created;

    if (DRY_RUN) { commentMap.set(entry.pk, `dry-${entry.pk}`); summary.comments += 1; continue; }
    const inserted = await insertOne("comments", row, "select=id");
    commentMap.set(entry.pk, inserted.id);
    summary.comments += 1;
  }
}
console.log(`comments: ${summary.comments}`);

// ------------------------------------------- 5. tags（含 posts 内嵌 M2M）

const tagModels = ["posts.tag"];
const tags = tagModels.flatMap((name) => byModel.get(name) ?? []);
const tagNameToId = new Map();

for (const entry of tags) {
  const name = String(pick(entry.fields, "name", "title") ?? "").slice(0, 30);
  if (!name) continue;
  if (DRY_RUN) { tagNameToId.set(name, "dry"); summary.tags += 1; continue; }
  let row = await selectOne("tags", `name=eq.${encodeURIComponent(name)}&select=id,name`);
  if (!row) row = await insertOne("tags", { name }, "on_conflict=name&select=id,name");
  tagNameToId.set(row.name.toLowerCase(), row.id);
  summary.tags += 1;
}

// M2M：post.tags / post.tags 字段里直接是 tag pk 数组
const explicitPostTagModels = ["posts.posttag", "posts.post_tags"];
const explicitLinks = explicitPostTagModels.flatMap((name) => byModel.get(name) ?? []);

async function linkTag(postUuid, tagId) {
  if (DRY_RUN) { summary.postTags += 1; return; }
  const res = await rest("post_tags", {
    method: "POST",
    body: JSON.stringify({ post_id: postUuid, tag_id: tagId }),
    headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
  });
  if (res.ok || res.status === 409) summary.postTags += 1;
}

for (const entry of posts) {
  const f = entry.fields;
  const tagPks = f.tags ?? f.tag ?? [];
  if (!Array.isArray(tagPks)) continue;
  const postUuid = postMap.get(entry.pk);
  if (!postUuid) continue;
  // 老库 tags 可能是"名字数组"（CharField 逗号分隔）或 M2M pk 数组
  for (const item of tagPks) {
    if (typeof item === "string" && !/^\d+$/.test(item)) {
      const name = item.slice(0, 30);
      let tagId = tagNameToId.get(name.toLowerCase());
      if (!tagId && !DRY_RUN) {
        const up = await rest("tags?on_conflict=name&select=id,name", {
          method: "POST",
          body: JSON.stringify({ name }),
          headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        });
        const upData = up.ok ? await up.json() : null;
        if (!upData || upData.length === 0) throw new Error(`tag upsert 失败: ${up.status} ${truncate(await up.text())}`);
        const row = upData[0];
        tagId = row.id; tagNameToId.set(row.name.toLowerCase(), row.id); summary.tags += 1;
      }
      if (tagId) await linkTag(postUuid, tagId);
    } else if (tags.length > 0) {
      const tagEntry = tags.find((t) => t.pk === item);
      if (tagEntry) {
        const name = String(pick(tagEntry.fields, "name", "title") ?? "").slice(0, 30);
        const tagId = tagNameToId.get(name.toLowerCase());
        if (tagId) await linkTag(postUuid, tagId);
      }
    }
  }
}

for (const entry of explicitLinks) {
  const f = entry.fields;
  const postUuid = postMap.get(typeof f.post === "object" ? f.post.pk : f.post);
  const tagEntry = tags.find((t) => t.pk === (typeof f.tag === "object" ? f.tag.pk : f.tag));
  if (!postUuid || !tagEntry) continue;
  const name = String(pick(tagEntry.fields, "name", "title") ?? "").slice(0, 30);
  const tagId = tagNameToId.get(name.toLowerCase());
  if (tagId) await linkTag(postUuid, tagId);
}
console.log(`tags: ${summary.tags}, post_tags: ${summary.postTags}`);

// -------------------------------------- 6. 点赞（posts 内嵌 M2M 或独立表）

for (const entry of posts) {
  const f = entry.fields;
  const likerPks = f.likes ?? f.liked_by ?? [];
  if (!Array.isArray(likerPks)) continue;
  const postUuid = postMap.get(entry.pk);
  if (!postUuid) continue;
  for (const userPk of likerPks) {
    const userUuid = userMap.get(typeof userPk === "object" ? userPk.pk : userPk);
    if (!userUuid) continue;
    if (DRY_RUN) { summary.likes += 1; continue; }
    const res = await rest("post_likes", {
      method: "POST",
      body: JSON.stringify({ user_id: userUuid, post_id: postUuid }),
      headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
    });
    if (res.ok || res.status === 409) summary.likes += 1;
  }
}

const likeModels = ["posts.postlike", "posts.like"];
for (const entry of likeModels.flatMap((name) => byModel.get(name) ?? [])) {
  const f = entry.fields;
  const userUuid = userMap.get(typeof f.user === "object" ? f.user.pk : f.user);
  const postUuid = postMap.get(typeof f.post === "object" ? f.post.pk : f.post);
  if (!userUuid || !postUuid) continue;
  if (DRY_RUN) { summary.likes += 1; continue; }
  const res = await rest("post_likes", {
    method: "POST",
    body: JSON.stringify({ user_id: userUuid, post_id: postUuid }),
    headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
  });
  if (res.ok || res.status === 409) summary.likes += 1;
}
console.log(`likes: ${summary.likes}`);

// ------------------------------------------------------- 7. favorites

const favModels = ["posts.favorite", "posts.favoritepost"];
for (const entry of favModels.flatMap((name) => byModel.get(name) ?? [])) {
  const f = entry.fields;
  const userUuid = userMap.get(typeof f.user === "object" ? f.user.pk : f.user);
  const postUuid = postMap.get(typeof f.post === "object" ? f.post.pk : f.post);
  if (!userUuid || !postUuid) continue;
  if (DRY_RUN) { summary.favorites += 1; continue; }
  const res = await rest("favorites", {
    method: "POST",
    body: JSON.stringify({ user_id: userUuid, post_id: postUuid }),
    headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
  });
  if (res.ok || res.status === 409) summary.favorites += 1;
}
console.log(`favorites: ${summary.favorites}`);

// ---------------------------------------------------------- 8. follows

const followModels = ["accounts.follow", "accounts.userfollow"];
for (const entry of followModels.flatMap((name) => byModel.get(name) ?? [])) {
  const f = entry.fields;
  const fromUuid = userMap.get(typeof pick(f, "follower", "from_user") === "object" ? pick(f, "follower", "from_user").pk : pick(f, "follower", "from_user"));
  const toUuid = userMap.get(typeof pick(f, "following", "to_user", "user") === "object" ? pick(f, "following", "to_user", "user").pk : pick(f, "following", "to_user", "user"));
  if (!fromUuid || !toUuid || fromUuid === toUuid) continue;
  if (DRY_RUN) { summary.follows += 1; continue; }
  const res = await rest("follows", {
    method: "POST",
    body: JSON.stringify({ follower_id: fromUuid, following_id: toUuid }),
    headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
  });
  if (res.ok || res.status === 409) summary.follows += 1;
}
// profile.following M2M 兜底
for (const [djangoPk, entry] of profileByUserPk) {
  const list = entry.fields.following ?? entry.fields.follows ?? [];
  if (!Array.isArray(list)) continue;
  const fromUuid = userMap.get(djangoPk);
  for (const item of list) {
    const toUuid = userMap.get(typeof item === "object" ? item.pk : item);
    if (!fromUuid || !toUuid || fromUuid === toUuid) continue;
    if (DRY_RUN) { summary.follows += 1; continue; }
    const res = await rest("follows", {
      method: "POST",
      body: JSON.stringify({ follower_id: fromUuid, following_id: toUuid }),
      headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
    });
    if (res.ok || res.status === 409) summary.follows += 1;
  }
}
console.log(`follows: ${summary.follows}`);

// ---------------------------------------------------------- 9. reports

const reasonLabels = ["spam", "abuse", "porn", "political", "other"];
const reportModels = ["posts.report", "accounts.report"];
for (const entry of reportModels.flatMap((name) => byModel.get(name) ?? [])) {
  const f = entry.fields;
  const reporterUuid = userMap.get(typeof f.reporter === "object" ? f.reporter.pk : f.reporter);
  const postUuid = f.post != null ? postMap.get(typeof f.post === "object" ? f.post.pk : f.post) : null;
  const commentUuid = f.comment != null ? commentMap.get(typeof f.comment === "object" ? f.comment.pk : f.comment) : null;
  if (!reporterUuid || (!postUuid && !commentUuid)) continue;

  let reason = f.reason;
  if (typeof reason === "number") reason = reasonLabels[reason] ?? "other";
  if (!reasonLabels.includes(reason)) reason = "other";

  const row = { reporter_id: reporterUuid, reason, status: "resolved" };
  if (postUuid) row.post_id = postUuid;
  if (commentUuid) row.comment_id = commentUuid;
  if (f.description || f.reason_text) row.description = String(f.description ?? f.reason_text).slice(0, 1000);
  if (DRY_RUN) { summary.reports += 1; continue; }
  await insertOne("reports", row);
  summary.reports += 1;
}
console.log(`reports: ${summary.reports}`);

// ---------------------------------------------------------- 10. messages

const messageModels = ["accounts.message", "posts.message", "messager.message"];
for (const entry of messageModels.flatMap((name) => byModel.get(name) ?? [])) {
  const f = entry.fields;
  const senderUuid = userMap.get(typeof f.sender === "object" ? f.sender.pk : f.sender);
  const receiverUuid = userMap.get(typeof pick(f, "receiver", "recipient") === "object" ? pick(f, "receiver", "recipient").pk : pick(f, "receiver", "recipient"));
  const content = String(pick(f, "content", "body", "text") ?? "").slice(0, 5000);
  if (!senderUuid || !receiverUuid || senderUuid === receiverUuid || !content) continue;
  if (DRY_RUN) { summary.messages += 1; continue; }
  // 会话
  const convRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_or_create_conversation`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_other: receiverUuid }),
  });
  // service_role 无 EXECUTE 权限时退化为直插 conversations
  let conversationId = null;
  if (convRes.ok) conversationId = await convRes.json();
  if (!conversationId) {
    const a = senderUuid < receiverUuid ? senderUuid : receiverUuid;
    const b = senderUuid < receiverUuid ? receiverUuid : senderUuid;
    let conv = await selectOne("conversations", `participant_a=eq.${a}&participant_b=eq.${b}&select=id`);
    if (!conv) conv = await insertOne("conversations", { participant_a: a, participant_b: b }, "select=id");
    conversationId = conv.id;
  }
  const msgRow = { conversation_id: conversationId, sender_id: senderUuid, content };
  const msgCreated = iso(pick(f, "created_at", "timestamp", "sent_at"));
  if (msgCreated) msgRow.created_at = msgCreated;
  await insertOne("messages", msgRow);
  summary.messages += 1;
}
console.log(`messages: ${summary.messages}`);

// ------------------------------------- 11. XP 校准（bonus_xp + recalc）

if (!DRY_RUN && summary.posts + summary.comments + summary.likes + summary.follows > 0) {
  console.log("校准经验值（bonus_xp）…");
  // 取回每个用户的实际计数与新 xp，与旧 experience 求差
  for (const [djangoPk, uuid] of userMap) {
    if (String(uuid).startsWith("dry-")) continue;
    const p = profileByUserPk.get(djangoPk);
    const oldXp = Number(p?.fields?.experience ?? p?.fields?.xp ?? 0);
    if (!oldXp) continue;
    const row = await selectOne("profiles", `id=eq.${uuid}&select=xp`);
    if (!row) continue;
    const bonus = Math.max(oldXp - row.xp, 0);
    if (bonus > 0) {
      const res = await rest(`profiles?id=eq.${uuid}`, {
        method: "PATCH",
        body: JSON.stringify({ bonus_xp: bonus }),
      });
      if (!res.ok) { warnings.push(`bonus_xp 更新失败 ${uuid}: ${res.status}`); continue; }
    }
    await fetch(`${SUPABASE_URL}/rest/v1/rpc/recalc_profile_stats`, {
      method: "POST",
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_uid: uuid }),
    });
  }
}

// -------------------------- 12. 清理导入期间触发器产生的互动通知噪音

if (!DRY_RUN && summary.posts + summary.comments + summary.likes + summary.follows > 0) {
  console.log("清理导入期间产生的互动通知…");
  const res = await rest(
    `notifications?created_at=gte.${encodeURIComponent(startedAt)}&type=in.("like","comment","reply","follow","message")`,
    { method: "DELETE", headers: { Prefer: "return=minimal" } },
  );
  if (!res.ok) warnings.push(`通知清理失败: ${res.status} ${truncate(await res.text())}`);
}

// ------------------------------------------------------------ 汇总

console.log("\n== 导入汇总 ==");
for (const [key, value] of Object.entries(summary)) console.log(`  ${key}: ${value}`);

const knownModels = new Set([
  ...["auth.user"],
  ...["accounts.userprofile", "accounts.profile"],
  ...["posts.post"],
  ...["posts.comment"],
  ...["posts.tag", "posts.posttag", "posts.post_tags"],
  ...["posts.postlike", "posts.like"],
  ...["posts.favorite", "posts.favoritepost"],
  ...["accounts.follow", "accounts.userfollow"],
  ...["posts.report", "accounts.report"],
  ...["accounts.message", "posts.message", "messager.message"],
]);
for (const [model, list] of byModel.entries()) {
  if (!knownModels.has(model) && list.length > 0) skippedModels.set(model, list.length);
}
if (skippedModels.size > 0) {
  console.log("\n未处理的旧模型（如有需要请手工映射）:");
  for (const [model, count] of skippedModels) console.log(`  ${model}: ${count}`);
}
if (warnings.length > 0) {
  console.log(`\n警告 ${warnings.length} 条:`);
  for (const warning of warnings.slice(0, 20)) console.log(`  - ${warning}`);
  if (warnings.length > 20) console.log(`  ... 其余 ${warnings.length - 20} 条省略`);
}
console.log("\n完成。提醒：所有用户密码已重置为随机值，请通过「忘记密码」邮件找回。");
