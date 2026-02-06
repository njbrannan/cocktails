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
  image_url?: string | null;
  recipe_ingredients: RecipeIngredient[];
};

const PLACEHOLDER_IMAGE = "/cocktails/placeholder.svg";

const typePriority: Record<string, number> = {
  liquor: 0,
  mixer: 1,
  juice: 2,
  syrup: 3,
  garnish: 4,
};

export default function RequestPage() {
  const router = useRouter();

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [selectedRecipeIds, setSelectedRecipeIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [servingsByRecipeId, setServingsByRecipeId] = useState<
    Record<string, string>
  >({});

  const [eventDate, setEventDate] = useState("");
  const [notes, setNotes] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");

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
        servings: Number(servingsByRecipeId[recipe.id] ?? "0") || 0,
      }))
      .filter(
        (item) =>
          selectedRecipeIds.has(item.recipe.id) &&
          item.servings > 0,
      );
  }, [recipes, servingsByRecipeId, selectedRecipeIds]);

  const selectedForQuantity = useMemo(() => {
    return recipes.filter((recipe) => selectedRecipeIds.has(recipe.id));
  }, [recipes, selectedRecipeIds]);

  const canProceedToQuantities = selectedRecipeIds.size > 0;
  const [step, setStep] = useState<"select" | "quantity">("select");

  const canCreateOrder = selectedRecipes.length > 0;

  const loadMenu = async () => {
    setError(null);
    const { data, error: recipeError } = await supabase
      .from("recipes")
      .select(
        "id, name, description, image_url, recipe_ingredients(ml_per_serving, ingredients(id, name, type, bottle_size_ml))",
      )
      .eq("is_active", true);

    if (recipeError) {
      setError(recipeError.message);
      return;
    }

    const list = ((data ?? []) as unknown as Recipe[]) || [];
    const sorted = [...list].sort((a, b) => a.name.localeCompare(b.name));
    setRecipes(sorted);
    setServingsByRecipeId((prev) => {
      const next = { ...prev };
      for (const recipe of sorted) {
        if (next[recipe.id] === undefined) {
          next[recipe.id] = "0";
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

    // Aggregate by a normalized key so if you accidentally have duplicate ingredients
    // in Supabase (e.g. "Lime Juice" entered twice with different UUIDs), the order
    // list still combines them.
    const items = selectedRecipes.flatMap(({ recipe, servings }) =>
      (recipe.recipe_ingredients ?? []).flatMap((ri) => {
        const ingredient = normalizeIngredient(ri.ingredients);
        if (!ingredient) return [];

        const normalizedKey = `${ingredient.type}:${ingredient.name.trim().toLowerCase()}`;

        return [
          {
            ingredientId: normalizedKey,
            name: ingredient.name,
            type: ingredient.type,
            mlPerServing: ri.ml_per_serving,
            servings,
            bottleSizeMl: ingredient.bottle_size_ml,
          },
        ];
      }),
    );

    const totals = buildIngredientTotals(items).sort((a, b) => {
      const typeA = typePriority[a.type] ?? 99;
      const typeB = typePriority[b.type] ?? 99;
      if (typeA !== typeB) return typeA - typeB;
      // Within each type, biggest quantities first.
      if (a.totalMl !== b.totalMl) return b.totalMl - a.totalMl;
      return a.name.localeCompare(b.name);
    });

    setOrderList(totals);
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
          clientPhone,
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
            Cocktail Menu Builder
          </h1>
          <p className="mt-2 text-sm text-[#4b3f3a]">
            Choose cocktails, set quantities, then create your order list.
          </p>
        </header>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {success ? <p className="text-sm text-[#4b3f3a]">{success}</p> : null}

        <div className="glass-panel rounded-[28px] px-8 py-6">
          <h2 className="font-display text-2xl text-[#6a2e2a]">
            {step === "select" ? "Select cocktails" : "Set quantities"}
          </h2>
          <p className="mt-2 text-sm text-[#4b3f3a]">
            {step === "select"
              ? "Tap the photos to choose your cocktails."
              : "Add quantities and we’ll calculate ingredients per drink."}
          </p>

          {recipes.length === 0 ? (
            <p className="mt-4 text-sm text-[#4b3f3a]">
              No cocktails found yet. Add recipes in Supabase (recipes + recipe_ingredients).
            </p>
          ) : (
            <>
              {step === "select" ? (
                <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                  {recipes.map((recipe) => {
                    const isSelected = selectedRecipeIds.has(recipe.id);
                    const imageSrc = recipe.image_url
                      ? recipe.image_url.startsWith("http") ||
                        recipe.image_url.startsWith("/")
                        ? recipe.image_url
                        : `/cocktails/${recipe.image_url}`
                      : PLACEHOLDER_IMAGE;

                    return (
                      <button
                        key={recipe.id}
                        type="button"
                        onClick={() => {
                          setSelectedRecipeIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(recipe.id)) next.delete(recipe.id);
                            else next.add(recipe.id);
                            return next;
                          });
                        }}
                        className={`group relative overflow-hidden rounded-[26px] border bg-white/80 text-left shadow-sm transition-transform hover:-translate-y-0.5 ${
                          isSelected
                            ? "border-[#6a2e2a] ring-2 ring-[#6a2e2a]/20"
                            : "border-[#c47b4a]/20"
                        }`}
                      >
                        <div className="relative h-[180px] w-full">
                          <img
                            src={imageSrc}
                            alt={recipe.name}
                            loading="lazy"
                            className="h-full w-full object-cover"
                            onError={(event) => {
                              event.currentTarget.src = PLACEHOLDER_IMAGE;
                            }}
                          />
                          {isSelected ? (
                            <div className="absolute left-3 top-3 rounded-full bg-[#6a2e2a] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-[#f8f1e7]">
                              Selected
                            </div>
                          ) : null}
                        </div>
                        <div className="px-4 py-4">
                          <p className="font-display text-xl text-[#151210]">
                            {recipe.name}
                          </p>
                          <p className="mt-1 text-xs text-[#4b3f3a]">
                            Tap to {isSelected ? "remove" : "add"}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-6 grid gap-6">
                  {selectedForQuantity.length === 0 ? (
                    <p className="text-sm text-[#4b3f3a]">
                      No cocktails selected yet.
                    </p>
                  ) : (
                    selectedForQuantity.map((recipe) => {
                      const servingsRaw = servingsByRecipeId[recipe.id] ?? "";
                      const servings = Number(servingsRaw || "0") || 0;
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
                                value={servingsRaw}
                                onFocus={() => {
                                  if ((servingsByRecipeId[recipe.id] ?? "0") === "0") {
                                    setServingsByRecipeId((prev) => ({
                                      ...prev,
                                      [recipe.id]: "",
                                    }));
                                  }
                                }}
                                onBlur={() => {
                                  if ((servingsByRecipeId[recipe.id] ?? "") === "") {
                                    setServingsByRecipeId((prev) => ({
                                      ...prev,
                                      [recipe.id]: "0",
                                    }));
                                  }
                                }}
                                onChange={(event) =>
                                  setServingsByRecipeId((prev) => ({
                                    ...prev,
                                    [recipe.id]: event.target.value,
                                  }))
                                }
                                className="mt-2 w-full rounded-2xl border border-[#c47b4a]/30 bg-white/80 px-4 py-3 text-sm"
                              />
                            </label>
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedRecipeIds((prev) => {
                                  const next = new Set(prev);
                                  next.delete(recipe.id);
                                  return next;
                                })
                              }
                              className="rounded-full border border-[#6a2e2a]/30 bg-white/70 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.25em] text-[#6a2e2a] hover:-translate-y-0.5"
                            >
                              Remove
                            </button>
                          </div>

                          <div className="rounded-3xl border border-[#6a2e2a]/10 bg-white/80 px-5 py-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#6a2e2a]">
                              {servings > 0
                                ? `Ingredients (for ${servings})`
                                : "Ingredients (per cocktail)"}
                            </p>
                            <div className="mt-3 grid gap-2 text-sm text-[#4b3f3a]">
                              {recipe.recipe_ingredients.length === 0 ? (
                                <p className="text-sm text-[#4b3f3a]">
                                  No ingredients added yet.
                                </p>
                              ) : (
                                (recipe.recipe_ingredients ?? [])
                                  .flatMap((ri, index) => {
                                    const ingredient = normalizeIngredient(ri.ingredients);
                                    if (!ingredient) return [];
                                    const ml =
                                      servings > 0
                                        ? ri.ml_per_serving * servings
                                        : ri.ml_per_serving;
                                    return [
                                      {
                                        key: `${recipe.id}-${index}`,
                                        name: ingredient.name,
                                        type: ingredient.type,
                                        ml,
                                      },
                                    ];
                                  })
                                  .sort((a, b) => {
                                    const typeA = typePriority[a.type] ?? 99;
                                    const typeB = typePriority[b.type] ?? 99;
                                    if (typeA !== typeB) return typeA - typeB;
                                    if (a.ml !== b.ml) return b.ml - a.ml;
                                    return a.name.localeCompare(b.name);
                                  })
                                  .map((row) => (
                                    <div
                                      key={row.key}
                                      className="flex items-center justify-between gap-4"
                                    >
                                      <span className="font-medium text-[#151210]">
                                        {row.name}
                                      </span>
                                      <span>{row.ml} ml</span>
                                    </div>
                                  ))
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </>
          )}

          <div className="mt-6 flex flex-wrap gap-4">
            {step === "select" ? (
              <button
                type="button"
                onClick={() => setStep("quantity")}
                disabled={!canProceedToQuantities}
                className="rounded-full bg-[#6a2e2a] px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-[#f8f1e7] shadow-lg shadow-[#c47b4a]/30 hover:-translate-y-0.5 disabled:opacity-60"
              >
                Next: Add Quantities
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setStep("select")}
                  className="rounded-full border border-[#6a2e2a]/30 bg-white/70 px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-[#6a2e2a] hover:-translate-y-0.5"
                >
                  Back
                </button>
                <button
                  onClick={handleCreateOrderList}
                  disabled={!canCreateOrder}
                  className="rounded-full bg-[#6a2e2a] px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-[#f8f1e7] shadow-lg shadow-[#c47b4a]/30 hover:-translate-y-0.5 disabled:opacity-60"
                >
                  Create Order List
                </button>
              </>
            )}
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
                <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-[#6a2e2a]">
                  Date of Event
                  <input
                    type="date"
                    value={eventDate}
                    onChange={(event) => setEventDate(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-[#c47b4a]/30 bg-white/80 px-4 py-3 text-sm"
                  />
                </label>
                <input
                  type="email"
                  value={clientEmail}
                  onChange={(event) => setClientEmail(event.target.value)}
                  placeholder="Your email"
                  className="rounded-2xl border border-[#c47b4a]/30 bg-white/80 px-4 py-3 text-sm"
                />
                <input
                  type="tel"
                  value={clientPhone}
                  onChange={(event) => setClientPhone(event.target.value)}
                  placeholder="Telephone number"
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
