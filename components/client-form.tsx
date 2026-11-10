"use client";

import { useActionState } from "react";

import { createClientAccount } from "@/lib/actions/admin";

export function ClientForm() {
  const [state, action, pending] = useActionState(createClientAccount, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-2 text-sm font-semibold">
        公司名稱
        <input name="companyName" required maxLength={120} className="rounded-xl border border-line bg-white px-3 py-3 font-normal" />
      </label>
      <label className="flex flex-col gap-2 text-sm font-semibold">
        聯絡人（可選）
        <input name="contactName" maxLength={80} className="rounded-xl border border-line bg-white px-3 py-3 font-normal" />
      </label>
      <label className="flex flex-col gap-2 text-sm font-semibold">
        電話（可選）
        <input name="phone" maxLength={40} inputMode="tel" className="rounded-xl border border-line bg-white px-3 py-3 font-normal" />
      </label>
      <label className="flex flex-col gap-2 text-sm font-semibold">
        內部備註（可選，客戶看不到）
        <textarea name="notes" maxLength={2000} rows={4} className="rounded-xl border border-line bg-white px-3 py-3 font-normal leading-7" />
      </label>
      <label className="flex flex-col gap-2 text-sm font-semibold">
        登入名稱
        <input
          name="loginName"
          required
          minLength={2}
          maxLength={40}
          autoComplete="off"
          className="rounded-xl border border-line bg-white px-3 py-3 font-normal"
        />
      </label>
      <p className="text-sm leading-6 text-muted">登入名稱不必是電郵，而且不能與其他客戶重複。</p>
      <label className="flex flex-col gap-2 text-sm font-semibold">
        電郵（可選，不用作登入）
        <input name="email" type="email" maxLength={200} autoComplete="off" className="rounded-xl border border-line bg-white px-3 py-3 font-normal" />
      </label>
      <label className="flex flex-col gap-2 text-sm font-semibold">
        密碼
        <input
          name="password"
          type="password"
          required
          minLength={8}
          maxLength={200}
          autoComplete="new-password"
          className="rounded-xl border border-line bg-white px-3 py-3 font-normal"
        />
      </label>
      <label className="flex flex-col gap-2 text-sm font-semibold">
        再輸入密碼
        <input
          name="confirmPassword"
          type="password"
          required
          minLength={8}
          maxLength={200}
          autoComplete="new-password"
          className="rounded-xl border border-line bg-white px-3 py-3 font-normal"
        />
      </label>
      {state && !state.ok ? (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="min-h-12 rounded-2xl bg-navy font-semibold text-white disabled:opacity-60">
        {pending ? "正在建立…" : "建立客戶帳戶"}
      </button>
    </form>
  );
}
