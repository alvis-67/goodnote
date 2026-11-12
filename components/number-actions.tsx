"use client";

import { useEffect, useState } from "react";

import { copyPhoneNumber, phoneCallHref, phoneCopyText } from "@/lib/phone";

/** A voice number can be called and copied. A fax can be copied, and is not a call link. */
export function NumberActions({ value, mode }: { value: string; mode: "call" | "copy" }) {
  const display = phoneCopyText(value) ?? value.trim();
  const href = mode === "call" ? phoneCallHref(display) : null;
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (copyState !== "copied") return;
    const timer = window.setTimeout(() => setCopyState("idle"), 2000);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  if (!display) return null;

  const copyName = mode === "call" ? `複製 ${display}` : `複製傳真 ${display}`;
  const buttonText = mode === "call" ? "複製號碼" : "複製傳真";

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      {href ? (
        <a href={href} aria-label={`致電 ${display}`} className="inline-flex min-h-11 items-center font-semibold text-navy">
          {display}
        </a>
      ) : (
        <span className="inline-flex min-h-11 items-center font-semibold">{display}</span>
      )}
      {phoneCopyText(display) ? (
        <button
          type="button"
          aria-label={copyState === "copied" ? `已複製 ${display}` : copyName}
          onClick={() => {
            setCopyState("idle");
            void copyPhoneNumber(display).then((ok) => setCopyState(ok ? "copied" : "failed"));
          }}
          className="inline-flex min-h-11 items-center rounded-xl border border-line bg-white px-3 font-semibold"
        >
          {copyState === "copied" ? "已複製" : buttonText}
        </button>
      ) : null}
      {copyState === "failed" ? (
        <p role="alert" className="w-full text-danger">
          未能複製號碼。
        </p>
      ) : null}
    </div>
  );
}
