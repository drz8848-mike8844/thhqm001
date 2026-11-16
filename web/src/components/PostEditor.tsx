"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { PostBody } from "@/components/PostBody";

type Props = {
  mode: "create" | "edit";
  userId: string;
  postId?: string;
  initialTitle?: string;
  initialContent?: string;
  initialCover?: string | null;
  initialTags?: string[];
};

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export function PostEditor({
  mode,
  userId,
  postId,
  initialTitle = "",
  initialContent = "",
  initialCover = null,
  initialTags = [],
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [tags, setTags] = useState(initialTags.join(" "));
  const [cover, setCover] = useState<string | null>(initialCover);
  const [preview, setPreview] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createSupabaseBrowserClient();

  function wrapSelection(before: string, after = before, placeholder = "") {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = content.slice(start, end) || placeholder;
    const next = `${content.slice(0, start)}${before}${selected}${after}${content.slice(end)}`;
    setContent(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  }

  function prefixLine(prefix: string) {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const lineStart = content.lastIndexOf("\n", start - 1) + 1;
    const next = `${content.slice(0, lineStart)}${prefix}${content.slice(lineStart)}`;
    setContent(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + prefix.length, start + prefix.length);
    });
  }

  async function uploadImage(file: File, forCover = false) {
    if (!IMAGE_TYPES.includes(file.type)) {
      setError("只支持 JPG / PNG / WebP / GIF 图片");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("图片不能超过 10MB");
      return;
    }

    setUploading(true);
    setError(null);

    const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
    const path = `${userId}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("post-images")
      .upload(path, file, { cacheControl: "31536000", upsert: false });

    if (uploadError) {
      setError(`上传失败：${uploadError.message}`);
      setUploading(false);
      return;
    }

    const { data } = supabase.storage.from("post-images").getPublicUrl(path);
    const url = data.publicUrl;

    if (forCover) {
      setCover(url);
    } else {
      const el = textareaRef.current;
      const snippet = `\n![${file.name.replace(/[[\]]/g, "")}](${url})\n`;
      if (el) {
        const at = el.selectionStart;
        setContent((prev) => `${prev.slice(0, at)}${snippet}${prev.slice(at)}`);
      } else {
        setContent((prev) => `${prev}${snippet}`);
      }
    }

    setUploading(false);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (title.trim().length < 1) {
      setError("标题不能为空");
      return;
    }
    if (content.trim().length < 1) {
      setError("正文不能为空");
      return;
    }

    setSaving(true);

    const payload = {
      title: title.trim(),
      content,
      cover_image_url: cover,
    };

    let targetId = postId;

    if (mode === "create") {
      const { data, error: insertError } = await supabase
        .from("posts")
        .insert({ ...payload, author_id: userId })
        .select("id")
        .single();

      if (insertError) {
        setError(
          insertError.message.includes("row-level security")
            ? "发布失败：你可能被禁言，或登录状态已过期。"
            : `发布失败：${insertError.message}`,
        );
        setSaving(false);
        return;
      }
      targetId = data.id;
    } else {
      const { error: updateError } = await supabase
        .from("posts")
        .update(payload)
        .eq("id", targetId!);

      if (updateError) {
        setError(`保存失败：${updateError.message}`);
        setSaving(false);
        return;
      }
    }

    const tagList = Array.from(
      new Set(
        tags
          .split(/[\s,，、#]+/)
          .map((tag) => tag.trim())
          .filter(Boolean),
      ),
    ).slice(0, 8);

    const { error: tagError } = await supabase.rpc("set_post_tags", {
      p_post_id: targetId!,
      p_tags: tagList,
    });

    if (tagError) {
      setError(`标签保存失败：${tagError.message}`);
      setSaving(false);
      return;
    }

    startTransition(() => {
      router.replace(`/posts/${targetId}`);
      router.refresh();
    });
  }

  return (
    <form className="editor" onSubmit={save}>
      <div className="section-head">
        <h1>{mode === "create" ? "发布创作" : "编辑文章"}</h1>
        <Link className="section-head__more" href={postId ? `/posts/${postId}` : "/"}>
          取消
        </Link>
      </div>

      <label className="field">
        <span className="field__label">标题</span>
        <input
          className="field__input editor__title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={200}
          required
          placeholder="给这篇文章起个名字"
        />
      </label>

      <div className="field">
        <span className="field__label">正文（支持 Markdown）</span>

        <div className="editor__toolbar" role="toolbar" aria-label="编辑工具">
          <button type="button" onClick={() => wrapSelection("**", "**", "加粗")}>
            <b>B</b>
          </button>
          <button type="button" onClick={() => wrapSelection("*", "*", "斜体")}>
            <i>I</i>
          </button>
          <button type="button" onClick={() => prefixLine("> ")}>
            引用
          </button>
          <button type="button" onClick={() => wrapSelection("`", "`", "code")}>
            代码
          </button>
          <button type="button" onClick={() => prefixLine("## ")}>
            小标题
          </button>
          <button type="button" onClick={() => prefixLine("- ")}>
            列表
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? "上传中…" : "插入图片"}
          </button>
          <button
            type="button"
            className="editor__preview-toggle"
            onClick={() => setPreview((value) => !value)}
            aria-pressed={preview}
          >
            {preview ? "继续编辑" : "预览"}
          </button>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept={IMAGE_TYPES.join(",")}
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void uploadImage(file);
            event.target.value = "";
          }}
        />

        {preview ? (
          <div className="editor__preview panel panel__pad">
            {content.trim() ? (
              <PostBody content={content} />
            ) : (
              <p className="muted">还没有内容。</p>
            )}
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            className="field__input editor__content"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows={18}
            maxLength={100000}
            placeholder={"写下你的故事…\n\n支持 # 标题、**加粗**、> 引用、- 列表 与图片。"}
            required
          />
        )}
      </div>

      <div className="field-row">
        <label className="field">
          <span className="field__label">标签</span>
          <input
            className="field__input"
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="幻想乡的日常 写作（空格分隔，最多 8 个）"
          />
          <span className="field__hint">不需要输入 #，空格或逗号分隔</span>
        </label>

        <div className="field">
          <span className="field__label">封面图（可选）</span>
          <div className="editor__cover">
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cover} alt="封面预览" />
            ) : (
              <span className="muted">未设置封面</span>
            )}
            <div className="editor__cover-actions">
              <label className="button button--ghost">
                {cover ? "更换" : "上传"}
                <input
                  type="file"
                  accept={IMAGE_TYPES.join(",")}
                  hidden
                  disabled={uploading}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadImage(file, true);
                    event.target.value = "";
                  }}
                />
              </label>
              {cover && (
                <button
                  type="button"
                  className="linklike danger"
                  onClick={() => setCover(null)}
                >
                  移除
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="editor__foot">
        <span className="muted">{content.length}/100000</span>
        <button className="button button--primary" disabled={saving || uploading}>
          {saving ? "保存中…" : mode === "create" ? "发布" : "保存修改"}
        </button>
      </div>
    </form>
  );
}
