// Per-browser conveniences. Storage can throw (private mode, blocked site data); the page works without it.
export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`trove:${key}`);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}
export function save(key: string, value: unknown) {
  try { localStorage.setItem(`trove:${key}`, JSON.stringify(value)); } catch { /* fine without it */ }
}
