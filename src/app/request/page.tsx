"use client";

import { buildIngredientTotals } from "@/lib/inventoryMath";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type Ingredient = {
  id: string;
  name: string;
  type: "liquor" | "mixer" | "juice" | "syrup" | "garnish";
  bottle_size_ml: number | null;
};

type RecipeIngredient = {
  ml_per_serving: number;
  // Supabase embedded relation can type as object or array depending on schema typing.
  ingredients: Ingredient | Ingredient[] | null;
};

type Recipe = {
  id: string;
  name: string;
  description: string | null;
  recipe_ingredients: RecipeIngredient[];
};

const MENU_RECIPE_NAMES = [
  "Moscow Mule",
  "Aperol Spritz",
  "Mojito",
  "Margarita",
] as const;

export default function RequestPage() {
  const router = useRouter();

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [servingsByRecipeId, setServingsByRecipeId] = useState<
    Record<string, number>
  >({});

  const [eventDate, setEventDate] = useState("");
  const [notes, setNotes] = useState("");
  const [clientEmail, setClientEmail] = useState("");

  const [orderList, setOrderList] = useState<
    ReturnType<typeof buildIngredientTotals> | null
  >(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editLink, setEditLink] = useState<string | null>(null);

  const normalizeIngredient = (value: Ingredient | Ingredient[] | null) => {
    if (!value) return null;
    return Array.isArray(value) ? value[0] ?? null : value;
  };

  const selectedRecipes = useMemo(() => {
    return recipes
      .map((recipe) => ({
        recipe,
        servings: Number(servingsByRecipeId[recipe.id] ?? 0),
      }))
      .filter((item) => item.servings > 0);
  }, [recipes, servingsByRecipeId]);

  const canCreateOrder = selectedRecipes.length > 0;

  const loadMenu = async () => {
    setError(null);
    const { data, error: recipeError } = await supabase
      .from("recipes")
      .select(
        "id, name, description, recipe_ingredients(ml_per_serving, ingredients(id, name, type, bottle_size_ml))",
      )
      .in("name", [...MENU_RECIPE_NAMES])
      .eq("is_active", true);

    if (recipeError) {
      setError(recipeError.message);
      return;
    }

    const list = ((data ?? []) as unknown as Recipe[]) || [];
    const sorted = [...MENU_RECIPE_NAMES]
      .map((name) => list.find((recipe) => recipe.name === name))
      .filter(Boolean) as Recipe[];

    setRecipes(sorted);
    setServingsByRecipeId((prev) => {
      const next = { ...prev };
      for (const recipe of sorted) {
        if (next[recipe.id] === undefined) {
          next[recipe.id] = 0;
        }
      }
      return next;
    });
  };

  useEffect(() => {
    loadMenu();
  }, []);

  const handleCreateOrderList = () => {
    setError(null);
    setSuccess(null);
    setEditLink(null);

    const items = selectedRecipes.flatMap(({ recipe, servings }) =>
      (recipe.recipe_ingredients ?? []).flatMap((ri) => {
        const ingredient = normalizeIngredient(ri.ingredients);
        if (!ingredient) return [];
        return [
          {
            ingredientId: ingredient.id,
            name: ingredient.name,
            type: ingredient.type,
            mlPerServing: ri.ml_per_serving,
            servings,
            bottleSizeMl: ingredient.bottle_size_ml,
          },
        ];
      }),
    );

    setOrderList(buildIngredientTotals(items));
  };

  const handleOrderBartenders = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    setEditLink(null);

    try {
      if (!orderList) {
        setError("Create your order list first.");
        return;
      }
      if (!clientEmail) {
        setError("Please enter your email.");
        return;
      }

      const response = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Cocktail booking request",
          eventDate,
          notes,
          clientEmail,
          submit: true,
          cocktails: selectedRecipes.map(({ recipe, servings }) => ({
            recipeId: recipe.id,
            recipeName: recipe.name,
            servings,
          })),
        }),
      });

      let data: any = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }

      if (!response.ok) {
        setError(data?.error || `Unable to send request (HTTP ${response.status}).`);
        return;
      }

      const token = data?.editToken as string | undefined;
      if (!token) {
        setError("Request created, but no edit token was returned.");
        return;
      }

      const link = `${window.location.origin}/request/edit/${token}`;
      setEditLink(link);
      setSuccess("Request sent. We’ll be in touch soon.");
    } catch (err: any) {
      setError(err?.message || "Network error while sending request.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen hero-grid px-6 py-16">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#6a2e2a]">
            Book bartenders
          </p>
          <h1 className="font-display text-4xl text-[#151210]">
            Cocktail menu builder
          </h1>
          <p className="mt-2 text-sm text-[#4b3f3a]">
            Choose cocktails, set quantities, then create your order list.
          </p>
        </header>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {success ? <p className="text-sm text-[#4b3f3a]">{success}</p> : null}

        <div className="glass-panel rounded-[28px] px-8 py-6">
          <h2 className="font-display text-2xl text-[#6a2e2a]">Menu</h2>
          <p className="mt-2 text-sm text-[#4b3f3a]">
            Four signature cocktails. Ingredients display automatically.
          </p>

          {recipes.length === 0 ? (
            <p className="mt-4 text-sm text-[#4b3f3a]">
              No cocktails found yet. Add recipes in Admin → Recipes with these
              exact names: Moscow Mule, Aperol Spritz, Mojito, Margarita.
            </p>
          ) : (
            <div className="mt-6 grid gap-6">
              {recipes.map((recipe) => {
                const servings = servingsByRecipeId[recipe.id] ?? 0;
                return (
                  <div
                    key={recipe.id}
                    className="grid gap-4 rounded-[28px] border border-[#c47b4a]/20 bg-white/70 p-5 md:grid-cols-[240px_1fr]"
                  >
                    <div className="space-y-3">
                      <h3 className="font-display text-2xl text-[#151210]">
                        {recipe.name}
                      </h3>
                      <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-[#6a2e2a]">
                        Quantity
                        <input
                          type="number"
                          min={0}
                          value={servings}
                          onChange={(event) =>
                            setServingsByRecipeId((prev) => ({
                              ...prev,
                              [recipe.id]: Number(event.target.value),
                            }))
                          }
                          className="mt-2 w-full rounded-2xl border border-[#c47b4a]/30 bg-white/80 px-4 py-3 text-sm"
                        />
                      </label>
                    </div>

                    <div className="rounded-3xl border border-[#6a2e2a]/10 bg-white/80 px-5 py-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#6a2e2a]">
                        Ingredients (per cocktail)
                      </p>
                      <div className="mt-3 grid gap-2 text-sm text-[#4b3f3a]">
                        {(recipe.recipe_ingredients ?? []).map((ri, index) => {
                          const ingredient = normalizeIngredient(ri.ingredients);
                          if (!ingredient) return null;
                          return (
                            <div
                              key={`${recipe.id}-${index}`}
                              className="flex items-center justify-between gap-4"
                            >
                              <span className="font-medium text-[#151210]">
                                {ingredient.name}
                              </span>
                              <span>{ri.ml_per_serving} ml</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-4">
            <button
              onClick={handleCreateOrderList}
              disabled={!canCreateOrder}
              className="rounded-full bg-[#6a2e2a] px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-[#f8f1e7] shadow-lg shadow-[#c47b4a]/30 hover:-translate-y-0.5 disabled:opacity-60"
            >
              Create Order List
            </button>
          </div>
        </div>

        {orderList ? (
          <div className="glass-panel rounded-[28px] px-8 py-6">
            <h2 className="font-display text-2xl text-[#6a2e2a]">Order list</h2>
            <p className="mt-2 text-sm text-[#4b3f3a]">
              Totals include a 10% buffer. Liquor is rounded to 700ml bottles.
            </p>

            <div className="mt-6 grid gap-3">
              {orderList.map((item) => (
                <div
                  key={item.ingredientId}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#c47b4a]/20 bg-white/80 px-5 py-4"
                >
                  <div>
                    <p className="text-sm font-semibold text-[#151210]">
                      {item.name}
                    </p>
                    <p className="text-xs uppercase tracking-[0.2em] text-[#6a2e2a]">
                      {item.type}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-[#151210]">
                      {item.totalMl} ml
                    </p>
                    {item.bottlesNeeded ? (
                      <p className="text-xs text-[#4b3f3a]">
                        {item.bottlesNeeded} bottles @ {item.bottleSizeMl}ml
                      </p>
                    ) : (
                      <p className="text-xs text-[#4b3f3a]">Total volume</p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 rounded-[28px] border border-[#c47b4a]/20 bg-white/70 p-6">
              <h3 className="font-display text-xl text-[#151210]">
                Order bartenders
              </h3>
              <p className="mt-2 text-sm text-[#4b3f3a]">
                Send this order list to Get Involved and we’ll follow up.
              </p>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <input
                  type="date"
                  value={eventDate}
                  onChange={(event) => setEventDate(event.target.value)}
                  className="rounded-2xl border border-[#c47b4a]/30 bg-white/80 px-4 py-3 text-sm"
                />
                <input
                  type="email"
                  value={clientEmail}
                  onChange={(event) => setClientEmail(event.target.value)}
                  placeholder="Your email"
                  className="rounded-2xl border border-[#c47b4a]/30 bg-white/80 px-4 py-3 text-sm"
                />
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Notes (venue, timing, dietary requests...)"
                  className="min-h-[120px] rounded-2xl border border-[#c47b4a]/30 bg-white/80 px-4 py-3 text-sm md:col-span-2"
                />
              </div>

              <button
                onClick={handleOrderBartenders}
                disabled={loading}
                className="mt-4 rounded-full bg-[#c47b4a] px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-white shadow-lg shadow-[#c47b4a]/30 hover:-translate-y-0.5 disabled:opacity-60"
              >
                {loading ? "Sending request..." : "Order Bartenders"}
              </button>
            </div>

            {editLink ? (
              <div className="mt-6 rounded-3xl border border-[#c47b4a]/20 bg-white/70 px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#6a2e2a]">
                  Private edit link
                </p>
                <p className="mt-2 break-all text-sm text-[#151210]">{editLink}</p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    onClick={async () => {
                      await navigator.clipboard.writeText(editLink);
                      setSuccess("Link copied. You're all set.");
                    }}
                    className="rounded-full border border-[#6a2e2a]/30 bg-white/80 px-5 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#6a2e2a] hover:-translate-y-0.5"
                  >
                    Copy Link
                  </button>
                  <button
                    onClick={() =>
                      router.push(editLink.replace(window.location.origin, ""))
                    }
                    className="rounded-full bg-[#6a2e2a] px-5 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#f8f1e7] shadow-lg shadow-[#c47b4a]/30 hover:-translate-y-0.5"
                  >
                    Edit Request
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
