import Link from "next/link";

type Props = {
  page: number;
  total: number;
  pageSize: number;
  basePath: string;
  searchParams?: Record<string, string | undefined>;
};

export function Pagination({
  page,
  total,
  pageSize,
  basePath,
  searchParams = {},
}: Props) {
  const pages = Math.max(Math.ceil(total / pageSize), 1);
  if (pages <= 1) return null;

  const build = (target: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (value) params.set(key, value);
    }
    if (target > 1) params.set("page", String(target));
    const query = params.toString();
    return query ? `${basePath}?${query}` : basePath;
  };

  const prev = Math.max(page - 1, 1);
  const next = Math.min(page + 1, pages);

  return (
    <nav className="pagination" aria-label="分页">
      {page > 1 ? (
        <Link className="button button--ghost" href={build(prev)} rel="prev">
          ← 上一页
        </Link>
      ) : (
        <span className="button button--ghost" aria-disabled="true">
          ← 上一页
        </span>
      )}

      <span className="pagination__status">
        第 {page} / {pages} 页
      </span>

      {page < pages ? (
        <Link className="button button--ghost" href={build(next)} rel="next">
          下一页 →
        </Link>
      ) : (
        <span className="button button--ghost" aria-disabled="true">
          下一页 →
        </span>
      )}
    </nav>
  );
}
