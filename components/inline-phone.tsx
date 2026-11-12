"use client";

import { useEffect, useState } from "react";

import { copyPhoneNumber, phoneCallHref, phoneCopyText } from "@/lib/phone";

export function InlinePhone({ phone, mine }: { phone: string; mine: boolean }) {
  const display = phoneCopyText(phone);
  const href = display ? phoneCallHref(display) : null;
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (copyState !== "copied") return;
    const timer = window.setTimeout(() => setCopyState("idle"), 2000);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  if (!display || !href) return <>{phone}</>;

  const linkClass = mine
    ? "inline-flex min-h-11 items-center whitespace-nowrap align-middle font-semibold text-white underline decoration-white/70 underline-offset-2"
    : "inline-flex min-h-11 items-center whitespace-nowrap align-middle font-semibold text-navy underline decoration-navy/40 underline-offset-2";
  const buttonClass = mine
    ? "ml-2 inline-flex min-h-11 items-center whitespace-nowrap align-middle rounded-xl border border-white/40 bg-white px-3 font-semibold text-navy"
    : "ml-2 inline-flex min-h-11 items-center whitespace-nowrap align-middle rounded-xl border border-line bg-white px-3 font-semibold";

  return (
    <span className="whitespace-normal">
      <a href={href} aria-label={`致電 ${display}`} className={linkClass}>
        {display}
      </a>
      <button
        type="button"
        aria-label={copyState === "copied" ? `已複製 ${display}` : `複製 ${display}`}
        onClick={() => {
          setCopyState("idle");
          void copyPhoneNumber(display).then((ok) => setCopyState(ok ? "copied" : "failed"));
        }}
        className={buttonClass}
      >
        {copyState === "copied" ? "已複製" : "複製號碼"}
      </button>
      {copyState === "failed" ? (
        <span role="alert" className={mine ? "ml-2 text-white" : "ml-2 text-danger"}>
          未能複製號碼。
        </span>
      ) : null}
    </span>
  );
}
