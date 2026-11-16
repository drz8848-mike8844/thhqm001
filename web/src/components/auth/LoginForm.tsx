"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    const supabase = createSupabaseBrowserClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(
        signInError.message === "Invalid login credentials"
          ? "邮箱或密码不正确"
          : signInError.message,
      );
      return;
    }

    const raw = params.get("next") ?? "/";
    const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
    startTransition(() => {
      router.replace(next);
      router.refresh();
    });
  }

  async function sendReset() {
    const email = (
      document.querySelector<HTMLInputElement>('input[name="email"]')?.value ?? ""
    ).trim();
    if (!email) {
      setError("请先填写邮箱，再点击忘记密码");
      return;
    }
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    setNotice(
      resetError ? `发送失败：${resetError.message}` : "重置邮件已发送，请查收邮箱",
    );
  }

  return (
    <form className="form" onSubmit={onSubmit} noValidate>
      <label className="field">
        <span className="field__label">邮箱</span>
        <input
          className="field__input"
          type="email"
          name="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
        />
      </label>

      <label className="field">
        <span className="field__label">密码</span>
        <input
          className="field__input"
          type="password"
          name="password"
          autoComplete="current-password"
          required
        />
      </label>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="form-note" role="status">
          {notice}
        </p>
      )}

      <button className="button button--primary form__submit" disabled={pending}>
        {pending ? "正在进入…" : "登录"}
      </button>

      <div className="form__foot">
        <button type="button" className="linklike" onClick={sendReset}>
          忘记密码？
        </button>
        <span className="muted">
          还没有账号？<Link href="/register">注册</Link>
        </span>
      </div>
    </form>
  );
}
