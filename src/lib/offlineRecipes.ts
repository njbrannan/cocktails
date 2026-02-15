const CACHE_KEY = "get-involved:recipes-cache:v1";

type CachedPayload = {
  version: 1;
  cachedAt: string;
  recipes: any[];
};

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function loadCachedRecipes<T = any>(): { cachedAt: string; recipes: T[] } | null {
  if (typeof window === "undefined") return null;
  const parsed = safeParse<CachedPayload>(window.localStorage.getItem(CACHE_KEY));
  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.recipes)) return null;
  return { cachedAt: parsed.cachedAt, recipes: parsed.recipes as T[] };
}

export function saveCachedRecipes(recipes: any[]) {
  if (typeof window === "undefined") return;
  const payload: CachedPayload = {
    version: 1,
    cachedAt: new Date().toISOString(),
    recipes,
  };
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore quota issues.
  }
}

