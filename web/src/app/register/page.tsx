import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { getCurrentUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "注册" };

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) redirect("/");

  return (
    <section className="auth" aria-labelledby="register-title">
      <div className="auth__side">
        <p className="hero__eyebrow">加入社区</p>
        <h1 id="register-title">在这里留下名字</h1>
        <p className="muted">
          注册后可以发布创作、收藏喜欢的作品、关注创作者。请使用真实可用的邮箱，用于找回密码。
        </p>
        <ul className="rule-list">
          <li>尊重原作与创作者，转载注明出处。</li>
          <li>不发布违法、侵权与人身攻击内容。</li>
          <li>广告与灌水会被移除，严重者封禁。</li>
        </ul>
      </div>

      <div className="panel panel__pad auth__card">
        <RegisterForm />
        <p className="auth__alt muted">
          已有账号？<Link href="/login">直接登录</Link>
        </p>
      </div>
    </section>
  );
}
