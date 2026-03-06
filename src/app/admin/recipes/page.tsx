"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Ingredient = {
  id: string;
  name: string;
  type: string;
  bottle_size_ml: number | null;
  unit: string | null;
};

type RecipeIngredient = {
  recipe_id: string;
  ingredient_id: string;
  ml_per_serving: number;
  ingredients: Ingredient | Ingredient[] | null;
};

type Recipe = {
  id: string;
  name: string;
  description: string | null;
  image_url?: string | null;
  is_active: boolean;
  recipe_ingredients?: RecipeIngredient[];
};

function normalizeIngredient(
  ingredient: Ingredient | Ingredient[] | null | undefined,
) {
  if (!ingredient) return null;
  return Array.isArray(ingredient) ? ingredient[0] ?? null : ingredient;
}

function asNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export default function RecipesAdmin() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newIngredient, setNewIngredient] = useState({
    name: "",
    type: "liquor",
    bottle_size_ml: 700,
    unit: "ml",
  });

  const [newRecipe, setNewRecipe] = useState({
    name: "",
    description: "",
    image_url: "",
    is_active: true,
  });

  const [recipeLink, setRecipeLink] = useState({
    recipeId: "",
    ingredientId: "",
    ml: 30,
  });

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/menu", { method: "GET" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Unable to load menu.");
      setIngredients((json?.ingredients as Ingredient[]) || []);
      setRecipes((json?.recipes as Recipe[]) || []);
    } catch (e: any) {
      setError(e?.message || "Unable to load menu.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const ingredientById = useMemo(() => {
    return new Map(ingredients.map((i) => [i.id, i]));
  }, [ingredients]);

  const handleAddIngredient = async () => {
    setError(null);
    const payload: Record<string, unknown> = {
      name: newIngredient.name,
      type: newIngredient.type,
      unit: newIngredient.unit || null,
    };
    if (newIngredient.type === "liquor") {
      payload.bottle_size_ml = newIngredient.bottle_size_ml || 700;
    } else {
      payload.bottle_size_ml = null;
    }

    const res = await fetch("/api/admin/ingredients", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json?.error || "Unable to add ingredient.");
      return;
    }

    setNewIngredient({ name: "", type: "liquor", bottle_size_ml: 700, unit: "ml" });
    await loadData();
  };

  const handleAddRecipe = async () => {
    setError(null);
    const res = await fetch("/api/admin/recipes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: newRecipe.name,
        description: newRecipe.description || null,
        image_url: newRecipe.image_url || null,
        is_active: Boolean(newRecipe.is_active),
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json?.error || "Unable to add recipe.");
      return;
    }

    setNewRecipe({ name: "", description: "", image_url: "", is_active: true });
    await loadData();
  };

  const handleUpdateRecipe = async (id: string, patch: Record<string, unknown>) => {
    setError(null);
    const res = await fetch(`/api/admin/recipes/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json?.error || "Unable to update recipe.");
      return;
    }
    await loadData();
  };

  const handleLinkIngredient = async () => {
    setError(null);
    if (!recipeLink.recipeId || !recipeLink.ingredientId) {
      setError("Select a recipe and an ingredient to link.");
      return;
    }

    const res = await fetch("/api/admin/recipe-ingredients", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        recipe_id: recipeLink.recipeId,
        ingredient_id: recipeLink.ingredientId,
        ml_per_serving: recipeLink.ml,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json?.error || "Unable to link ingredient.");
      return;
    }

    await loadData();
  };

  const handleUpdateRecipeIngredient = async (
    recipeId: string,
    ingredientId: string,
    ml: unknown,
  ) => {
    setError(null);
    const mlNum = asNumber(ml);
    if (mlNum === null) {
      setError("Enter a valid number.");
      return;
    }

    const res = await fetch("/api/admin/recipe-ingredients", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        recipe_id: recipeId,
        ingredient_id: ingredientId,
        ml_per_serving: mlNum,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json?.error || "Unable to update ingredient amount.");
      return;
    }
    await loadData();
  };

  const handleRemoveRecipeIngredient = async (recipeId: string, ingredientId: string) => {
    setError(null);
    const res = await fetch(
      `/api/admin/recipe-ingredients?recipe_id=${encodeURIComponent(recipeId)}&ingredient_id=${encodeURIComponent(ingredientId)}`,
      { method: "DELETE" },
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json?.error || "Unable to remove ingredient.");
      return;
    }
    await loadData();
  };

  return (
    <div className="min-h-screen hero-grid px-6 py-16">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <header className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">
              Admin
            </p>
            <h1 className="font-display text-4xl text-ink">Recipes</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              Add and amend cocktail recipes and their ingredient amounts.
            </p>
          </div>
          <Link
            href="/admin"
            className="gi-btn-secondary px-6 py-3 text-xs font-semibold uppercase tracking-[0.25em] hover:-translate-y-0.5"
          >
            Back to Admin
          </Link>
        </header>

        {error ? (
          <div className="glass-panel rounded-[28px] px-8 py-6">
            <p className="text-sm font-medium text-red-700">{error}</p>
          </div>
        ) : null}

        {loading ? (
          <div className="glass-panel rounded-[28px] px-8 py-8 text-sm text-muted">
            Loading…
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="glass-panel rounded-[28px] px-8 py-6">
            <h2 className="font-display text-2xl text-accent">Add ingredient</h2>
            <div className="mt-4 grid gap-4">
              <input
                type="text"
                placeholder="Ingredient name"
                value={newIngredient.name}
                onChange={(event) =>
                  setNewIngredient((prev) => ({ ...prev, name: event.target.value }))
                }
                className="rounded-2xl border border-subtle bg-white/80 px-4 py-3 text-sm"
              />
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={newIngredient.type}
                  onChange={(event) =>
                    setNewIngredient((prev) => ({ ...prev, type: event.target.value }))
                  }
                  className="rounded-2xl border border-subtle bg-white/80 px-4 py-3 text-sm"
                >
                  <option value="liquor">Liquor</option>
                  <option value="mixer">Mixer</option>
                  <option value="juice">Juice</option>
                  <option value="syrup">Syrup</option>
                  <option value="garnish">Garnish</option>
                  <option value="ice">Ice</option>
                  <option value="glassware">Glassware</option>
                </select>
                <input
                  type="text"
                  placeholder="Unit (ml, g, pcs)"
                  value={newIngredient.unit}
                  onChange={(event) =>
                    setNewIngredient((prev) => ({ ...prev, unit: event.target.value }))
                  }
                  className="rounded-2xl border border-subtle bg-white/80 px-4 py-3 text-sm"
                />
              </div>
              {newIngredient.type === "liquor" ? (
                <input
                  type="number"
                  placeholder="Bottle size (ml)"
                  value={newIngredient.bottle_size_ml}
                  onChange={(event) =>
                    setNewIngredient((prev) => ({
                      ...prev,
                      bottle_size_ml: Number(event.target.value),
                    }))
                  }
                  className="rounded-2xl border border-subtle bg-white/80 px-4 py-3 text-sm"
                />
              ) : null}
              <button
                type="button"
                onClick={() => void handleAddIngredient()}
                className="gi-btn-primary w-full px-6 py-3 text-xs font-semibold uppercase tracking-[0.25em] hover:-translate-y-0.5"
              >
                Save ingredient
              </button>
            </div>
          </div>

          <div className="glass-panel rounded-[28px] px-8 py-6">
            <h2 className="font-display text-2xl text-accent">Add recipe</h2>
            <div className="mt-4 grid gap-4">
              <input
                type="text"
                placeholder="Recipe name"
                value={newRecipe.name}
                onChange={(event) =>
                  setNewRecipe((prev) => ({ ...prev, name: event.target.value }))
                }
                className="rounded-2xl border border-subtle bg-white/80 px-4 py-3 text-sm"
              />
              <input
                type="text"
                placeholder="Image URL (optional)"
                value={newRecipe.image_url}
                onChange={(event) =>
                  setNewRecipe((prev) => ({ ...prev, image_url: event.target.value }))
                }
                className="rounded-2xl border border-subtle bg-white/80 px-4 py-3 text-sm"
              />
              <textarea
                placeholder="Description (optional)"
                value={newRecipe.description}
                onChange={(event) =>
                  setNewRecipe((prev) => ({ ...prev, description: event.target.value }))
                }
                rows={3}
                className="rounded-2xl border border-subtle bg-white/80 px-4 py-3 text-sm"
              />
              <label className="flex items-center justify-between gap-3 rounded-2xl border border-subtle bg-white/80 px-4 py-3 text-sm">
                Active
                <input
                  type="checkbox"
                  checked={newRecipe.is_active}
                  onChange={(e) =>
                    setNewRecipe((prev) => ({ ...prev, is_active: e.target.checked }))
                  }
                />
              </label>
              <button
                type="button"
                onClick={() => void handleAddRecipe()}
                className="gi-btn-primary w-full px-6 py-3 text-xs font-semibold uppercase tracking-[0.25em] hover:-translate-y-0.5"
              >
                Save recipe
              </button>
            </div>
          </div>
        </div>

        <div className="glass-panel rounded-[28px] px-8 py-6">
          <h2 className="font-display text-2xl text-accent">Link ingredient to recipe</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <select
              value={recipeLink.recipeId}
              onChange={(event) =>
                setRecipeLink((prev) => ({ ...prev, recipeId: event.target.value }))
              }
              className="rounded-2xl border border-subtle bg-white/80 px-4 py-3 text-sm"
            >
              <option value="">Select recipe…</option>
              {recipes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <select
              value={recipeLink.ingredientId}
              onChange={(event) =>
                setRecipeLink((prev) => ({ ...prev, ingredientId: event.target.value }))
              }
              className="rounded-2xl border border-subtle bg-white/80 px-4 py-3 text-sm"
            >
              <option value="">Select ingredient…</option>
              {ingredients.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.type})
                </option>
              ))}
            </select>
            <input
              type="number"
              value={recipeLink.ml}
              onChange={(event) =>
                setRecipeLink((prev) => ({ ...prev, ml: Number(event.target.value) }))
              }
              className="rounded-2xl border border-subtle bg-white/80 px-4 py-3 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={() => void handleLinkIngredient()}
            className="gi-btn-secondary mt-4 w-full px-6 py-3 text-xs font-semibold uppercase tracking-[0.25em] hover:-translate-y-0.5"
          >
            Link ingredient
          </button>
        </div>

        <div className="grid gap-4">
          {recipes.map((r) => (
            <div key={r.id} className="glass-panel rounded-[28px] px-8 py-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-accent">
                    Recipe
                  </p>
                  <h3 className="font-display text-2xl text-ink">{r.name}</h3>
                </div>
                <label className="flex items-center gap-2 rounded-full border border-subtle bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-ink">
                  Active
                  <input
                    type="checkbox"
                    checked={Boolean(r.is_active)}
                    onChange={(e) =>
                      void handleUpdateRecipe(r.id, { is_active: e.target.checked })
                    }
                  />
                </label>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-accent">
                  Name
                  <input
                    defaultValue={r.name}
                    onBlur={(e) =>
                      void handleUpdateRecipe(r.id, { name: e.target.value })
                    }
                    className="mt-2 h-[52px] w-full rounded-2xl border border-subtle bg-white/80 px-4 py-3 text-[16px] tracking-normal text-ink"
                  />
                </label>
                <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-accent">
                  Image URL
                  <input
                    defaultValue={r.image_url || ""}
                    onBlur={(e) =>
                      void handleUpdateRecipe(r.id, { image_url: e.target.value })
                    }
                    className="mt-2 h-[52px] w-full rounded-2xl border border-subtle bg-white/80 px-4 py-3 text-[16px] tracking-normal text-ink"
                  />
                </label>
                <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-accent md:col-span-2">
                  Description
                  <textarea
                    defaultValue={r.description || ""}
                    onBlur={(e) =>
                      void handleUpdateRecipe(r.id, { description: e.target.value })
                    }
                    rows={2}
                    className="mt-2 w-full rounded-2xl border border-subtle bg-white/80 px-4 py-3 text-[16px] tracking-normal text-ink"
                  />
                </label>
              </div>

              <div className="mt-6">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-accent">
                  Ingredients (per drink)
                </p>
                <div className="mt-3 grid gap-3">
                  {(r.recipe_ingredients || []).length ? (
                    (r.recipe_ingredients || []).map((ri) => {
                      const ing =
                        normalizeIngredient(ri.ingredients) ||
                        ingredientById.get(ri.ingredient_id) ||
                        null;
                      const unit = ing?.unit || "ml";
                      return (
                        <div
                          key={`${ri.recipe_id}-${ri.ingredient_id}`}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-subtle bg-white/80 px-5 py-4"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-ink">
                              {ing?.name || "Unknown ingredient"}
                            </p>
                            <p className="mt-1 text-xs text-muted">
                              {ing?.type || "—"}
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              defaultValue={ri.ml_per_serving}
                              className="h-[44px] w-[120px] rounded-2xl border border-subtle bg-white/90 px-3 text-right text-sm tabular-nums"
                              onBlur={(e) =>
                                void handleUpdateRecipeIngredient(
                                  r.id,
                                  ri.ingredient_id,
                                  e.target.value,
                                )
                              }
                            />
                            <span className="w-[36px] text-xs font-semibold uppercase tracking-[0.2em] text-muted">
                              {unit}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                void handleRemoveRecipeIngredient(
                                  r.id,
                                  ri.ingredient_id,
                                )
                              }
                              className="rounded-full border border-subtle bg-white/70 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-ink hover:bg-white"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-sm text-muted">No ingredients linked yet.</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

