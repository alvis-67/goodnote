import type { Metadata } from "next";

import { TopicRuleEditor } from "@/components/topic-rule-editor";
import { deleteTopicRule, saveTopicRule } from "@/lib/actions/admin";
import { listTopicRules } from "@/lib/data";

export const metadata: Metadata = { title: "事項規則" };

export default async function TopicRulesPage() {
  const rules = await listTopicRules();

  return (
    <main className="mx-auto max-w-xl">
      <h1 className="text-2xl font-semibold">事項規則</h1>
      <p className="mt-2 text-sm leading-6 text-muted">
        客戶寫新請求時，內容如果包含下面的字句，會自動選擇對應事項。較長的字句優先，所以「已收錢」不會因為包含「收錢」而變成出發票。備註和條款裡的字不用來判斷。
      </p>
      <p className="mt-2 text-sm leading-6 text-muted">
        沒有符合的字句時，不會猜成出報價單，會請客戶自己選擇。內容提到管理處的電話、傳真或申請文件時，即使沒有「搵管理處」這幾個字，仍會選擇搵管理處。已建立的請求不會改事項或階段。
      </p>
      <div className="mt-5 rounded-3xl bg-desk-card p-4">
        <TopicRuleEditor rules={rules} saveRule={saveTopicRule} deleteRule={deleteTopicRule} />
      </div>
    </main>
  );
}
