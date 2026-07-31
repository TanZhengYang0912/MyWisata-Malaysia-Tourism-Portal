export interface InboxResponse<T> {
  data: T[];
  error: string | null;
}

export async function parseInboxResponse<T>(response: Response): Promise<InboxResponse<T>> {
  let payload: { data?: T[]; error?: { message?: string } } = {};
  try {
    payload = await response.json();
  } catch {
    return { data: [], error: `Inbox request failed (${response.status})` };
  }
  if (!response.ok) {
    return { data: [], error: payload.error?.message || `Inbox request failed (${response.status})` };
  }
  return { data: Array.isArray(payload.data) ? payload.data : [], error: null };
}
