import type { Metadata } from "next";

import { Composer } from "@/components/composer";

export const metadata: Metadata = { title: "新請求" };

export default async function NewRequestPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <main>
      <h1 className="text-2xl font-semibold">新請求</h1>
      <p className="mt-2 text-sm leading-6 text-muted">選擇事項，寫下需要處理的內容，也可以附上相片或舊文件。</p>
      <div className="mt-5 rounded-3xl border border-line bg-card p-4">
        <Composer audience="client" mode="create" token={token} />
      </div>
    </main>
  );
}
