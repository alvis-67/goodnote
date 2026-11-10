"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="zh-Hant-HK">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          fontFamily: '"PingFang HK", "Noto Sans HK", "Microsoft JhengHei", sans-serif',
          background: "#f3eee4",
          color: "#1c1612",
        }}
      >
        <main style={{ maxWidth: 480, margin: "0 auto", padding: "4rem 1.25rem" }}>
          <h1 style={{ fontSize: "1.8rem" }}>系統暫時未能顯示</h1>
          <p style={{ lineHeight: 1.7 }}>請再試一次。</p>
          <button type="button" onClick={reset} style={{ marginTop: 16, padding: "12px 18px" }}>
            再試一次
          </button>
        </main>
      </body>
    </html>
  );
}
