import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  createSupabaseServerClient,
  getCurrentProfile,
} from "@/lib/supabase/server";
import { PostModerationControls } from "@/components/admin/PostModerationControls";
import { ReportActions } from "@/components/admin/ReportActions";
import { UserModerationControls } from "@/components/admin/UserModerationControls";
import { listPosts } from "@/lib/posts";
import { compactNumber, displayName, relativeTime } from "@/lib/format";

export const metadata: Metadata = { title: "管理后台" };

const REASON_LABEL: Record<string, string> = {
  spam: "垃圾广告",
  abuse: "人身攻击",
  porn: "色情低俗",
  political: "政治敏感",
  other: "其他",
};

type ReportRow = {
  id: string;
  reason: string;
  description: string | null;
  status: string;
  created_at: string;
  post_id: string | null;
  comment_id: string | null;
  post: { id: string; title: string } | null;
  comment: { id: string; content: string } | null;
  reporter: { username: string; nickname: string | null } | null;
};

type UserRow = {
  id: string;
  username: string;
  nickname: string | null;
  role: "user" | "mod" | "owner";
  is_muted: boolean;
  muted_until: string | null;
  level: number;
  posts_count: number;
  created_at: string;
};

export default async function AdminPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login?next=/admin");
  if (profile.role !== "mod" && profile.role !== "owner") notFound();

  const isOwner = profile.role === "owner";
  const supabase = await createSupabaseServerClient();

  const [reportsResult, { posts }, usersResult, statsResult] = await Promise.all([
    supabase
      .from("reports")
      .select(
        "id, reason, description, status, created_at, post_id, comment_id, post:posts!reports_post_id_fkey(id, title), comment:comments!reports_comment_id_fkey(id, content), reporter:profiles!reports_reporter_id_fkey(username, nickname)",
      )
      .order("created_at", { ascending: false })
      .limit(40),
    listPosts(supabase, { limit: 15 }),
    supabase
      .from("profiles")
      .select(
        "id, username, nickname, role, is_muted, muted_until, level, posts_count, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(20),
    Promise.all([
      supabase
        .from("reports")
        .select("id", { count: "exact", head: true })
        .eq("status", "open"),
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase
        .from("posts")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null),
    ]),
  ]);

  const [openCount, userCount, postCount] = statsResult;
  const reports = (reportsResult.data ?? []) as unknown as ReportRow[];
  const openReports = reports.filter((row) => row.status === "open");
  const handledReports = reports.filter((row) => row.status !== "open");
  const users = (usersResult.data ?? []) as unknown as UserRow[];

  return (
    <div className="admin-page">
      <div className="section-head">
        <h1>管理后台</h1>
        <span className="section-head__meta">
          {isOwner ? "站长" : "管理员"}视角
        </span>
      </div>

      <div className="admin-grid" aria-label="概览">
        <div className="admin-stat">
          <span className="admin-stat__value">
            {compactNumber(openCount.count ?? 0)}
          </span>
          <span className="admin-stat__label">待处理举报</span>
        </div>
        <div className="admin-stat">
          <span className="admin-stat__value">
            {compactNumber(postCount.count ?? 0)}
          </span>
          <span className="admin-stat__label">在库创作</span>
        </div>
        <div className="admin-stat">
          <span className="admin-stat__value">
            {compactNumber(userCount.count ?? 0)}
          </span>
          <span className="admin-stat__label">注册用户</span>
        </div>
      </div>

      <section aria-labelledby="reports-title">
        <div className="section-head">
          <h2 id="reports-title">举报处理</h2>
          <span className="section-head__meta">{openReports.length} 条待处理</span>
        </div>

        {reports.length === 0 ? (
          <p className="empty">还没有收到任何举报，一片祥和。</p>
        ) : (
          <>
            <ul className="admin-list">
              {openReports.map((report) => (
                <li key={report.id} className="admin-row">
                  <div className="admin-row__main">
                    <span className="admin-row__title">
                      <span className="badge badge--highlight">
                        {REASON_LABEL[report.reason] ?? report.reason}
                      </span>{" "}
                      {report.post
                        ? report.post.title
                        : report.comment
                          ? `评论：${report.comment.content.slice(0, 60)}`
                          : "目标已被删除"}
                    </span>
                    <span className="admin-row__meta">
                      举报人 {report.reporter ? displayName(report.reporter) : "未知"}
                      {" · "}
                      {relativeTime(report.created_at)}
                      {report.description ? ` · ${report.description}` : ""}
                    </span>
                  </div>
                  {report.post && (
                    <Link className="button button--ghost" href={`/posts/${report.post.id}`}>
                      查看
                    </Link>
                  )}
                  <ReportActions reportId={report.id} />
                </li>
              ))}
            </ul>

            {handledReports.length > 0 && (
              <details className="panel panel__pad" style={{ marginBlockStart: "1rem" }}>
                <summary className="muted">已处理（{handledReports.length}）</summary>
                <ul className="admin-list" style={{ paddingBlockStart: "0.75rem" }}>
                  {handledReports.map((report) => (
                    <li key={report.id} className="admin-row">
                      <div className="admin-row__main">
                        <span className="admin-row__title">
                          {REASON_LABEL[report.reason] ?? report.reason} ·{" "}
                          {report.status === "resolved" ? "已处理" : "已驳回"}
                        </span>
                        <span className="admin-row__meta">
                          {report.post
                            ? report.post.title
                            : report.comment
                              ? `评论：${report.comment.content.slice(0, 60)}`
                              : "目标已被删除"}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </section>

      <section aria-labelledby="posts-mod-title">
        <div className="section-head">
          <h2 id="posts-mod-title">内容管理</h2>
          <span className="section-head__meta">最近发布</span>
        </div>

        <ul className="admin-list">
          {posts.map((post) => (
            <li key={post.id} className="admin-row">
              <div className="admin-row__main">
                <span className="admin-row__title">
                  {post.title}
                  {post.is_pinned && <span className="badge badge--highlight">置顶</span>}
                  {post.is_essence && <span className="badge badge--accent">精华</span>}
                </span>
                <span className="admin-row__meta">
                  {post.author ? displayName(post.author) : "已注销用户"} ·{" "}
                  {relativeTime(post.created_at)} · 👁 {compactNumber(post.views_count)}
                </span>
              </div>
              <Link className="button button--ghost" href={`/posts/${post.id}`}>
                查看
              </Link>
              <PostModerationControls
                postId={post.id}
                pinned={post.is_pinned}
                essence={post.is_essence}
              />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="users-title">
        <div className="section-head">
          <h2 id="users-title">用户管理</h2>
          <span className="section-head__meta">最近注册</span>
        </div>

        <ul className="admin-list">
          {users.map((user) => (
            <li key={user.id} className="admin-row">
              <div className="admin-row__main">
                <span className="admin-row__title">
                  {displayName(user)}
                  {user.role !== "user" && (
                    <span className="badge badge--accent">
                      {user.role === "owner" ? "站长" : "管理员"}
                    </span>
                  )}
                </span>
                <span className="admin-row__meta">
                  @{user.username} · Lv.{user.level} ·{" "}
                  {compactNumber(user.posts_count)} 篇 · 注册于{" "}
                  {relativeTime(user.created_at)}
                </span>
              </div>
              <UserModerationControls
                userId={user.id}
                isMuted={user.is_muted}
                mutedUntil={user.muted_until}
                role={user.role}
                viewerIsOwner={isOwner}
                isSelf={user.id === profile.id}
              />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
