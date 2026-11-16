import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";

/** 允许图片与常见 Markdown，其余一律按默认白名单过滤 XSS */
const schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    img: [...(defaultSchema.attributes?.img ?? []), "loading", "decoding"],
    code: [...(defaultSchema.attributes?.code ?? []), "className"],
  },
};

export function PostBody({ content }: { content: string }) {
  return (
    <div className="prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, schema]]}
        components={{
          a({ href, children, ...props }) {
            const external = Boolean(href && /^https?:\/\//.test(href));
            return (
              <a
                href={href}
                {...props}
                {...(external
                  ? { target: "_blank", rel: "noopener noreferrer nofollow" }
                  : {})}
              >
                {children}
              </a>
            );
          },
          img({ src, alt, ...props }) {
            if (typeof src !== "string") return null;
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={src}
                alt={alt ?? ""}
                loading="lazy"
                decoding="async"
                {...props}
              />
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
