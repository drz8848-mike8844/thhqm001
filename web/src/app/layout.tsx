import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: {
    default: "东方幻绮梦 · 同人创作社区",
    template: "%s · 东方幻绮梦",
  },
  description:
    "东方Project 同人创作与交流社区：图文、考据、改图、安科，以及一切关于幻想乡的想象。",
  applicationName: "东方幻绮梦",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf8f2" },
    { media: "(prefers-color-scheme: dark)", color: "#1b1e2b" },
  ],
  colorScheme: "light dark",
};

/** 在首帧之前决定主题，避免明暗闪烁（FOUC） */
const themeBootstrap = `
(function () {
  try {
    var stored = localStorage.getItem("theme");
    if (stored === "light" || stored === "dark") {
      document.documentElement.dataset.theme = stored;
    }
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>
        <a className="skip-link" href="#main">
          跳到主要内容
        </a>
        <SiteHeader />
        <main id="main" className="shell page">
          {children}
        </main>
        <footer className="site-footer shell">
          <p className="muted">
            东方幻绮梦 · 同人创作社区 · 内容由用户创作，与上海爱丽丝幻乐团无关
          </p>
        </footer>
      </body>
    </html>
  );
}
