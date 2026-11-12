import type { Metadata } from "next";

import { ClientListLink } from "@/components/client-list-link";
import { Composer } from "@/components/composer";
import { listTopicRules } from "@/lib/data";
import { topicPhrasesForClient } from "@/lib/topic-rules";

export const metadata: Metadata = { title: "新請求" };

export default async function NewRequestPage() {
  const topicRules = topicPhrasesForClient(await listTopicRules());

  return (
    <main>
      <ClientListLink />
      <h1 className="mt-1 text-2xl font-semibold">新請求</h1>
      <p className="mt-2 text-sm leading-6 text-muted">
        寫下或貼上需要處理的內容。系統會整理內容摘要；符合規則時會選擇事項，工作地點留空時會填上讀到的地址。也可以附上相片或舊文件。
      </p>
      <div className="mt-5 rounded-3xl border border-line bg-card p-4">
        <Composer audience="client" mode="create" topicRules={topicRules} />
      </div>
    </main>
  );
}
