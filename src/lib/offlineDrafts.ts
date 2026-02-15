export type OfflineDraft = {
  id: string;
  createdAt: string;
  payload: any;
};

const DRAFTS_KEY = "get-involved:drafts:v1";

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function loadDrafts(): OfflineDraft[] {
  if (typeof window === "undefined") return [];
  const parsed = safeParse<{ version: 1; drafts: OfflineDraft[] }>(
    window.localStorage.getItem(DRAFTS_KEY),
  );
  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.drafts)) return [];
  return parsed.drafts.filter((d) => d && typeof d.id === "string");
}

export function saveDraft(payload: any) {
  if (typeof window === "undefined") return;
  const drafts = loadDrafts();
  const next: OfflineDraft = {
    id: crypto?.randomUUID?.() || String(Date.now()),
    createdAt: new Date().toISOString(),
    payload,
  };
  const updated = [next, ...drafts].slice(0, 10);
  window.localStorage.setItem(
    DRAFTS_KEY,
    JSON.stringify({ version: 1, drafts: updated }),
  );
  return next;
}

export function removeDraft(id: string) {
  if (typeof window === "undefined") return;
  const drafts = loadDrafts();
  const updated = drafts.filter((d) => d.id !== id);
  window.localStorage.setItem(
    DRAFTS_KEY,
    JSON.stringify({ version: 1, drafts: updated }),
  );
}

