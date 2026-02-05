"use client";

import { supabase } from "@/lib/supabaseClient";
import { useEffect, useState } from "react";

type Ingredient = {
  id: string;
  name: string;
  type: string;
  bottle_size_ml: number | null;
};

type Recipe = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  recipe_ingredients?: Array<{
    ml_per_serving: number;
    ingredients: Ingredient | null;
  }>;
};

export default function RecipesAdmin() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newIngredient, setNewIngredient] = useState({
    name: "",
    type: "liquor",
    bottle_size_ml: 700,
  });

  const [newRecipe, setNewRecipe] = useState({
    name: "",
    description: "",
  });

  const [recipeLink, setRecipeLink] = useState({
    recipeId: "",
    ingredientId: "",
    ml: 30,
  });

  const loadData = async () => {
    setLoading(true);
    setError(null);

    const [{ data: ingredientData, error: ingredientError }, { data: recipeData, error: recipeError }] =
      await Promise.all([
        supabase
          .from("ingredients")
          .select("id, name, type, bottle_size_ml")
          .order("created_at", { ascending: false }),
        supabase
          .from("recipes")
          .select(
            "id, name, description, is_active, recipe_ingredients(ml_per_serving, ingredients(id, name, type, bottle_size_ml))",
          )
          .order("created_at", { ascending: false }),
      ]);

    if (ingredientError) {
      setError(ingredientError.message);
    }
    if (recipeError) {
      setError(recipeError.message);
    }

    setIngredients((ingredientData as Ingredient[]) || []);
    setRecipes((recipeData as Recipe[]) || []);
    setLoading(false);
  };

  const handleAddIngredient = async () => {
    setError(null);
    const payload: Record<string, unknown> = {
      name: newIngredient.name,
      type: newIngredient.type,
    };

    if (newIngredient.type === "liquor") {
      payload.bottle_size_ml = newIngredient.bottle_size_ml || 700;
    }

    const { error: insertError } = await supabase.from("ingredients").insert(payload);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setNewIngredient({ name: "", type: "liquor", bottle_size_ml: 700 });
    await loadData();
  };

  const handleAddRecipe = async () => {
    setError(null);
    const { error: insertError } = await supabase.from("recipes").insert({
      name: newRecipe.name,
      description: newRecipe.description || null,
    });

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setNewRecipe({ name: "", description: "" });
    await loadData();
  };

  const handleLinkIngredient = async () => {
    setError(null);
    const { error: insertError } = await supabase.from("recipe_ingredients").insert({
      recipe_id: recipeLink.recipeId,
      ingredient_id: recipeLink.ingredientId,
      ml_per_serving: recipeLink.ml,
    });

    if (insertError) {
      setError(insertError.message);
      return;
    }

    await loadData();
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div className="min-h-screen hero-grid px-6 py-16">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#6a2e2a]">
            Admin
          </p>
          <h1 className="font-display text-4xl text-[#151210]">
            Recipes & ingredients
          </h1>
          <p className="mt-2 text-sm text-[#4b3f3a]">
            If you cannot see data, make sure your profile role is set to admin in Supabase.
          </p>
        </header>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="glass-panel rounded-[28px] px-8 py-6">
            <h2 className="font-display text-2xl text-[#6a2e2a]">Add Ingredient</h2>
            <div className="mt-4 grid gap-4">
              <input
                type="text"
                placeholder="Ingredient name"
                value={newIngredient.name}
                onChange={(event) =>
                  setNewIngredient((prev) => ({ ...prev, name: event.target.value }))
                }
                className="rounded-2xl border border-[#c47b4a]/30 bg-white/80 px-4 py-3 text-sm"
              />
              <select
                value={newIngredient.type}
                onChange={(event) =>
                  setNewIngredient((prev) => ({ ...prev, type: event.target.value }))
                }
                className="rounded-2xl border border-[#c47b4a]/30 bg-white/80 px-4 py-3 text-sm"
              >
                <option value="liquor">Liquor</option>
                <option value="mixer">Mixer</option>
                <option value="juice">Juice</option>
                <option value="syrup">Syrup</option>
                <option value="garnish">Garnish</option>
              </select>
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
                  className="rounded-2xl border border-[#c47b4a]/30 bg-white/80 px-4 py-3 text-sm"
                />
              ) : null}
              <button
                onClick={handleAddIngredient}
                className="rounded-full bg-[#6a2e2a] px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-[#f8f1e7] shadow-lg shadow-[#c47b4a]/30 hover:-translate-y-0.5"
              >
                Save Ingredient
              </button>
            </div>
          </div>

          <div className="glass-panel rounded-[28px] px-8 py-6">
            <h2 className="font-display text-2xl text-[#6a2e2a]">Add Recipe</h2>
            <div className="mt-4 grid gap-4">
              <input
                type="text"
                placeholder="Recipe name"
                value={newRecipe.name}
                onChange={(event) =>
                  setNewRecipe((prev) => ({ ...prev, name: event.target.value }))
                }
                className="rounded-2xl border border-[#c47b4a]/30 bg-white/80 px-4 py-3 text-sm"
              />
              <textarea
                placeholder="Description"
                value={newRecipe.description}
                onChange={(event) =>
                  setNewRecipe((prev) => ({ ...prev, description: event.target.value }))
                }
                className="min-h-[120px] rounded-2xl border border-[#c47b4a]/30 bg-white/80 px-4 py-3 text-sm"
              />
              <button
                onClick={handleAddRecipe}
                className="rounded-full bg-[#c47b4a] px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-white shadow-lg shadow-[#c47b4a]/30 hover:-translate-y-0.5"
              >
                Save Recipe
              </button>
            </div>
          </div>
        </div>

        <div className="glass-panel rounded-[28px] px-8 py-6">
          <h2 className="font-display text-2xl text-[#6a2e2a]">Attach Ingredients</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <select
              value={recipeLink.recipeId}
              onChange={(event) =>
                setRecipeLink((prev) => ({ ...prev, recipeId: event.target.value }))
              }
              className="rounded-2xl border border-[#c47b4a]/30 bg-white/80 px-4 py-3 text-sm"
            >
              <option value="">Select recipe</option>
              {recipes.map((recipe) => (
                <option key={recipe.id} value={recipe.id}>
                  {recipe.name}
                </option>
              ))}
            </select>
            <select
              value={recipeLink.ingredientId}
              onChange={(event) =>
                setRecipeLink((prev) => ({ ...prev, ingredientId: event.target.value }))
              }
              className="rounded-2xl border border-[#c47b4a]/30 bg-white/80 px-4 py-3 text-sm"
            >
              <option value="">Select ingredient</option>
              {ingredients.map((ingredient) => (
                <option key={ingredient.id} value={ingredient.id}>
                  {ingredient.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              value={recipeLink.ml}
              onChange={(event) =>
                setRecipeLink((prev) => ({ ...prev, ml: Number(event.target.value) }))
              }
              className="rounded-2xl border border-[#c47b4a]/30 bg-white/80 px-4 py-3 text-sm"
              placeholder="ml per serving"
            />
          </div>
          <button
            onClick={handleLinkIngredient}
            className="mt-4 rounded-full bg-[#6a2e2a] px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-[#f8f1e7] shadow-lg shadow-[#c47b4a]/30 hover:-translate-y-0.5"
          >
            Add to Recipe
          </button>
        </div>

        <div className="grid gap-6">
          {loading ? (
            <p className="text-sm text-[#4b3f3a]">Loading recipes...</p>
          ) : (
            recipes.map((recipe) => (
              <div
                key={recipe.id}
                className="glass-panel flex flex-col gap-4 rounded-[28px] px-8 py-6"
              >
                <div>
                  <h2 className="font-display text-2xl text-[#6a2e2a]">
                    {recipe.name}
                  </h2>
                  <p className="mt-2 text-sm text-[#4b3f3a]">
                    {recipe.description || "No description"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-[#4b3f3a]">
                  {recipe.recipe_ingredients?.map((item, index) => (
                    <span
                      key={`${recipe.id}-${index}`}
                      className="rounded-full bg-white/80 px-3 py-2"
                    >
                      {item.ingredients?.name} · {item.ml_per_serving}ml
                    </span>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
