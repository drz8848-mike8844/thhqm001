import Link from "next/link";
import {
  createSupabaseServerClient,
  getCurrentProfile,
} from "@/lib/supabase/server";
import { displayName, initialOf } from "@/lib/format";
import { ThemeToggle } from "@/components/ThemeToggle";

const NAV = [
  { href: "/", label: "首页" },
  { href: "/hot", label: "热门" },
  { href: "/tags", label: "标签" },
  { href: "/favorites", label: "收藏" },
  { href: "/messages", label: "私信" },
];

export async function SiteHeader() {
  const profile = await getCurrentProfile();

  let unread = 0;
  if (profile) {
    const supabase = await createSupabaseServerClient();
    const { count } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("is_read", false);
    unread = count ?? 0;
  }

  return (
    <header className="site-header">
      <div className="shell site-header__inner">
        <Link className="brand" href="/">
          <span className="brand__mark" aria-hidden="true" />
          <span>东方幻绮梦</span>
        </Link>

        <nav className="site-nav" aria-label="主导航">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="site-header__actions">
          <ThemeToggle />

          {profile ? (
            <>
              <Link
                className="button button--primary header-cta"
                href="/posts/new"
              >
                发帖
              </Link>
              <Link
                className="header-user"
                href={`/u/${profile.username}`}
                title={displayName(profile)}
              >
                {profile.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    className="avatar"
                    src={profile.avatar_url}
                    alt=""
                    width={26}
                    height={26}
                  />
                ) : (
                  <span className="avatar" aria-hidden="true">
                    {initialOf(displayName(profile))}
                  </span>
                )}
                <span className="header-user__name">{displayName(profile)}</span>
              </Link>
              <Link
                className="header-bell"
                href="/notifications"
                aria-label={
                  unread > 0 ? `通知，${unread} 条未读` : "通知，无未读"
                }
              >
                <span aria-hidden="true">✉</span>
                {unread > 0 && (
                  <span className="header-bell__dot" aria-hidden="true">
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </Link>
            </>
          ) : (
            <>
              <Link className="button button--ghost" href="/login">
                登录
              </Link>
              <Link className="button button--primary" href="/register">
                加入
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
