"use client";

import { useState } from "react";

export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setFailed(false);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
      setFailed(true);
    }
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <input
        readOnly
        value={url}
        aria-label="客戶連結"
        onFocus={(event) => event.currentTarget.select()}
        className="min-w-0 flex-1 rounded-xl border border-line bg-white px-3 py-3 text-sm text-ink"
      />
      <button
        type="button"
        onClick={copy}
        className="rounded-xl bg-navy px-4 py-3 text-sm font-semibold text-white"
      >
        {copied ? "已複製" : "複製連結"}
      </button>
      {failed ? <p className="text-sm text-danger sm:basis-full">未能複製，請長按上方連結手動複製。</p> : null}
    </div>
  );
}
