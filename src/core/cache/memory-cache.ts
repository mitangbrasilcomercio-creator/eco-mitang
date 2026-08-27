// ============================================================================
// MEMORY CACHE: CAMADA DE ALTA PERFORMANCE & CONTINGÊNCIA (LATÊNCIA < 5MS)
// ============================================================================

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class MemoryCache {
  private cache = new Map<string, CacheEntry<any>>();

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      // Expirou, mas mantém para contingência (stale fallback)
      return null;
    }
    return entry.data as T;
  }

  getStale<T>(key: string): T | null {
    const entry = this.cache.get(key);
    return entry ? (entry.data as T) : null;
  }

  set<T>(key: string, data: T, ttlSeconds: number = 60): void {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttlSeconds * 1000
    });
  }

  invalidate(prefix?: string): void {
    if (!prefix) {
      this.cache.clear();
      return;
    }
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }
}

export const memoryCache = new MemoryCache();
