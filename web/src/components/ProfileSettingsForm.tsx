"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { displayName, initialOf } from "@/lib/format";

type Props = {
  profile: {
    id: string;
    username: string;
    nickname: string | null;
    bio: string | null;
    avatar_url: string | null;
    level: number;
    xp: number;
  };
  email: string | null;
};

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export function ProfileSettingsForm({ profile, email }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [nickname, setNickname] = useState(profile.nickname ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [avatar, setAvatar] = useState(profile.avatar_url);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const supabase = createSupabaseBrowserClient();

  async function uploadAvatar(file: File) {
    if (!IMAGE_TYPES.includes(file.type)) {
      setError("头像只支持 JPG / PNG / WebP / GIF");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("头像不能超过 2MB");
      return;
    }

    setUploading(true);
    setError(null);
    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const path = `${profile.id}/avatar-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, file, { cacheControl: "3600", upsert: true });

    if (uploadError) {
      setError(`上传失败：${uploadError.message}`);
      setUploading(false);
      return;
    }

    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ avatar_url: data.publicUrl })
      .eq("id", profile.id);

    if (updateError) setError(`保存失败：${updateError.message}`);
    else {
      setAvatar(data.publicUrl);
      setNote("头像已更新");
      router.refresh();
    }
    setUploading(false);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNote(null);
    setSaving(true);

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        nickname: nickname.trim() || null,
        bio: bio.trim() || null,
      })
      .eq("id", profile.id);

    if (updateError) {
      setError(`保存失败：${updateError.message}`);
    } else {
      setNote("资料已保存");
      startTransition(() => router.refresh());
    }
    setSaving(false);
  }

  return (
    <div className="settings">
      <form className="panel panel__pad form" onSubmit={save}>
        <div className="settings__avatar">
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="avatar avatar--xxl" src={avatar} alt="当前头像" />
          ) : (
            <span className="avatar avatar--xxl" aria-hidden="true">
              {initialOf(nickname || profile.username)}
            </span>
          )}
          <div className="settings__avatar-actions">
            <label className="button button--ghost">
              {uploading ? "上传中…" : "更换头像"}
              <input
                type="file"
                accept={IMAGE_TYPES.join(",")}
                hidden
                disabled={uploading}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadAvatar(file);
                  event.target.value = "";
                }}
              />
            </label>
            <span className="muted">JPG / PNG / WebP / GIF，≤ 2MB</span>
          </div>
        </div>

        <div className="field-row">
          <label className="field">
            <span className="field__label">用户名</span>
            <input
              className="field__input"
              value={profile.username}
              readOnly
              disabled
            />
            <span className="field__hint">用户名用于主页地址，注册后不可修改</span>
          </label>

          <label className="field">
            <span className="field__label">邮箱</span>
            <input className="field__input" value={email ?? ""} readOnly disabled />
            <span className="field__hint">如需更换邮箱请联系管理员</span>
          </label>
        </div>

        <label className="field">
          <span className="field__label">昵称</span>
          <input
            className="field__input"
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            maxLength={50}
            placeholder={displayName({ nickname: profile.nickname, username: profile.username })}
          />
        </label>

        <label className="field">
          <span className="field__label">简介</span>
          <textarea
            className="field__input"
            value={bio}
            onChange={(event) => setBio(event.target.value)}
            maxLength={300}
            rows={3}
            placeholder="介绍一下自己，或者写一句喜欢的话"
          />
          <span className="field__hint">{bio.length}/300</span>
        </label>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {note && (
          <p className="form-note" role="status">
            {note}
          </p>
        )}

        <div className="editor__foot">
          <span className="muted">
            Lv.{profile.level} · {profile.xp} XP
          </span>
          <button className="button button--primary" disabled={saving}>
            {saving ? "保存中…" : "保存资料"}
          </button>
        </div>
      </form>

      <form className="panel panel__pad form" method="post" action="/auth/signout">
        <h2 className="panel__title">账号</h2>
        <p className="muted">退出后需要重新登录才能发帖与评论。</p>
        <button className="button button--ghost danger">退出登录</button>
      </form>
    </div>
  );
}
