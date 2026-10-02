import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Road To The Rich",
  description: "우리집 자산 · 투자 · 가계부 대시보드",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Road To The Rich", statusBarStyle: "default" },
  robots: { index: false, follow: false }, // 개인 대시보드는 검색 노출 금지
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f2" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0d0d" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        {/* 한글 UI 폰트 (실패해도 시스템 산세리프로 대체) */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
