import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Goodnote",
    template: "%s · Goodnote",
  },
  description: "客戶與管理員之間的報價、發票及收據請求。",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant-HK">
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
