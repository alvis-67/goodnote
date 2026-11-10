export const clientHomePath = "/client";
export const clientNewPath = "/client/new";
export const clientLoginPath = "/client/login";

export function clientRequestPath(requestId: string): string {
  return `/client/requests/${requestId}`;
}
