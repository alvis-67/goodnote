export const clientDeletedNotice =
  "客戶已刪除。登入已結束，之後不能再登入。相關請求、訊息和上載檔案已一併移除，而且無法還原。";

export const clientDeleteFailedNotice = "未能刪除這位客戶。";

export const clientMissingNotice = "找不到這個客戶。";

export const clientDeleteConfirmNotice = "請先確認才可以刪除。";

export const clientDeleteConsequence =
  "登入會立即結束，之後不能再登入。所有請求、訊息和上載檔案都會一併移除，而且無法還原。";

export function clientsListHref(query?: {
  notice?: "deleted";
  error?: "delete" | "missing" | "confirm";
  deleteId?: string;
}): string {
  const search = new URLSearchParams();
  if (query?.deleteId) search.set("delete", query.deleteId);
  if (query?.notice) search.set("notice", query.notice);
  if (query?.error) search.set("error", query.error);
  const text = search.toString();
  return text ? `/admin/clients?${text}` : "/admin/clients";
}

export type ClientListNotice = {
  tone: "ok" | "danger";
  text: string;
};

export function clientListNotice(query: {
  notice?: string;
  error?: string;
  deleteId?: string;
  clientIds: readonly string[];
}): ClientListNotice | null {
  if (query.notice === "deleted") {
    return { tone: "ok", text: clientDeletedNotice };
  }
  if (query.error === "delete") {
    return { tone: "danger", text: clientDeleteFailedNotice };
  }
  if (query.error === "missing" || (query.deleteId !== undefined && !query.clientIds.includes(query.deleteId))) {
    return { tone: "danger", text: clientMissingNotice };
  }
  if (query.error === "confirm") {
    return { tone: "danger", text: clientDeleteConfirmNotice };
  }
  return null;
}
