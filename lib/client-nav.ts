import { clientHomePath, clientNewPath, clientRequestPath } from "@/lib/paths";
import { isUuid } from "@/lib/tokens";

export const CLIENT_LIST_LABEL = "我的請求";

function pathOnly(pathname: string): string {
  const bare = pathname.split("?")[0]?.split("#")[0] ?? "";
  if (bare.length > 1 && bare.endsWith("/")) return bare.slice(0, -1);
  return bare;
}

/** Where 「我的請求」 goes. Null when this screen is already the list. */
export function clientListHref(pathname: string): string | null {
  const path = pathOnly(pathname);
  if (path === clientHomePath) return null;
  if (path.startsWith(`${clientHomePath}/`)) return clientHomePath;
  return null;
}

export function showNewRequest(pathname: string): boolean {
  return pathOnly(pathname) !== clientNewPath;
}

export type CreateNavigation = {
  method: "replace";
  href: string;
};

/**
 * Leave the create form with a full page load that replaces that form in
 * history. The previous entry is 「我的請求」, so the phone back control
 * returns there. The session cookie is unchanged.
 */
export function navigationAfterCreate(redirectTo: string): CreateNavigation {
  const path = pathOnly(redirectTo);
  const prefix = "/client/requests/";
  const requestId = path.startsWith(prefix) ? path.slice(prefix.length) : "";
  if (isUuid(requestId)) return { method: "replace", href: clientRequestPath(requestId) };
  return { method: "replace", href: clientHomePath };
}
