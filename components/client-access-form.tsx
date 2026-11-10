"use client";

import { useActionState } from "react";

import { saveClientAccess, type ClientAccessState } from "@/lib/actions/admin";

export function ClientAccessForm({
  clientId,
  loginName,
  email,
}: {
  clientId: string;
  loginName: string | null;
  email: string | null;
}) {
  const [state, action, pending] = useActionState(saveClientAccess, null as ClientAccessState | null);
  return (
    <form key={state?.ok ? "saved" : "edit"} action={action} className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
      <input type="hidden" name="clientId" value={clientId} />
      {loginName ? (
        <p className="text-sm sm:col-span-2">
          登入名稱 <span className="font-semibold">{loginName}</span>
        </p>
      ) : (
        <label className="flex flex-col gap-2 text-sm font-semibold sm:col-span-2">
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
      )}
      <label className="flex flex-col gap-2 text-sm font-semibold sm:col-span-2">
        電郵（可選，不用作登入）
        <input
          name="email"
          type="email"
          maxLength={200}
          defaultValue={email ?? ""}
          autoComplete="off"
          className="rounded-xl border border-line bg-white px-3 py-3 font-normal"
        />
      </label>
      <label className="flex flex-col gap-2 text-sm font-semibold">
        {loginName ? "新密碼" : "密碼"}
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
        <p role="alert" className="text-sm text-danger sm:col-span-2">
          {state.error}
        </p>
      ) : null}
      {state?.ok ? <p className="text-sm text-ok sm:col-span-2">{state.message}</p> : null}
      <p className="text-sm leading-6 text-muted sm:col-span-2">重設後，這位客戶現有的登入會立即結束。</p>
      <button
        type="submit"
        disabled={pending}
        className="min-h-11 rounded-xl bg-navy px-4 text-sm font-semibold text-white disabled:opacity-60 sm:col-span-2 sm:w-fit"
      >
        {pending ? "正在儲存…" : loginName ? "重設密碼" : "設定登入"}
      </button>
    </form>
  );
}
