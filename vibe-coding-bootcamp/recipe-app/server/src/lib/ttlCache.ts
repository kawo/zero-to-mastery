/**
 * A small in-memory cache with per-entry expiry.
 *
 * Used to avoid re-asking TheMealDB for data that rarely changes (the
 * category list changes maybe once a year). It is per-process: restarting
 * the server or running several instances each start with an empty cache,
 * which is fine for data that is cheap to fetch again.
 */
export class TtlCache<T> {
  private readonly entries = new Map<string, { value: T; expiresAt: number }>();

  constructor(private readonly maxEntries = 500) {}

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T, ttlMs: number): void {
    // Map keeps insertion order, so the first key is the oldest entry
    if (this.entries.size >= this.maxEntries && !this.entries.has(key)) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(key, { value, expiresAt: Date.now() + ttlMs });
  }
}
