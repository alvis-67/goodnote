"use client";

import { useActionState } from "react";

import { changeAdminPassword } from "@/lib/actions/admin";
import { browserViewStorage, clearViewCache } from "@/lib/view-cache";

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(
    async (previous: Awaited<ReturnType<typeof changeAdminPassword>>, formData: FormData) => {
      clearViewCache(browserViewStorage());
      return changeAdminPassword(previous, formData);
    },
    null,
  );
  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-2 text-sm font-semibold">
        目前密碼
        <input
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          maxLength={200}
          className="rounded-xl border border-line bg-white px-3 py-3 font-normal"
        />
      </label>
      <label className="flex flex-col gap-2 text-sm font-semibold">
        新密碼
        <input
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={200}
          className="rounded-xl border border-line bg-white px-3 py-3 font-normal"
        />
      </label>
      <label className="flex flex-col gap-2 text-sm font-semibold">
        再輸入新密碼
        <input
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={200}
          className="rounded-xl border border-line bg-white px-3 py-3 font-normal"
        />
      </label>
      {state && !state.ok ? (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="min-h-12 rounded-2xl bg-navy font-semibold text-white disabled:opacity-60">
        {pending ? "正在更新…" : "更改密碼"}
      </button>
    </form>
  );
}
