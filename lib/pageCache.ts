// A tiny stale-while-revalidate cache for page data, kept in sessionStorage: reopening a page
// in the same tab shows what was last seen immediately while the fresh request runs. It is
// per tab and cleared when the tab closes, and it is only ever a first paint - every page
// that uses it still fetches, and the server re-checks everything on each action.

const MAX_AGE_MS = 30 * 60 * 1000;

export function readPageCache<T>(key: string): T | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const { at, value } = JSON.parse(raw) as { at: number; value: T };
    if (!at || Date.now() - at > MAX_AGE_MS) return null;
    return value;
  } catch {
    return null;
  }
}

export function writePageCache(key: string, value: unknown) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), value }));
  } catch {
    /* storage full or unavailable - just no instant paint next time */
  }
}

export function clearPageCache(key: string) {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    /* nothing to clear */
  }
}
