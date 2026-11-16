/** 展示层的小工具：时间、数字、文本摘要、头像占位 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const rtf = new Intl.RelativeTimeFormat("zh-CN", { numeric: "auto" });

/** 相对时间：刚刚 / 5 分钟前 / 3 小时前 / 2 天前 / 2026-03-01 */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const diff = then.getTime() - now.getTime();
  const abs = Math.abs(diff);

  if (abs < MINUTE) return "刚刚";
  if (abs < HOUR) return rtf.format(Math.round(diff / MINUTE), "minute");
  if (abs < DAY) return rtf.format(Math.round(diff / HOUR), "hour");
  if (abs < 30 * DAY) return rtf.format(Math.round(diff / DAY), "day");

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(then);
}

export function absoluteTime(iso: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

/** 12345 → 1.2万 */
export function compactNumber(n: number): string {
  if (n < 1_000) return String(n);
  if (n < 10_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${(n / 10_000).toFixed(1).replace(/\.0$/, "")}万`;
}

/** 去掉 Markdown 记号，用于列表摘要 */
export function plainExcerpt(markdown: string, max = 140): string {
  const text = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_~`|-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

export function displayName(profile: {
  nickname: string | null;
  username: string;
}): string {
  return profile.nickname?.trim() || profile.username;
}

export function initialOf(name: string): string {
  return Array.from(name.trim())[0]?.toUpperCase() ?? "?";
}

/** 等级阈值与旧 Django 的 LEVEL_DEFINITIONS 保持一致 */
const LEVEL_THRESHOLDS = [0, 50, 150, 300, 600, 1000, 1500, 2500, 4000, 7000];

export function levelProgress(xp: number, level: number) {
  const floor = LEVEL_THRESHOLDS[Math.max(level - 1, 0)] ?? 0;
  const ceil = LEVEL_THRESHOLDS[level] ?? floor;
  if (level >= 10) return { floor, ceil, percent: 100 };
  const percent = ceil > floor ? Math.min(((xp - floor) / (ceil - floor)) * 100, 100) : 0;
  return { floor, ceil, percent: Math.max(percent, 0) };
}
