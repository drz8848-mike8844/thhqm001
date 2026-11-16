"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const USERNAME_RE = /^[A-Za-z0-9_]{2,20}$/;

export function RegisterForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = new FormData(event.currentTarget);
    const username = String(form.get("username") ?? "").trim();
    const nickname = String(form.get("nickname") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    if (!USERNAME_RE.test(username)) {
      setError("用户名需为 2–20 位字母、数字或下划线");
      return;
    }
    if (password.length < 8) {
      setError("密码至少 8 位");
      return;
    }

    const supabase = createSupabaseBrowserClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username, nickname: nickname || username },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (signUpError) {
      setError(
        signUpError.message.includes("already registered")
          ? "这个邮箱已经注册过了，试试直接登录"
          : signUpError.message,
      );
      return;
    }

    // 开启了邮箱确认：session 为空，需要去邮箱点链接
    if (!data.session) {
      setSentTo(email);
      return;
    }

    startTransition(() => {
      router.replace("/");
      router.refresh();
    });
  }

  if (sentTo) {
    return (
      <div className="empty" role="status">
        <strong>还差最后一步</strong>
        <p>
          我们已向 <b>{sentTo}</b> 发送了确认邮件。点击邮件里的链接即可完成注册。
        </p>
        <p className="muted">没收到？请检查垃圾邮件，或稍后重新注册。</p>
      </div>
    );
  }

  return (
    <form className="form" onSubmit={onSubmit} noValidate>
      <div className="field-row">
        <label className="field">
          <span className="field__label">用户名</span>
          <input
            className="field__input"
            name="username"
            required
            minLength={2}
            maxLength={20}
            pattern="[A-Za-z0-9_]{2,20}"
            autoComplete="username"
            placeholder="用于个人主页地址"
          />
          <span className="field__hint">2–20 位字母、数字或下划线，注册后不可修改</span>
        </label>

        <label className="field">
          <span className="field__label">昵称</span>
          <input
            className="field__input"
            name="nickname"
            maxLength={50}
            placeholder="显示名称，可留空"
          />
        </label>
      </div>

      <label className="field">
        <span className="field__label">邮箱</span>
        <input
          className="field__input"
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
        />
      </label>

      <label className="field">
        <span className="field__label">密码</span>
        <input
          className="field__input"
          type="password"
          name="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
        <span className="field__hint">至少 8 位，建议混合字母与数字</span>
      </label>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <button className="button button--primary form__submit" disabled={pending}>
        {pending ? "正在创建…" : "创建账号"}
      </button>

      <p className="form__foot muted">
        已有账号？<Link href="/login">直接登录</Link>
      </p>
    </form>
  );
}
