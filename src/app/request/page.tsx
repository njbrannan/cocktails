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
import { loadCachedRecipes, saveCachedRecipes } from "@/lib/offlineRecipes";
import { useEdgeSwipeNav } from "@/hooks/useEdgeSwipeNav";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

const ORDER_STORAGE_KEY = "get-involved:order:v1";

function parseNonNegativeInt(raw: string) {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isSafeInteger(n)) return null;
  return n;
}

function parsePositiveNumber(raw: string) {
  const trimmed = raw.trim().replace(",", ".");
  if (trimmed === "") return null;
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) return null;
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
  purchase_url?: string | null;
  price?: number | null;
  ingredient_packs?: Array<{
    pack_size: number;
    pack_price: number;
    purchase_url?: string | null;
    tier?: "budget" | "premium" | null;
    is_active: boolean;
  }> | null;
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
  const [menuLoading, setMenuLoading] = useState(true);
  const [menuLoadedOnce, setMenuLoadedOnce] = useState(false);
  const [selectedRecipeIds, setSelectedRecipeIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [servingsByRecipeId, setServingsByRecipeId] = useState<
    Record<string, string>
  >({});
  const [guestCountInput, setGuestCountInput] = useState("");
  const [drinksPerGuestInput, setDrinksPerGuestInput] = useState("2");
  const drinksPerGuest = useMemo(() => {
    const n = parsePositiveNumber(drinksPerGuestInput);
    return n ?? 2;
  }, [drinksPerGuestInput]);
  const [occasion, setOccasion] = useState<Occasion>("relaxed");
  const [customOccasionName, setCustomOccasionName] = useState("");
  const [hasManualQuantities, setHasManualQuantities] = useState(false);
  const [ingredientsOpenByRecipeId, setIngredientsOpenByRecipeId] = useState<
    Record<string, boolean>
  >({});
  const [swipeOffsetByRecipeId, setSwipeOffsetByRecipeId] = useState<Record<string, number>>(
    {},
  );
  const swipeDragRef = useRef<{
    id: string | null;
    startX: number;
    startY: number;
    startOffset: number;
    lastOffset: number;
    active: boolean;
    // We wait until the user clearly swipes horizontally before taking over.
    directionLocked: "x" | "y" | null;
    rowEl: HTMLElement | null;
    foregroundEl: HTMLElement | null;
    revealEl: HTMLElement | null;
  }>({
    id: null,
    startX: 0,
    startY: 0,
    startOffset: 0,
    lastOffset: 0,
    active: false,
    directionLocked: null,
    rowEl: null,
    foregroundEl: null,
    revealEl: null,
  });
  const [swipeDraggingId, setSwipeDraggingId] = useState<string | null>(null);
  const [swipeOpenRecipeId, setSwipeOpenRecipeId] = useState<string | null>(null);
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

  const nonAlcoholicLink = (
    <a
      href="https://www.getinvolved.com.au/cocktails/virgin-espresso-martini"
      target="_blank"
      rel="noreferrer noopener"
      className="underline underline-offset-2"
    >
      non-alcoholic options
    </a>
  );

  const occasionGuidance = (value: Occasion): ReactNode => {
    switch (value) {
      case "relaxed":
        return (
          <>
            Light planning: allow time for food, water, and {nonAlcoholicLink}. This
            planner estimates total stock required, not consumption.
          </>
        );
      case "cocktail":
        return (
          <>
            A classic pace is 1–2 cocktails per guest per hour, alongside water and{" "}
            {nonAlcoholicLink}. This planner estimates total stock required, not
            consumption.
          </>
        );
      case "wedding":
        return (
          <>
            Weddings vary a lot—plan for a steady flow plus water and {nonAlcoholicLink}.
            This planner estimates total stock required, not consumption.
          </>
        );
      case "big-night":
        return (
          <>
            Provide approximately 1–2 cocktails per guest per hour, alongside water and{" "}
            {nonAlcoholicLink}. This planner estimates total stock required, not
            consumption.
          </>
        );
      case "custom":
        return (
          <>
            You’re in control—consider event length, food, water, and {nonAlcoholicLink}.
            This planner estimates total stock required, not consumption.
          </>
        );
      default:
        return null;
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

  const suggestedTotalDrinks = useMemo(() => {
    if (!guestCount) return null;
    // If drinksPerGuest is a decimal, round up so we never under-shoot.
    return Math.ceil(guestCount * drinksPerGuest);
  }, [guestCount, drinksPerGuest]);

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

  useEffect(() => {
    if (!swipeOpenRecipeId) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      // If they tap the red bin button, let the click happen.
      if (target.closest("[data-swipe-trash='1']")) return;

      // If they tap anywhere outside the currently-open row, close it (iOS-style).
      if (!target.closest(`[data-swipe-row='${swipeOpenRecipeId}']`)) {
        setSwipeOffsetByRecipeId((prev) => ({ ...prev, [swipeOpenRecipeId]: 0 }));
        setSwipeOpenRecipeId(null);
      }
    };

    window.addEventListener("pointerdown", onPointerDown, { capture: true });
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, { capture: true } as any);
    };
  }, [swipeOpenRecipeId]);

  const loadMenu = async () => {
    setError(null);
    setMenuLoading(true);
    const selectWithPacks =
      "id, name, description, image_url, recipe_ingredients(ml_per_serving, ingredients(id, name, type, unit, bottle_size_ml, purchase_url, price, ingredient_packs(pack_size, pack_price, purchase_url, tier, is_active)))";
    const selectWithoutPacks =
      "id, name, description, image_url, recipe_ingredients(ml_per_serving, ingredients(id, name, type, unit, bottle_size_ml, purchase_url, price))";

    let { data, error: recipeError } = await supabase
      .from("recipes")
      .select(selectWithPacks)
      .eq("is_active", true);

    if (
      recipeError &&
      (String((recipeError as any).code || "") === "42703" ||
        String(recipeError.message || "").toLowerCase().includes("ingredient_packs"))
    ) {
      ({ data, error: recipeError } = await supabase
        .from("recipes")
        .select(selectWithoutPacks)
        .eq("is_active", true));
    }

    if (recipeError) {
      // If offline (or Supabase is unreachable), fall back to the last cached menu.
      const cached = loadCachedRecipes<Recipe>();
      if (cached?.recipes?.length) {
        setRecipes([...cached.recipes].sort((a, b) => a.name.localeCompare(b.name)));
        setMenuLoadedOnce(true);
        setMenuLoading(false);
        return;
      }
      setError(recipeError.message);
      setMenuLoadedOnce(true);
      setMenuLoading(false);
      return;
    }

    const list = ((data ?? []) as unknown as Recipe[]) || [];
    const sorted = [...list].sort((a, b) => a.name.localeCompare(b.name));
    setRecipes(sorted);
    saveCachedRecipes(sorted);
    setServingsByRecipeId((prev) => {
      const next = { ...prev };
      for (const recipe of sorted) {
        if (next[recipe.id] === undefined) {
          next[recipe.id] = "0";
        }
      }
      return next;
    });
    setMenuLoadedOnce(true);
    setMenuLoading(false);
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
        typeof parsed.drinksPerGuest === "number" &&
        Number.isFinite(parsed.drinksPerGuest) &&
        parsed.drinksPerGuest > 0
          ? String(parsed.drinksPerGuest)
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

    // If drinksPerGuest is a decimal, round total drinks up so we never under-shoot.
    const totalDrinks = Math.ceil(guestCount * drinksPerGuest);
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
    // Defer the heavy updates to the next tick so iOS <select> interactions stay snappy.
    window.setTimeout(() => applyGuestRecommendation(), 0);
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
            purchaseUrl: ingredient.purchase_url,
            price: ingredient.price ?? null,
            packOptions:
              ingredient.ingredient_packs
                ?.filter((p) => p?.is_active)
                .map((p) => ({
                  packSize: Number(p.pack_size),
                  packPrice: Number(p.pack_price),
                  purchaseUrl: p.purchase_url || null,
                  tier: (p.tier as any) || null,
                })) ?? null,
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

  useEdgeSwipeNav({
    canGoBack: step === "quantity",
    canGoForward:
      (step === "select" && canProceedToQuantities) ||
      (step === "quantity" && canCreateOrder),
    onBack: () => {
      if (step !== "quantity") return;
      setStep("select");
    },
    onForward: () => {
      if (step === "select") {
        if (!canProceedToQuantities) return;
        setStep("quantity");
        return;
      }
      if (step === "quantity") {
        if (!canCreateOrder) return;
        handleCreateOrderList();
      }
    },
  });

  return (
    <div className="min-h-screen hero-grid px-6 py-16">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <header>
          <p className="flex items-center justify-between gap-3 font-semibold uppercase tracking-[0.22em] text-accent">
            <a
              href="https://www.getinvolved.com.au"
              target="_blank"
              rel="noreferrer"
              className="whitespace-nowrap text-[13px] font-bold sm:text-sm"
            >
              Involved Events
            </a>
            <a
              href="https://www.getinvolved.com.au"
              target="_blank"
              rel="noreferrer"
              aria-label="Get Involved! Catering"
              className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full border border-subtle bg-white/70 shadow-sm hover:-translate-y-0.5"
            >
              <img
                src="/prawn-icon.png"
                alt=""
                aria-hidden="true"
                className="h-full w-full object-cover"
              />
            </a>
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

          {menuLoading ? (
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, idx) => (
                <div
                  key={idx}
                  className="overflow-hidden rounded-[26px] border border-subtle bg-white/70 shadow-sm"
                >
                  <div className="h-[180px] w-full animate-pulse bg-black/5" />
                  <div className="px-4 py-4">
                    <div className="h-5 w-3/4 animate-pulse rounded bg-black/5" />
                  </div>
                </div>
              ))}
            </div>
          ) : menuLoadedOnce && recipes.length === 0 ? (
            <p className="mt-4 text-sm text-muted">
              No cocktails available yet.
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
                        {/* Action hint: keep in one consistent place + style */}
                        <div className="pointer-events-none absolute right-3 top-3 rounded-full bg-white/70 px-2.5 py-0.5 text-[10px] font-semibold tracking-normal text-ink/80 backdrop-blur">
                          Tap to {isSelected ? "remove" : "add"}
                        </div>

                        {/* Cocktail name row (with selected tick on the same line) */}
                        <div className="pointer-events-none absolute inset-x-0 bottom-0 px-4 pb-4 pt-2 text-left">
                          <div
                            className="flex items-center justify-between gap-3"
                            style={{
                              textShadow:
                                "0 1px 0 rgba(255,255,255,0.9), 0 2px 10px rgba(255,255,255,0.35)",
                            }}
                          >
                            <p className="min-w-0 flex-1 truncate font-display text-lg text-ink">
                              {displayName}
                            </p>
                            {isSelected ? (
                              <span className="grid h-6 w-6 place-items-center rounded-full gi-selected-chip text-[14px] font-black leading-none shadow-sm">
                                ✓
                              </span>
                            ) : null}
                          </div>
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
                              <option value="big-night">Big Celebration</option>
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
                                step="0.1"
                                inputMode="decimal"
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
                          const totalSuggested = Math.ceil(guests * drinksPerGuest);

                          if (occasion === "custom") {
                            return (
                              <p className="mt-3 text-xs text-muted">
                                <span className="font-semibold text-ink">You choose</span>{" "}
                                how many cocktails{" "}
                                <span className="font-semibold text-ink">total</span> per
                                guest!
                              </p>
                            );
                          }

                          return (
                            <p className="mt-3 text-xs text-muted">
                              Suggested starting point:{" "}
                              <span className="font-semibold text-ink">
                                {drinksPerGuest}
                              </span>{" "}
                              cocktails <span className="font-semibold text-ink">total</span>{" "}
                              per guest
                              <span className="mt-1 block text-ink/60">
                                Suggested drinks: {totalSuggested}
                              </span>
                              <span className="mt-1 block text-[11px] leading-snug text-ink/60">
                                {occasionGuidance(occasion)}
                              </span>
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
                      const offset = swipeOffsetByRecipeId[recipe.id] ?? 0;
                      const DELETE_REVEAL_PX = 84;
                      // Full delete should be a deliberate second action: first swipe opens (reveals),
                      // then a follow-up long swipe deletes (iOS alarms style).
                      const FULL_SWIPE_DELETE_PX = 240;
                      const deleteRevealWidth = Math.max(
                        DELETE_REVEAL_PX,
                        Math.min(DELETE_REVEAL_PX * 2.4, -offset),
                      );

                      const removeRecipe = () => {
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
                      };

                      const closeSwipe = () => {
                        setSwipeOffsetByRecipeId((prev) => ({ ...prev, [recipe.id]: 0 }));
                        setSwipeOpenRecipeId((prev) => (prev === recipe.id ? null : prev));
                      };

                      const removeRecipeWithPop = (rowEl?: HTMLElement | null) => {
                        const el =
                          rowEl ??
                          (document.querySelector(
                            `[data-swipe-row='${recipe.id}']`,
                          ) as HTMLElement | null);

                        if (!el) {
                          removeRecipe();
                          closeSwipe();
                          return;
                        }

                        const height = el.getBoundingClientRect().height;
                        el.style.height = `${height}px`;
                        el.style.maxHeight = `${height}px`;
                        el.style.transition =
                          "height 180ms cubic-bezier(0.2, 0.85, 0.2, 1), opacity 150ms ease-out, transform 180ms cubic-bezier(0.2, 0.85, 0.2, 1)";
                        el.style.overflow = "hidden";
                        el.style.pointerEvents = "none";

                        requestAnimationFrame(() => {
                          el.style.height = "0px";
                          el.style.maxHeight = "0px";
                          el.style.opacity = "0";
                          el.style.transform = "scale(0.98)";
                        });

                        window.setTimeout(() => {
                          // Don't cancel a new swipe that started on a different row.
                          setSwipeDraggingId((prev) =>
                            prev === recipe.id ? null : prev,
                          );
                          removeRecipe();
                          closeSwipe();
                        }, 190);
                      };
                      return (
                        <div
                          key={recipe.id}
                          data-swipe-row={recipe.id}
                          className="relative overflow-hidden rounded-[28px] border border-subtle bg-white/70"
                        >
                          {/* Swipe-reveal delete action (tap trash) */}
                          <div
                            data-swipe-reveal="1"
                            className="absolute inset-y-0 right-0 flex items-center justify-center bg-red-600/90"
                            style={{
                              width: `${deleteRevealWidth}px`,
                              transition:
                                swipeDraggingId === recipe.id
                                  ? "none"
                                  : "width 200ms cubic-bezier(0.2, 0.85, 0.2, 1)",
                            }}
                            onPointerDown={(event) => {
                              if (
                                (event as any).button !== undefined &&
                                (event as any).button !== 0
                              )
                                return;

                              const target = event.target as HTMLElement | null;
                              if (target?.closest("[data-swipe-trash='1']")) return;

                              const rowEl = (event.currentTarget as HTMLElement).closest(
                                `[data-swipe-row='${recipe.id}']`,
                              ) as HTMLElement | null;

                              swipeDragRef.current.id = recipe.id;
                              swipeDragRef.current.startX = event.clientX;
                              swipeDragRef.current.startY = event.clientY;
                              swipeDragRef.current.startOffset =
                                swipeOffsetByRecipeId[recipe.id] ?? 0;
                              swipeDragRef.current.lastOffset =
                                swipeDragRef.current.startOffset;
                              swipeDragRef.current.active = true;
                              swipeDragRef.current.directionLocked = null;
                              swipeDragRef.current.rowEl = rowEl;
                              swipeDragRef.current.revealEl =
                                event.currentTarget as HTMLElement;
                              swipeDragRef.current.foregroundEl =
                                (rowEl?.querySelector(
                                  "[data-swipe-foreground='1']",
                                ) as HTMLElement | null) ?? null;

                              setSwipeDraggingId(recipe.id);
                              try {
                                (event.currentTarget as any).setPointerCapture?.(
                                  event.pointerId,
                                );
                              } catch {}
                            }}
                            onPointerMove={(event) => {
                              if (!swipeDragRef.current.active) return;
                              if (swipeDragRef.current.id !== recipe.id) return;
                              const dx = event.clientX - swipeDragRef.current.startX;
                              const dy = event.clientY - swipeDragRef.current.startY;

                              if (!swipeDragRef.current.directionLocked) {
                                const absX = Math.abs(dx);
                                const absY = Math.abs(dy);
                                if (absX < 6 && absY < 6) return;
                                swipeDragRef.current.directionLocked =
                                  absX > absY ? "x" : "y";
                              }
                              if (swipeDragRef.current.directionLocked === "y") return;

                              const allowFullDelete =
                                swipeDragRef.current.startOffset < 0;
                              const maxLeft = allowFullDelete
                                ? -FULL_SWIPE_DELETE_PX
                                : -DELETE_REVEAL_PX;
                              const next = Math.max(
                                maxLeft,
                                Math.min(
                                  0,
                                  swipeDragRef.current.startOffset + dx,
                                ),
                              );

                              swipeDragRef.current.lastOffset = next;
                              swipeDragRef.current.foregroundEl?.style.setProperty(
                                "transform",
                                `translateX(${next}px)`,
                              );
                              const w = Math.max(
                                DELETE_REVEAL_PX,
                                Math.min(DELETE_REVEAL_PX * 2.4, -next),
                              );
                              swipeDragRef.current.revealEl?.style.setProperty(
                                "width",
                                `${w}px`,
                              );
                            }}
                            onPointerUp={() => {
                              if (!swipeDragRef.current.active) return;
                              if (swipeDragRef.current.id !== recipe.id) return;
                              const wasOpen = swipeDragRef.current.startOffset < 0;
                              const cur =
                                swipeDragRef.current.lastOffset ??
                                swipeDragRef.current.startOffset;

                              swipeDragRef.current.active = false;
                              swipeDragRef.current.directionLocked = null;

                              if (wasOpen && cur <= -FULL_SWIPE_DELETE_PX + 10) {
                                const rowEl = swipeDragRef.current.rowEl;
                                swipeDragRef.current.id = null;
                                swipeDragRef.current.rowEl = null;
                                swipeDragRef.current.foregroundEl = null;
                                swipeDragRef.current.revealEl = null;
                                removeRecipeWithPop(rowEl);
                                return;
                              }

                              setSwipeDraggingId(null);
                              const shouldOpen = cur <= -DELETE_REVEAL_PX / 2;
                              const snap = shouldOpen ? -DELETE_REVEAL_PX : 0;
                              setSwipeOffsetByRecipeId((prev) => ({
                                ...prev,
                                [recipe.id]: snap,
                              }));
                              setSwipeOpenRecipeId(shouldOpen ? recipe.id : null);

                              swipeDragRef.current.id = null;
                              swipeDragRef.current.rowEl = null;
                              swipeDragRef.current.foregroundEl = null;
                              swipeDragRef.current.revealEl = null;
                            }}
                            onPointerCancel={() => {
                              if (!swipeDragRef.current.active) return;
                              if (swipeDragRef.current.id !== recipe.id) return;
                              swipeDragRef.current.active = false;
                              swipeDragRef.current.directionLocked = null;
                              setSwipeDraggingId(null);
                              swipeDragRef.current.id = null;
                              swipeDragRef.current.rowEl = null;
                              swipeDragRef.current.foregroundEl = null;
                              swipeDragRef.current.revealEl = null;
                              closeSwipe();
                            }}
                          >
                            <button
                              type="button"
                              onClick={(event) => {
                                const rowEl = (event.currentTarget as HTMLElement).closest(
                                  `[data-swipe-row='${recipe.id}']`,
                                ) as HTMLElement | null;
                                removeRecipeWithPop(rowEl);
                              }}
                              data-swipe-trash="1"
                              className="grid h-10 w-10 place-items-center rounded-2xl bg-white/15 text-white hover:bg-white/20"
                              aria-label={`Remove ${displayName}`}
                              title="Remove"
                            >
                              <svg
                                viewBox="0 0 24 24"
                                width="20"
                                height="20"
                                aria-hidden="true"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M3 6h18" />
                                <path d="M8 6V4h8v2" />
                                <path d="M6 6l1 16h10l1-16" />
                                <path d="M10 11v6" />
                                <path d="M14 11v6" />
                              </svg>
                            </button>
                          </div>

                          {/* Foreground card (draggable) */}
                          <div
                            data-swipe-foreground="1"
                            className={`relative grid w-full max-w-full items-start gap-4 bg-white p-5 ${
                              ingredientsOpen ? "md:grid-cols-[240px_1fr]" : "md:grid-cols-[240px]"
                            }`}
                            onPointerDown={(event) => {
                              // Only handle primary pointer (finger/mouse). Don't interfere with inputs.
                              if ((event as any).button !== undefined && (event as any).button !== 0)
                                return;
                              const target = event.target as HTMLElement | null;
                              const tag = (target?.tagName || "").toLowerCase();
                              if (
                                target?.closest(
                                  "input, textarea, select, button, a, [data-no-swipe='1']",
                                )
                              )
                                return;
                              if ((target as any)?.isContentEditable) return;

                              // Close any other open swipe row.
                              if (swipeOpenRecipeId && swipeOpenRecipeId !== recipe.id) {
                                setSwipeOffsetByRecipeId((prev) => ({
                                  ...prev,
                                  [swipeOpenRecipeId]: 0,
                                }));
                                setSwipeOpenRecipeId(null);
                              }

                              const rowEl = (event.currentTarget as HTMLElement).closest(
                                `[data-swipe-row='${recipe.id}']`,
                              ) as HTMLElement | null;

                              swipeDragRef.current.id = recipe.id;
                              swipeDragRef.current.startX = event.clientX;
                              swipeDragRef.current.startY = event.clientY;
                              swipeDragRef.current.startOffset =
                                swipeOffsetByRecipeId[recipe.id] ?? 0;
                              swipeDragRef.current.lastOffset =
                                swipeDragRef.current.startOffset;
                              swipeDragRef.current.active = true;
                              swipeDragRef.current.directionLocked = null;
                              swipeDragRef.current.rowEl = rowEl;
                              swipeDragRef.current.foregroundEl =
                                event.currentTarget as HTMLElement;
                              swipeDragRef.current.revealEl =
                                (rowEl?.querySelector(
                                  "[data-swipe-reveal='1']",
                                ) as HTMLElement | null) ?? null;
                              setSwipeDraggingId(recipe.id);
                              try {
                                (event.currentTarget as any).setPointerCapture?.(event.pointerId);
                              } catch {}
                            }}
                            onPointerMove={(event) => {
                              if (!swipeDragRef.current.active) return;
                              if (swipeDragRef.current.id !== recipe.id) return;
                              const dx = event.clientX - swipeDragRef.current.startX;
                              const dy = event.clientY - swipeDragRef.current.startY;

                              // If the user is scrolling vertically, don't hijack the gesture.
                              if (!swipeDragRef.current.directionLocked) {
                                const absX = Math.abs(dx);
                                const absY = Math.abs(dy);
                                if (absX < 6 && absY < 6) return;
                                swipeDragRef.current.directionLocked = absX > absY ? "x" : "y";
                              }
                              if (swipeDragRef.current.directionLocked === "y") return;

                              // We only reveal to the left; clamp between -DELETE_REVEAL_PX and 0.
                              // First swipe: clamp to the reveal width.
                              // Second swipe (starting with row already open): allow a longer, deliberate swipe-to-delete.
                              const allowFullDelete = swipeDragRef.current.startOffset < 0;
                              const maxLeft = allowFullDelete
                                ? -FULL_SWIPE_DELETE_PX
                                : -DELETE_REVEAL_PX;
                              const next = Math.max(
                                maxLeft,
                                Math.min(0, swipeDragRef.current.startOffset + dx),
                              );
                              swipeDragRef.current.lastOffset = next;
                              swipeDragRef.current.foregroundEl?.style.setProperty(
                                "transform",
                                `translateX(${next}px)`,
                              );
                              const w = Math.max(
                                DELETE_REVEAL_PX,
                                Math.min(DELETE_REVEAL_PX * 2.4, -next),
                              );
                              swipeDragRef.current.revealEl?.style.setProperty(
                                "width",
                                `${w}px`,
                              );
                            }}
                            onPointerUp={() => {
                              if (!swipeDragRef.current.active) return;
                              if (swipeDragRef.current.id !== recipe.id) return;
                              const wasOpen = swipeDragRef.current.startOffset < 0;
                              const cur =
                                swipeDragRef.current.lastOffset ??
                                swipeDragRef.current.startOffset;

                              swipeDragRef.current.active = false;
                              swipeDragRef.current.directionLocked = null;

                              if (wasOpen && cur <= -FULL_SWIPE_DELETE_PX + 10) {
                                const rowEl = swipeDragRef.current.rowEl;
                                swipeDragRef.current.id = null;
                                swipeDragRef.current.rowEl = null;
                                swipeDragRef.current.foregroundEl = null;
                                swipeDragRef.current.revealEl = null;
                                removeRecipeWithPop(rowEl);
                                return;
                              }

                              setSwipeDraggingId(null);
                              const shouldOpen = cur <= -DELETE_REVEAL_PX / 2;
                              const snap = shouldOpen ? -DELETE_REVEAL_PX : 0;
                              setSwipeOffsetByRecipeId((prev) => ({
                                ...prev,
                                [recipe.id]: snap,
                              }));
                              setSwipeOpenRecipeId(shouldOpen ? recipe.id : null);

                              swipeDragRef.current.id = null;
                              swipeDragRef.current.rowEl = null;
                              swipeDragRef.current.foregroundEl = null;
                              swipeDragRef.current.revealEl = null;
                            }}
                            onPointerCancel={() => {
                              if (!swipeDragRef.current.active) return;
                              if (swipeDragRef.current.id !== recipe.id) return;
                              swipeDragRef.current.active = false;
                              swipeDragRef.current.directionLocked = null;
                              setSwipeDraggingId(null);
                              swipeDragRef.current.id = null;
                              swipeDragRef.current.rowEl = null;
                              swipeDragRef.current.foregroundEl = null;
                              swipeDragRef.current.revealEl = null;
                              closeSwipe();
                            }}
                            // Let the page scroll vertically like normal; we only capture once we detect horizontal intent.
                            // This makes the gesture feel closer to iOS native list swipe.
                            // eslint-disable-next-line react/style-prop-object
                            style={{
                              transform: `translateX(${offset}px)`,
                              touchAction: "pan-y",
                              transition:
                                swipeDraggingId === recipe.id
                                  ? "none"
                                  : "transform 200ms cubic-bezier(0.2, 0.85, 0.2, 1)",
                            }}
                          >
                            <div className="space-y-3">
                            <div className="flex min-w-0 items-center gap-3 pr-2">
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
                                className="mt-2 w-full min-w-0 max-w-full rounded-2xl border border-soft bg-white/80 px-4 py-3 text-[16px] tracking-normal tabular-nums text-ink"
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
                              data-no-swipe="1"
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
                                        className="flex min-w-0 items-center justify-between gap-4"
                                      >
                                        <span className="min-w-0 flex-1 break-words font-medium text-ink">
                                          {row.name}
                                        </span>
                                        <span className="shrink-0">
                                          {row.amount} {row.unit}
                                        </span>
                                      </div>
                                    ))
                                )}
                              </div>
                            </div>
                          ) : null}
                          </div>
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
                <div className="flex w-full flex-col gap-3">
                    <div className="flex w-full items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => setStep("select")}
                        className="gi-btn-secondary px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.25em] hover:-translate-y-0.5"
                      >
                        Back
                      </button>

                    <div className="-mt-0.5 text-right text-[12px] text-muted">
                      <p>
                        <span className="font-semibold text-ink">Suggested drinks:</span>{" "}
                        {suggestedTotalDrinks ?? "—"}
                      </p>
                      <p className="mt-0.5">
                        <span className="font-semibold text-ink">Number of drinks:</span>{" "}
                        {totalDrinksInput}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={handleCreateOrderList}
                    disabled={!canCreateOrder}
                    className="gi-btn-primary w-full px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] shadow-lg shadow-[#c47b4a]/30 hover:-translate-y-0.5 disabled:opacity-60"
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
