// The page's only network layer. Paths are relative so the page works under any base.
export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly hash?: string) {
    super(message);
  }
}

export async function api<T = Record<string, unknown>>(path: string, body?: unknown): Promise<T> {
  const init: RequestInit = body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
  const res = await fetch(`api/${path}`, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? `HTTP ${res.status}`, res.status, data.hash);
  return data as T;
}

/** GET that answers null on 404: the old server has no /api/source or /api/settings. */
export const optional = <T>(path: string) => api<T>(path).catch((e) => (e instanceof ApiError && e.status === 404 ? null : Promise.reject(e)));
