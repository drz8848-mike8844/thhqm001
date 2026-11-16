/**
 * 东方幻绮梦 · Cloudflare Workers 入口（备选方案）
 * 直接转发到 ASSETS（Next.js standalone 产物），SSR 在边缘运行。
 */
declare const ASSETS: { fetch: (r: Request) => Promise<Response> };

type Handler = { fetch: (request: Request) => Promise<Response> };

export default {
  async fetch(request: Request): Promise<Response> {
    return ASSETS.fetch(request);
  },
} satisfies Handler;
