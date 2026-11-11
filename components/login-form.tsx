"use client";

import { useActionState, useLayoutEffect } from "react";

import type { AuthResult } from "@/lib/actions/auth";
import { browserViewStorage, clearViewCache } from "@/lib/view-cache";

type LoginAction = (previous: AuthResult | null, formData: FormData) => Promise<AuthResult | null>;

export function LoginForm({
  action,
  field,
  initialError,
  initialNotice,
}: {
  action: LoginAction;
  field: "email" | "loginName";
  initialError: string | null;
  initialNotice?: string | null;
}) {
  const initial: AuthResult | null = initialError ? { ok: false, error: initialError } : null;
  const [state, formAction, pending] = useActionState(action, initial);
  useLayoutEffect(() => {
    clearViewCache(browserViewStorage());
  }, []);
  const error = state && !state.ok ? state.error : null;
  const label = field === "email" ? "電郵" : "登入名稱";
  return (
    <form
      action={formAction}
      className="flex flex-col gap-4 rounded-3xl border border-line bg-card p-5 shadow-sm"
      onSubmit={() => clearViewCache(browserViewStorage())}
    >
      {initialNotice ? <p className="rounded-xl bg-ok-bg px-3 py-3 text-sm text-ok">{initialNotice}</p> : null}
      <label className="flex flex-col gap-2 text-sm font-semibold">
        {label}
        <input
          name={field}
          type={field === "email" ? "email" : "text"}
          autoComplete="username"
          required
          maxLength={field === "email" ? 200 : 40}
          className="rounded-xl border border-line bg-white px-3 py-3 font-normal"
        />
      </label>
      <label className="flex flex-col gap-2 text-sm font-semibold">
        密碼
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={8}
          maxLength={200}
          className="rounded-xl border border-line bg-white px-3 py-3 font-normal"
        />
      </label>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="min-h-12 rounded-2xl bg-navy font-semibold text-white disabled:opacity-60">
        {pending ? "正在登入…" : "登入"}
      </button>
    </form>
  );
}
