export function clientHomePath(token: string): string {
  return `/c/${token}`;
}

export function clientNewPath(token: string): string {
  return `/c/${token}/new`;
}

export function clientRequestPath(token: string, requestId: string): string {
  return `/c/${token}/requests/${requestId}`;
}
