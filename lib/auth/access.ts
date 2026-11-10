export function clientCanAccess(sessionClientId: string, resourceClientId: string): boolean {
  return sessionClientId.length > 0 && sessionClientId === resourceClientId;
}

export function visibleToClient<T extends { clientId: string }>(
  sessionClientId: string,
  rows: readonly T[],
): T[] {
  return rows.filter((row) => clientCanAccess(sessionClientId, row.clientId));
}
