import type { Recipe, RecipesPayload } from "../types";

const RECIPES_KEY = "gi-mobile:recipes:v1";
const DRAFTS_KEY = "gi-mobile:drafts:v1";

export type DraftPayload = {
  title: string;
  eventDate: string;
  notes: string;
  clientEmail: string;
  guestCount: number;
  clientPhone: string;
  submit: true;
  cocktails: Array<{ recipeId: string; recipeName: string; servings: number }>;
};

export type Draft = {
  id: string;
  createdAt: string;
  payload: DraftPayload;
};

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function loadCachedRecipes(): { cachedAt: string; recipes: Recipe[] } | null {
  const parsed = safeParse<{ cachedAt: string; recipes: Recipe[] }>(
    window.localStorage.getItem(RECIPES_KEY),
  );
  if (!parsed || !Array.isArray(parsed.recipes)) return null;
  return parsed;
}

export function saveCachedRecipes(payload: RecipesPayload) {
  const recipes = payload?.recipes ?? [];
  window.localStorage.setItem(
    RECIPES_KEY,
    JSON.stringify({ cachedAt: new Date().toISOString(), recipes }),
  );
}

export function loadDrafts(): Draft[] {
  const parsed = safeParse<{ drafts: Draft[] }>(window.localStorage.getItem(DRAFTS_KEY));
  if (!parsed || !Array.isArray(parsed.drafts)) return [];
  return parsed.drafts;
}

export function saveDraft(payload: DraftPayload) {
  const existing = loadDrafts();
  const next: Draft = {
    id: crypto?.randomUUID?.() || String(Date.now()),
    createdAt: new Date().toISOString(),
    payload,
  };
  const updated = [next, ...existing].slice(0, 20);
  window.localStorage.setItem(DRAFTS_KEY, JSON.stringify({ drafts: updated }));
  return next;
}

export function removeDraft(id: string) {
  const updated = loadDrafts().filter((d) => d.id !== id);
  window.localStorage.setItem(DRAFTS_KEY, JSON.stringify({ drafts: updated }));
}

