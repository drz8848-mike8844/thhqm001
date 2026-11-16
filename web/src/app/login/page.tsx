import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth/LoginForm";
import { getCurrentUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "登录" };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/");

  return (
    <section className="auth" aria-labelledby="login-title">
      <div className="auth__side">
        <p className="hero__eyebrow">欢迎回来</p>
        <h1 id="login-title">回到幻想乡</h1>
        <p className="muted">
          登录后可以继续写没写完的稿子、回复消息，也可以只是安静地看看大家的新作。
        </p>
      </div>

      <div className="panel panel__pad auth__card">
        <Suspense fallback={<p className="muted">载入表单…</p>}>
          <LoginForm />
        </Suspense>
        <p className="auth__alt muted">
          还没有账号？<Link href="/register">创建账号</Link>
        </p>
      </div>
    </section>
  );
}
