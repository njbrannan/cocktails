"use client";

import { buildIngredientTotals } from "@/lib/inventoryMath";
import { supabase } from "@/lib/supabaseClient";
import {
  COCKTAIL_PLACEHOLDER_IMAGE,
  normalizeCocktailDisplayName,
  resolveCocktailImageSrc,
  resolveNextCocktailImageSrc,
  resolveSvgFallbackForImageSrc,
} from "@/lib/cocktailImages";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const ORDER_STORAGE_KEY = "get-involved:order:v1";

function parseNonNegativeInt(raw: string) {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isSafeInteger(n)) return null;
  return n;
}

type Ingredient = {
  id: string;
  name: string;
  type:
    | "liquor"
    | "mixer"
    | "juice"
    | "syrup"
    | "garnish"
    | "ice"
    | "glassware";
  bottle_size_ml: number | null;
  unit: string | null;
};

type RecipeIngredient = {
  // NOTE: This column is named `ml_per_serving` in Supabase, but we treat it as
  // "amount per serving" and rely on `ingredients.unit` to format + round.
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

const typePriority: Record<string, number> = {
  liquor: 0,
  mixer: 1,
  juice: 2,
  syrup: 3,
  garnish: 4,
  ice: 5,
  glassware: 6,
};

export default function RequestPage() {
  const router = useRouter();

  type Occasion = "relaxed" | "cocktail" | "wedding" | "big-night" | "custom";

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [selectedRecipeIds, setSelectedRecipeIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [servingsByRecipeId, setServingsByRecipeId] = useState<
    Record<string, string>
  >({});
  const [guestCountInput, setGuestCountInput] = useState("");
  const [drinksPerGuestInput, setDrinksPerGuestInput] = useState("2");
  const drinksPerGuest = useMemo(() => {
    const n = parseNonNegativeInt(drinksPerGuestInput);
    return n && n > 0 ? n : 2;
  }, [drinksPerGuestInput]);
  const [occasion, setOccasion] = useState<Occasion>("relaxed");
  const [customOccasionName, setCustomOccasionName] = useState("");
  const [hasManualQuantities, setHasManualQuantities] = useState(false);
  const [ingredientsOpenByRecipeId, setIngredientsOpenByRecipeId] = useState<
    Record<string, boolean>
  >({});
  const [undoRemoval, setUndoRemoval] = useState<{
    recipeId: string;
    recipeName: string;
    expiresAt: number;
  } | null>(null);

  const [error, setError] = useState<string | null>(null);

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

  const drinksPerGuestForOccasion = (value: Occasion): 2 | 3 | 4 | null => {
    switch (value) {
      case "relaxed":
        return 2;
      case "cocktail":
        return 3;
      case "wedding":
        return 3;
      case "big-night":
        return 4;
      case "custom":
        return null;
      default:
        return 2;
    }
  };

  const selectedForQuantity = useMemo(() => {
    return recipes.filter((recipe) => selectedRecipeIds.has(recipe.id));
  }, [recipes, selectedRecipeIds]);

  const selectedForQuantityIdsKey = useMemo(() => {
    return selectedForQuantity.map((recipe) => recipe.id).join("|");
  }, [selectedForQuantity]);

  const guestCount = useMemo(() => {
    const n = parseNonNegativeInt(guestCountInput);
    return n && n > 0 ? n : null;
  }, [guestCountInput]);

  const canProceedToQuantities = selectedRecipeIds.size > 0;
  const [step, setStep] = useState<"select" | "quantity">("select");

  const canCreateOrder = selectedRecipes.length > 0;

  const totalDrinksInput = useMemo(() => {
    let sum = 0;
    for (const recipe of selectedForQuantity) {
      const raw = servingsByRecipeId[recipe.id] ?? "0";
      const n = parseNonNegativeInt(raw);
      if (n !== null) sum += n;
    }
    return sum;
  }, [selectedForQuantity, servingsByRecipeId]);

  useEffect(() => {
    // When switching steps, jump back to the top so the next screen starts at the header.
    window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
  }, [step]);

  useEffect(() => {
    if (!undoRemoval) return;
    const id = window.setInterval(() => {
      if (Date.now() >= undoRemoval.expiresAt) {
        setUndoRemoval(null);
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [undoRemoval]);

  const loadMenu = async () => {
    setError(null);
    const { data, error: recipeError } = await supabase
      .from("recipes")
      .select(
        "id, name, description, image_url, recipe_ingredients(ml_per_serving, ingredients(id, name, type, unit, bottle_size_ml))",
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

  useEffect(() => {
    // If the user came back from the order page, restore their previous selection + quantities.
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("resume") !== "1") return;
      const resumeStep = params.get("step"); // optional: "select" | "quantity"

      const raw = window.sessionStorage.getItem(ORDER_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as any;
      if (!parsed || parsed.version !== 1) return;

      const ids = Array.isArray(parsed.selectedRecipeIds)
        ? (parsed.selectedRecipeIds as string[])
        : [];
      const servings =
        parsed.servingsByRecipeId && typeof parsed.servingsByRecipeId === "object"
          ? (parsed.servingsByRecipeId as Record<string, string>)
          : {};
      const guestsRaw = typeof parsed.guestCount === "number" ? String(parsed.guestCount) : "";
      const drinksPerGuestRaw =
        typeof parsed.drinksPerGuest === "number" && Number.isFinite(parsed.drinksPerGuest) && parsed.drinksPerGuest > 0
          ? String(Math.floor(parsed.drinksPerGuest))
          : "2";
      const occasionRaw =
        parsed.occasion === "relaxed" ||
        parsed.occasion === "cocktail" ||
        parsed.occasion === "wedding" ||
        parsed.occasion === "big-night" ||
        parsed.occasion === "custom"
          ? (parsed.occasion as Occasion)
          : "relaxed";
      const customOccasionRaw =
        typeof parsed.customOccasionName === "string"
          ? parsed.customOccasionName
          : "";

      setSelectedRecipeIds(new Set(ids));
      setServingsByRecipeId((prev) => ({ ...prev, ...servings }));
      if (guestsRaw) setGuestCountInput(guestsRaw);
      setDrinksPerGuestInput(drinksPerGuestRaw);
      setOccasion(occasionRaw);
      if (customOccasionRaw) setCustomOccasionName(customOccasionRaw);
      setStep(resumeStep === "select" ? "select" : "quantity");
    } catch {
      // Ignore restore issues.
    }
  }, []);

  useEffect(() => {
    // Occasion drives a default drinks-per-guest recommendation.
    // If they choose Custom, we leave the current value alone.
    const recommended = drinksPerGuestForOccasion(occasion);
    if (!recommended) return;
    setDrinksPerGuestInput(String(recommended));
  }, [occasion]);

  const applyGuestRecommendation = () => {
    const guestCount = parseNonNegativeInt(guestCountInput);
    if (!guestCount || guestCount <= 0) return;
    if (selectedForQuantity.length === 0) return;

    const totalDrinks = guestCount * drinksPerGuest;
    const n = selectedForQuantity.length;
    // Round up so every selected cocktail starts with the same integer quantity.
    // This makes it easier to scan and ensures we're never short on total drinks.
    const perCocktail = Math.max(0, Math.ceil(totalDrinks / n));

    setServingsByRecipeId((prev) => {
      const next = { ...prev };
      for (const recipe of selectedForQuantity) {
        next[recipe.id] = String(perCocktail);
      }
      return next;
    });
  };

  useEffect(() => {
    // When guests are provided, prefill a sensible starting point (2–4 drinks/guest),
    // evenly split across selected cocktails. Only auto-apply if the user hasn't started
    // manually editing quantities yet.
    if (step !== "quantity") return;
    if (hasManualQuantities) return;
    const guestCount = parseNonNegativeInt(guestCountInput);
    if (!guestCount || guestCount <= 0) return;
    if (selectedForQuantity.length === 0) return;
    applyGuestRecommendation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guestCountInput, drinksPerGuest, selectedForQuantityIdsKey, step, hasManualQuantities]);

  const handleCreateOrderList = () => {
    setError(null);

    // Aggregate by a normalized key so if you accidentally have duplicate ingredients
    // in Supabase (e.g. "Lime Juice" entered twice with different UUIDs), the order
    // list still combines them.
    const items = selectedRecipes.flatMap(({ recipe, servings }) =>
      (recipe.recipe_ingredients ?? []).flatMap((ri) => {
        const ingredient = normalizeIngredient(ri.ingredients);
        if (!ingredient) return [];

        const normalizedKey = `${ingredient.type}:${ingredient.name.trim().toLowerCase()}:${(ingredient.unit || "ml").trim().toLowerCase()}`;

        return [
          {
            ingredientId: normalizedKey,
            name: ingredient.name,
            type: ingredient.type,
            amountPerServing: ri.ml_per_serving,
            servings,
            unit: ingredient.unit,
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
      if (a.total !== b.total) return b.total - a.total;
      return a.name.localeCompare(b.name);
    });

    try {
      const cocktails = selectedRecipes.map(({ recipe, servings }) => ({
        recipeId: recipe.id,
        recipeName: normalizeCocktailDisplayName(recipe.name),
        servings,
      }));

      window.sessionStorage.setItem(
        ORDER_STORAGE_KEY,
        JSON.stringify({
          version: 1,
          createdAt: new Date().toISOString(),
          cocktails,
          orderList: totals,
          selectedRecipeIds: Array.from(selectedRecipeIds.values()),
          servingsByRecipeId,
          guestCount: parseNonNegativeInt(guestCountInput) || null,
          drinksPerGuest,
          occasion,
          customOccasionName: customOccasionName.trim() ? customOccasionName.trim() : null,
        }),
      );
    } catch {
      // If storage fails, we can still navigate; the order page will show a helpful message.
    }

    router.push("/request/order");
  };

  return (
    <div className="min-h-screen hero-grid px-6 py-16">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <header>
          <p className="flex items-baseline gap-2 font-semibold uppercase tracking-[0.22em] text-accent">
            <a
              href="https://www.getinvolved.com.au"
              target="_blank"
              rel="noreferrer"
              className="text-[13px] font-bold sm:text-sm"
            >
              Get Involved! Catering
            </a>
            <span className="text-[11px] sm:text-xs">with our</span>
          </p>
          <h1 className="mt-2 font-display text-4xl text-ink sm:text-5xl">
            Cocktail Party Planner
          </h1>
          <p className="mt-2 text-sm text-muted">
            Select cocktails, set quantities, then create your order list.
          </p>
        </header>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <div className="glass-panel rounded-[28px] px-8 py-6">
          <h2 className="font-display text-2xl text-accent">
            {step === "select" ? "Select cocktails" : "Set quantities"}
          </h2>
          <p className="mt-2 text-sm text-muted">
            {step === "select"
              ? "Tap the photos to select your cocktails."
              : "Add quantities and we’ll calculate ingredients per drink."}
          </p>

          {recipes.length === 0 ? (
            <p className="mt-4 text-sm text-muted">
              No cocktails found yet. Add recipes in Supabase (recipes + recipe_ingredients).
            </p>
          ) : (
            <>
              {step === "select" ? (
                <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                  {recipes.map((recipe) => {
                    const isSelected = selectedRecipeIds.has(recipe.id);
                    const imageSrc = resolveCocktailImageSrc(
                      recipe.image_url,
                      recipe.name,
                    );
                    const displayName = normalizeCocktailDisplayName(recipe.name);

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
                            ? "gi-selected"
                            : "border-subtle"
                        }`}
                      >
                        <div
                          className="relative h-[180px] w-full bg-white/80"
                        >
                          <img
                            src={imageSrc}
                            alt={recipe.name}
                            loading="lazy"
                            className="h-full w-full object-contain px-6 pb-14 pt-4"
                            onError={(event) => {
                              const img = event.currentTarget;
                              const stage = Number(img.dataset.fallbackStage || "0") || 0;
                              if (stage >= 3) {
                                img.src = COCKTAIL_PLACEHOLDER_IMAGE;
                                return;
                              }
                              const current = img.getAttribute("src") || "";
                              const next = resolveNextCocktailImageSrc(current);
                              img.dataset.fallbackStage = String(stage + 1);
                              img.src = next || COCKTAIL_PLACEHOLDER_IMAGE;
                            }}
                          />
                          {isSelected ? (
                            <div className="absolute left-3 top-3 rounded-full gi-selected-chip px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.25em]">
                              Selected
                            </div>
                          ) : null}

                          {/* Always show name + action text; keep it off the photo area */}
                          <div className="pointer-events-none absolute inset-x-0 bottom-0 px-4 pb-4 pt-2 text-left">
                            <p
                              className="font-display text-lg text-ink"
                              style={{
                                textShadow:
                                  "0 1px 0 rgba(255,255,255,0.9), 0 2px 10px rgba(255,255,255,0.35)",
                              }}
                            >
                              {displayName}
                            </p>
                          </div>

                          {/* Action hint bottom-right */}
                          <div className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-white/70 px-3 py-1 text-[11px] font-semibold tracking-normal text-ink/80 backdrop-blur">
                            Tap to {isSelected ? "remove" : "add"}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-6 grid gap-6">
                  {selectedForQuantity.length === 0 ? (
                    <p className="text-sm text-muted">
                      No cocktails selected yet.
                    </p>
                  ) : (
                    <>
                      <div className="rounded-[28px] border border-subtle bg-white/70 p-5">
                        <div className="grid gap-4 md:grid-cols-[1fr_1fr]">
                          <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-accent">
                            Occasion
                            <select
                              value={occasion}
                              onChange={(event) =>
                                setOccasion((event.target.value as Occasion) || "relaxed")
                              }
                              className="mt-2 h-[52px] w-full rounded-2xl border border-soft bg-white/80 px-4 text-[16px] tracking-normal text-ink"
                            >
                              <option value="relaxed">Dinner / relaxed</option>
                              <option value="cocktail">Cocktail party</option>
                              <option value="wedding">Wedding / celebration</option>
                              <option value="big-night">Big night</option>
                              <option value="custom">Custom</option>
                            </select>
                          </label>

                          <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-accent">
                            Number of guests
                            <input
                              type="number"
                              min={1}
                              inputMode="numeric"
                              value={guestCountInput}
                              onChange={(event) => setGuestCountInput(event.target.value)}
                              className="mt-2 w-full rounded-2xl border border-soft bg-white/80 px-4 py-3 text-[16px]"
                            />
                          </label>
                        </div>

                        {occasion === "custom" ? (
                          <div className="mt-4">
                            <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-accent">
                              Event type
                              <input
                                type="text"
                                value={customOccasionName}
                                onChange={(event) =>
                                  setCustomOccasionName(event.target.value)
                                }
                                placeholder="e.g. Birthday, corporate, wedding..."
                                className="mt-2 w-full rounded-2xl border border-soft bg-white/80 px-4 py-3 text-[16px] tracking-normal text-ink"
                              />
                            </label>
                            <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-accent">
                              Drinks per guest
                              <input
                                type="number"
                                min={1}
                                inputMode="numeric"
                                value={drinksPerGuestInput}
                                onChange={(event) => setDrinksPerGuestInput(event.target.value)}
                                className="mt-2 w-full rounded-2xl border border-soft bg-white/80 px-4 py-3 text-[16px]"
                              />
                            </label>
                          </div>
                        ) : null}

                        {(() => {
                          const guests = parseNonNegativeInt(guestCountInput);
                          if (!guests || guests <= 0) return null;
                          if (occasion === "custom") {
                            return (
                              <p className="mt-3 text-sm text-muted">
                                <span className="font-semibold text-ink">
                                  You choose
                                </span>{" "}
                                how many cocktails{" "}
                                <span className="font-semibold text-ink">total</span>{" "}
                                per guest!
                              </p>
                            );
                          }
                          return (
                            <p className="mt-3 text-sm text-muted">
                              Suggested starting point:
                              <br />
                              <span className="font-semibold text-ink">
                                {drinksPerGuest}
                              </span>{" "}
                              cocktails <span className="font-semibold text-ink">total</span> per guest.
                            </p>
                          );
                        })()}
                      </div>

                      {selectedForQuantity.map((recipe) => {
                      const servingsRaw = servingsByRecipeId[recipe.id] ?? "";
                      const servings = Number(servingsRaw || "0") || 0;
                      const perGuest =
                        guestCount && guestCount > 0 ? servings / guestCount : null;
                      const perGuestLabel =
                        perGuest === null
                          ? null
                          : Number.isFinite(perGuest)
                            ? perGuest
                                .toFixed(2)
                                .replace(/\.00$/, "")
                                .replace(/(\.\d)0$/, "$1")
                            : null;
                      const ingredientsOpen = Boolean(
                        ingredientsOpenByRecipeId[recipe.id],
                      );
                      const imageSrc = resolveCocktailImageSrc(
                        recipe.image_url,
                        recipe.name,
                      );
                      const displayName = normalizeCocktailDisplayName(recipe.name);
                      return (
                        <div
                          key={recipe.id}
                          className={`relative grid gap-4 rounded-[28px] border border-subtle bg-white/70 p-5 ${
                            ingredientsOpen ? "md:grid-cols-[240px_1fr]" : "md:grid-cols-[240px]"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedRecipeIds((prev) => {
                                const next = new Set(prev);
                                next.delete(recipe.id);
                                return next;
                              });
                              setIngredientsOpenByRecipeId((prev) => ({
                                ...prev,
                                [recipe.id]: false,
                              }));
                              setUndoRemoval({
                                recipeId: recipe.id,
                                recipeName: displayName,
                                expiresAt: Date.now() + 4000,
                              });
                            }}
                            className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-black/10 bg-white/60 text-accent shadow-sm hover:bg-white/80"
                            aria-label={`Remove ${displayName}`}
                            title="Remove"
                          >
                            <span className="text-lg leading-none">×</span>
                          </button>
                          <div className="space-y-3">
                            <div className="flex min-w-0 items-center gap-3">
                              <div className="h-9 w-9 shrink-0 overflow-hidden rounded-xl border border-black/10 bg-white/70 p-1">
                                <img
                                  src={imageSrc}
                                  alt=""
                                  aria-hidden="true"
                                  className="h-full w-full object-contain"
                                  onError={(event) => {
                                    const img = event.currentTarget;
                                    const stage = Number(img.dataset.fallbackStage || "0") || 0;
                                    if (stage >= 3) {
                                      img.src = COCKTAIL_PLACEHOLDER_IMAGE;
                                      return;
                                    }
                                    const current = img.getAttribute("src") || "";
                                    const next = resolveNextCocktailImageSrc(current);
                                    img.dataset.fallbackStage = String(stage + 1);
                                    img.src = next || COCKTAIL_PLACEHOLDER_IMAGE;
                                  }}
                                />
                              </div>
                              <h3 className="min-w-0 truncate font-display text-lg text-ink">
                                {displayName}
                              </h3>
                            </div>
                            <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-accent">
                              <span className="flex items-baseline justify-between gap-3">
                                <span>Quantity</span>
                                {perGuestLabel !== null ? (
                                  <span className="text-[11px] font-semibold tracking-normal text-ink-muted">
                                    ({perGuestLabel} per guest)
                                  </span>
                                ) : null}
                              </span>
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
                                onChange={(event) => {
                                  setHasManualQuantities(true);
                                  setServingsByRecipeId((prev) => ({
                                    ...prev,
                                    [recipe.id]: event.target.value,
                                  }));
                                }}
                                // iOS Safari zooms when inputs are < 16px font-size.
                                className="mt-2 w-full rounded-2xl border border-soft bg-white/80 px-4 py-3 text-[16px]"
                              />
                            </label>

                            <button
                              type="button"
                              onClick={() =>
                                setIngredientsOpenByRecipeId((prev) => ({
                                  ...prev,
                                  [recipe.id]: !prev[recipe.id],
                                }))
                              }
                              className="w-fit appearance-none bg-transparent p-0 text-[11px] font-semibold text-accent underline underline-offset-2"
                            >
                              {ingredientsOpen ? "Hide ingredients" : "Show ingredients"}
                            </button>
                          </div>

                          {ingredientsOpen ? (
                            <div className="rounded-3xl border border-[#6a2e2a]/10 bg-white/80 px-5 py-4">
                              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
                                {servings > 0
                                  ? `Ingredients (for ${servings})`
                                  : "Ingredients (per cocktail)"}
                              </p>
                              <div className="mt-3 grid gap-2 text-sm text-muted">
                                {recipe.recipe_ingredients.length === 0 ? (
                                  <p className="text-sm text-muted">
                                    No ingredients added yet.
                                  </p>
                                ) : (
                                  (recipe.recipe_ingredients ?? [])
                                    .flatMap((ri, index) => {
                                      const ingredient = normalizeIngredient(ri.ingredients);
                                      if (!ingredient) return [];
                                      const amount =
                                        servings > 0
                                          ? ri.ml_per_serving * servings
                                          : ri.ml_per_serving;
                                      return [
                                        {
                                          key: `${recipe.id}-${index}`,
                                          name: ingredient.name,
                                          type: ingredient.type,
                                          amount,
                                          unit: (ingredient.unit || "ml")
                                            .trim()
                                            .toLowerCase(),
                                        },
                                      ];
                                    })
                                    .sort((a, b) => {
                                      const typeA = typePriority[a.type] ?? 99;
                                      const typeB = typePriority[b.type] ?? 99;
                                      if (typeA !== typeB) return typeA - typeB;
                                      if (a.amount !== b.amount) return b.amount - a.amount;
                                      return a.name.localeCompare(b.name);
                                    })
                                    .map((row) => (
                                      <div
                                        key={row.key}
                                        className="flex items-center justify-between gap-4"
                                      >
                                        <span className="font-medium text-ink">
                                          {row.name}
                                        </span>
                                        <span>
                                          {row.amount} {row.unit}
                                        </span>
                                      </div>
                                    ))
                                )}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                    </>
                  )}
                </div>
              )}
            </>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
            {step === "select" ? (
              <button
                type="button"
                onClick={() => setStep("quantity")}
                disabled={!canProceedToQuantities}
                className="gi-btn-primary px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] shadow-lg shadow-[#c47b4a]/30 hover:-translate-y-0.5 disabled:opacity-60"
              >
                Next: Add Quantities
              </button>
            ) : (
              <>
                <div className="flex w-full flex-col items-end gap-3">
                  <div className="flex w-full items-start justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setStep("select")}
                      className="gi-btn-secondary px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.25em] hover:-translate-y-0.5"
                    >
                      Back
                    </button>

                    <div className="text-right text-sm text-muted">
                      <p>
                        <span className="font-semibold text-ink">Number of guests:</span>{" "}
                        {guestCount ?? "—"}
                      </p>
                      <p className="mt-1">
                        <span className="font-semibold text-ink">Number of drinks:</span>{" "}
                        {totalDrinksInput}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={handleCreateOrderList}
                    disabled={!canCreateOrder}
                    className="gi-btn-primary px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] shadow-lg shadow-[#c47b4a]/30 hover:-translate-y-0.5 disabled:opacity-60"
                  >
                    Create Order List
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {undoRemoval && step === "quantity" ? (
          <div className="fixed inset-x-0 bottom-6 z-50 px-6">
            <div className="mx-auto flex w-full max-w-xl items-center justify-between gap-4 rounded-2xl border border-black/10 bg-white/90 px-5 py-4 shadow-lg">
              <p className="text-sm text-ink">
                Removed <span className="font-semibold">{undoRemoval.recipeName}</span>
              </p>
              <button
                type="button"
                onClick={() => {
                  setSelectedRecipeIds((prev) => {
                    const next = new Set(prev);
                    next.add(undoRemoval.recipeId);
                    return next;
                  });
                  setUndoRemoval(null);
                }}
                className="gi-btn-primary px-5 py-2 text-xs font-semibold uppercase tracking-[0.25em] hover:-translate-y-0.5"
              >
                Undo
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
