"use client";

import { useFormStatus } from "react-dom";

import { browserViewStorage, clearViewCache } from "@/lib/view-cache";

export function SignOutForm({
  action,
  buttonClassName,
}: {
  action: () => Promise<void>;
  buttonClassName: string;
}) {
  return (
    <form
      action={async () => {
        clearViewCache(browserViewStorage());
        await action();
      }}
    >
      <SignOutButton className={buttonClassName} />
    </form>
  );
}

function SignOutButton({ className }: { className: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? "正在登出…" : "登出"}
    </button>
  );
}
