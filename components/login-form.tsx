"use client";

import { useState } from "react";

import { sendAdminLoginCode, verifyAdminLoginCode } from "@/lib/actions/auth";

export function LoginForm({ initialError }: { initialError: string | null }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [pending, setPending] = useState(false);

  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await sendAdminLoginCode(email);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSent(true);
  }

  async function verify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await verifyAdminLoginCode(email, code);
    if (!result.ok) {
      setPending(false);
      setError(result.error);
    }
  }

  return (
    <div className="rounded-3xl border border-line bg-card p-5 shadow-sm">
      {sent ? (
        <form onSubmit={verify} className="flex flex-col gap-4">
          <p className="text-sm leading-6 text-muted">
            已寄出登入電郵到 <span className="font-semibold text-ink">{email}</span>
            。請輸入電郵內的 6 位數字驗證碼。若電郵同時附有登入連結，也可以直接按連結。
          </p>
          <label className="flex flex-col gap-2 text-sm font-semibold">
            驗證碼
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              className="rounded-xl border border-line bg-white px-3 py-3 tracking-[0.3em]"
            />
          </label>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <button type="submit" disabled={pending} className="min-h-12 rounded-2xl bg-navy font-semibold text-white disabled:opacity-60">
            {pending ? "正在核對…" : "登入"}
          </button>
          <button
            type="button"
            className="text-sm font-semibold text-muted"
            onClick={() => {
              setSent(false);
              setCode("");
              setError(null);
            }}
          >
            使用另一個電郵
          </button>
        </form>
      ) : (
        <form onSubmit={send} className="flex flex-col gap-4">
          <label className="flex flex-col gap-2 text-sm font-semibold">
            電郵
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="rounded-xl border border-line bg-white px-3 py-3 font-normal"
            />
          </label>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <button type="submit" disabled={pending} className="min-h-12 rounded-2xl bg-navy font-semibold text-white disabled:opacity-60">
            {pending ? "正在寄出…" : "寄出登入碼"}
          </button>
        </form>
      )}
    </div>
  );
}
