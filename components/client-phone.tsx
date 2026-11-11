"use client";

import { useEffect, useState } from "react";

import { copyPhoneNumber, phoneCallHref, phoneCopyText } from "@/lib/phone";

export function ClientPhone({ phone }: { phone: string }) {
  const display = phoneCopyText(phone);
  const href = display ? phoneCallHref(display) : null;
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (copyState !== "copied") return;
    const timer = window.setTimeout(() => setCopyState("idle"), 2000);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  if (!display || !href) {
    const plain = phone.trim();
    if (!plain) return null;
    return <p className="text-sm">{plain}</p>;
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <a href={href} aria-label={`致電 ${display}`} className="inline-flex min-h-11 items-center font-semibold text-navy">
        {display}
      </a>
      <button
        type="button"
        aria-label={copyState === "copied" ? `已複製 ${display}` : `複製 ${display}`}
        onClick={() => {
          setCopyState("idle");
          void copyPhoneNumber(display).then((ok) => setCopyState(ok ? "copied" : "failed"));
        }}
        className="inline-flex min-h-11 items-center rounded-xl border border-line bg-white px-3 font-semibold"
      >
        {copyState === "copied" ? "已複製" : "複製號碼"}
      </button>
      {copyState === "failed" ? (
        <p role="alert" className="w-full text-danger">
          未能複製號碼。
        </p>
      ) : null}
    </div>
  );
}
