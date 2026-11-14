const OPERATION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function supportAttachmentOperationStorageKey(surface: "customer" | "admin", actorId: string, ticketId: string): string {
  return `mw_support_attachment_operation:${surface}:${actorId}:${ticketId}`;
}

export function readSessionOperationId(storageKey: string): string | null {
  try {
    const operationId = window.sessionStorage.getItem(storageKey);
    return operationId && OPERATION_ID_PATTERN.test(operationId) ? operationId : null;
  } catch {
    return null;
  }
}

export function saveSessionOperationId(storageKey: string, operationId: string): boolean {
  try {
    window.sessionStorage.setItem(storageKey, operationId);
    return true;
  } catch {
    return false;
  }
}

export function clearSessionOperationId(storageKey: string, operationId: string): void {
  try {
    if (window.sessionStorage.getItem(storageKey) === operationId) {
      window.sessionStorage.removeItem(storageKey);
    }
  } catch {
    // A confirmed server result remains authoritative if browser cleanup fails.
  }
}
