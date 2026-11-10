export const clientHomePath = "/client";
export const clientNewPath = "/client/new";
export const clientLoginPath = "/client/login";

export function clientRequestPath(requestId: string): string {
  return `/client/requests/${requestId}`;
}

export function adminDeskHref(filters: {
  status?: string;
  topic?: string;
  clientId?: string;
  deleteId?: string;
  notice?: string;
  error?: string;
}): string {
  const search = new URLSearchParams();
  if (filters.status) search.set("status", filters.status);
  if (filters.topic) search.set("topic", filters.topic);
  if (filters.clientId) search.set("client", filters.clientId);
  if (filters.deleteId) search.set("delete", filters.deleteId);
  if (filters.notice) search.set("notice", filters.notice);
  if (filters.error) search.set("error", filters.error);
  const query = search.toString();
  return query ? `/admin?${query}` : "/admin";
}
