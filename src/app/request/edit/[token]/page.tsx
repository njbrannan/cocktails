"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { buildIngredientTotals } from "@/lib/inventoryMath";
import { supabase } from "@/lib/supabaseClient";
import {
  COCKTAIL_PLACEHOLDER_IMAGE,
  normalizeCocktailDisplayName,
  resolveCocktailImageSrc,
} from "@/lib/cocktailImages";

type EventRecord = {
  id: string;
  title: string | null;
  event_date: string | null;
  guest_count: number | null;
  notes: string | null;
  client_phone: string | null;
  status: "draft" | "submitted" | "confirmed";
};

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
  // NOTE: Column is `ml_per_serving` in Supabase, but we treat it as "amount per serving"
  // and rely on `ingredients.unit` for formatting.
  ml_per_serving: number;
  ingredients: Ingredient | Ingredient[] | null;
};

type Recipe = {
  id: string;
  name: string;
  description: string | null;
  image_url?: string | null;
  recipe_ingredients: RecipeIngredient[];
};

const PLACEHOLDER_IMAGE = COCKTAIL_PLACEHOLDER_IMAGE;

const typePriority: Record<string, number> = {
  liquor: 0,
  mixer: 1,
  juice: 2,
  syrup: 3,
  garnish: 4,
  ice: 5,
  glassware: 6,
};

export default function RequestEditPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;
  const CONFIRMED_LOCK_MESSAGE =
    "This order can't be changed because it has been confirmed.";
  const amendRef = useRef<HTMLDivElement | null>(null);

  const [event, setEvent] = useState<EventRecord | null>(null);
  const [title, setTitle] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [guestCount, setGuestCount] = useState(50);
  const [clientPhone, setClientPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const minDate = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const isLocked = event?.status === "confirmed";

  const handleEventDateChange = (value: string) => {
    if (!value) {
      setEventDate("");
      return;
    }
    setEventDate(value < minDate ? minDate : value);
  };

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [selectedRecipeIds, setSelectedRecipeIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [servingsByRecipeId, setServingsByRecipeId] = useState<
    Record<string, string>
  >({});
  const [ingredientsOpenByRecipeId, setIngredientsOpenByRecipeId] = useState<
    Record<string, boolean>
  >({});
  const [undoRemoval, setUndoRemoval] = useState<{
    recipeId: string;
    recipeName: string;
    expiresAt: number;
  } | null>(null);
  const [step, setStep] = useState<"select" | "quantity">("select");

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

  const normalizeIngredient = (value: Ingredient | Ingredient[] | null) => {
    if (!value) return null;
    return Array.isArray(value) ? value[0] ?? null : value;
  };

  const cocktailsSummary = useMemo(() => {
    const byId = new Map(recipes.map((r) => [r.id, r]));
    const selected = Array.from(selectedRecipeIds);
    const rows = selected
      .map((id) => {
        const recipe = byId.get(id);
        if (!recipe) return null;
        const raw = servingsByRecipeId[id] ?? "0";
        const servings = Number(raw || "0") || 0;
        return { recipeId: id, recipeName: recipe.name, servings };
      })
      .filter(Boolean) as Array<{ recipeId: string; recipeName: string; servings: number }>;

    return rows
      .filter((r) => r.servings > 0)
      .sort((a, b) => a.recipeName.localeCompare(b.recipeName));
  }, [recipes, selectedRecipeIds, servingsByRecipeId]);

  const totalDrinks = useMemo(() => {
    return cocktailsSummary.reduce((sum, c) => sum + (Number(c.servings) || 0), 0);
  }, [cocktailsSummary]);

  const orderList = useMemo(() => {
    if (recipes.length === 0) return [];
    const recipeById = new Map(recipes.map((r) => [r.id, r]));

    const items = cocktailsSummary.flatMap((c) => {
      const recipe = recipeById.get(c.recipeId);
      if (!recipe) return [];

      return (recipe.recipe_ingredients ?? []).flatMap((ri) => {
        const ingredient = normalizeIngredient(ri.ingredients);
        if (!ingredient) return [];

        const normalizedKey = `${ingredient.type}:${ingredient.name
          .trim()
          .toLowerCase()}:${(ingredient.unit || "ml").trim().toLowerCase()}`;

        return [
          {
            ingredientId: normalizedKey,
            name: ingredient.name,
            type: ingredient.type,
            amountPerServing: ri.ml_per_serving,
            servings: c.servings,
            unit: ingredient.unit,
            bottleSizeMl: ingredient.bottle_size_ml,
          },
        ];
      });
    });

    return buildIngredientTotals(items).sort((a, b) => {
      const typeA = typePriority[a.type] ?? 99;
      const typeB = typePriority[b.type] ?? 99;
      if (typeA !== typeB) return typeA - typeB;
      if (a.total !== b.total) return b.total - a.total;
      return a.name.localeCompare(b.name);
    });
  }, [recipes, cocktailsSummary]);

  const loadEvent = async () => {
    setLoading(true);
    setError(null);
    const response = await fetch(`/api/events?token=${token}`);
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Unable to load request.");
      setLoading(false);
      return;
    }

    setEvent(data as EventRecord);
    setTitle(data.title || "");
    setEventDate(data.event_date || "");
    setGuestCount(data.guest_count || 0);
    setNotes(data.notes || "");
    setClientPhone(data.client_phone || "");
    setLoading(false);
  };

  const loadMenu = async () => {
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
        if (next[recipe.id] === undefined) next[recipe.id] = "0";
      }
      return next;
    });
  };

  const loadSelection = async () => {
    const response = await fetch(`/api/events/selection?token=${token}`);
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Unable to load cocktail selection.");
      return;
    }

    const selections = (data.selections ?? []) as Array<{
      recipeId: string;
      servings: number;
    }>;

    setSelectedRecipeIds(new Set(selections.map((s) => s.recipeId)));
    setServingsByRecipeId((prev) => {
      const next = { ...prev };
      for (const selection of selections) {
        next[selection.recipeId] = String(selection.servings ?? 0);
      }
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    if (isLocked) {
      setError(CONFIRMED_LOCK_MESSAGE);
      setSaving(false);
      return;
    }

    const response = await fetch("/api/events", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        title,
        eventDate,
        guestCount,
        clientPhone,
        notes,
        status: event?.status,
      }),
    });
    const data = await response.json();

    if (!response.ok) {
      setError(data.error || "Unable to save request.");
      setSaving(false);
      return;
    }

    const selectionPayload = recipes.map((recipe) => ({
      recipeId: recipe.id,
      servings: Number(servingsByRecipeId[recipe.id] ?? "0") || 0,
    }));

    const selectionResponse = await fetch("/api/events/selection", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, selections: selectionPayload }),
    });

    if (!selectionResponse.ok) {
      const selectionData = await selectionResponse.json();
      const msg = String(selectionData.error || "");
      setError(
        msg.toLowerCase().includes("confirmed")
          ? CONFIRMED_LOCK_MESSAGE
          : selectionData.error || "Unable to save cocktail selection.",
      );
      setSaving(false);
      return;
    }

    setSaving(false);
    setSuccess("Order amended.");
    await loadEvent();
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    if (isLocked) {
      setError(CONFIRMED_LOCK_MESSAGE);
      setSaving(false);
      return;
    }

    const response = await fetch("/api/events", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        title,
        eventDate,
        guestCount,
        clientPhone,
        notes,
        status: "submitted",
      }),
    });
    const data = await response.json();
    setSaving(false);

    if (!response.ok) {
      setError(data.error || "Unable to submit request.");
      return;
    }

    router.push("/request");
  };

  useEffect(() => {
    (async () => {
      await loadEvent();
      await loadMenu();
      await loadSelection();
    })();
  }, []);

  return (
    <div className="min-h-screen hero-grid px-6 py-16">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#6a2e2a]">
            Edit request
          </p>
          <h1 className="font-display text-4xl text-[#151210]">
            {event?.title || "Cocktail request"}
          </h1>
          <p className="mt-2 text-sm text-[#4b3f3a]">
            Save your updates or finalize when you're ready to book bartenders.
          </p>
        </header>

        {error && !error.toLowerCase().includes("confirmed") ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : null}
        {success ? <p className="text-sm text-[#4b3f3a]">{success}</p> : null}

        {loading ? (
          <p className="text-sm text-[#4b3f3a]">Loading request...</p>
        ) : (
          <>
            <div className="glass-panel rounded-[28px] px-8 py-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="font-display text-2xl text-[#6a2e2a]">
                    Order summary
                  </h2>
                  <p className="mt-2 text-sm text-[#4b3f3a]">
                    {totalDrinks > 0
                      ? `Total drinks: ${totalDrinks}`
                      : "No quantities set yet."}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isLocked}
                  onClick={() => {
                    setStep("select");
                    window.setTimeout(() => {
                      amendRef.current?.scrollIntoView({
                        behavior: "smooth",
                        block: "start",
                      });
                    }, 50);
                  }}
                  className="rounded-full bg-[#6a2e2a] px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-[#f8f1e7] shadow-lg shadow-[#c47b4a]/30 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Amend order
                </button>
              </div>

              <div className="mt-5 grid gap-3">
                {cocktailsSummary.length ? (
                  cocktailsSummary.map((c) => (
                    <div
                      key={c.recipeId}
                      className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#c47b4a]/20 bg-white/80 px-5 py-4"
                    >
                      <p className="text-sm font-semibold text-[#151210]">
                        {c.recipeName}
                      </p>
                      <p className="text-sm font-semibold text-[#151210] tabular-nums">
                        {c.servings}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-[#4b3f3a]">
                    Add cocktails and set quantities below.
                  </p>
                )}
              </div>
            </div>

            <div
              ref={amendRef}
              className="glass-panel rounded-[28px] px-8 py-6"
            >
              <h2 className="font-display text-2xl text-[#6a2e2a]">
                Amend and add cocktails
              </h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-[#6a2e2a]">
                  Event name
                  <input
                    type="text"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Birthday, corporate event, engagement..."
                    disabled={isLocked}
                    className="mt-2 w-full rounded-2xl border border-[#c47b4a]/30 bg-white/80 px-4 py-3 text-[16px] tracking-normal text-[#151210]"
                  />
                </label>

                <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-[#6a2e2a]">
                  Date of Event
                  <input
                    type="date"
                    value={eventDate}
                    onChange={(event) => handleEventDateChange(event.target.value)}
                    onBlur={(event) => handleEventDateChange(event.target.value)}
                    min={minDate}
                    disabled={isLocked}
                    className="mt-2 w-full rounded-2xl border border-[#c47b4a]/30 bg-white/80 px-4 py-3 text-[16px] tracking-normal text-[#151210]"
                    style={{ letterSpacing: "normal" }}
                  />
                </label>

                <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-[#6a2e2a]">
                  Number of guests
                  <input
                    type="number"
                    min={1}
                    value={guestCount}
                    onChange={(event) => setGuestCount(Number(event.target.value))}
                    disabled={isLocked}
                    className="mt-2 w-full rounded-2xl border border-[#c47b4a]/30 bg-white/80 px-4 py-3 text-[16px] tracking-normal text-[#151210]"
                  />
                </label>

                <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-[#6a2e2a]">
                  Telephone number
                  <input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={clientPhone}
                    onChange={(event) => setClientPhone(event.target.value)}
                    placeholder="0412 345 678"
                    disabled={isLocked}
                    className="mt-2 w-full rounded-2xl border border-[#c47b4a]/30 bg-white/80 px-4 py-3 text-[16px] tracking-normal text-[#151210]"
                  />
                </label>

                <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-[#6a2e2a] md:col-span-2">
                  Message
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="What’s the special occasion? Event schedule? Special/signature cocktail requests? Allergies, dietary requirements, venue details..."
                    disabled={isLocked}
                    className="mt-2 min-h-[120px] w-full rounded-2xl border border-[#c47b4a]/30 bg-white/80 px-4 py-3 text-[16px] tracking-normal text-[#151210]"
                  />
                </label>
              </div>
            </div>

            <div className="glass-panel rounded-[28px] px-8 py-6">
              <h2 className="font-display text-2xl text-[#6a2e2a]">
                {step === "select" ? "Select cocktails" : "Set quantities"}
              </h2>

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
                        disabled={isLocked}
                        onClick={() => {
                          setSelectedRecipeIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(recipe.id)) next.delete(recipe.id);
                            else next.add(recipe.id);
                            return next;
                          });
                        }}
                        className={`group relative overflow-hidden rounded-[26px] border bg-white/80 text-left shadow-sm transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70 ${
                          isSelected
                            ? "border-[#6a2e2a] ring-2 ring-[#6a2e2a]/20"
                            : "border-[#c47b4a]/20"
                        }`}
                      >
                        <div className="relative h-[180px] w-full bg-gradient-to-br from-[#fbf3ea] to-[#efe0d3]">
                          <img
                            src={imageSrc}
                            alt={recipe.name}
                            loading="lazy"
                            className="h-full w-full object-contain p-6"
                            onError={(event) => {
                              event.currentTarget.src = PLACEHOLDER_IMAGE;
                            }}
                          />
                          {isSelected ? (
                            <div className="absolute left-3 top-3 rounded-full bg-[#6a2e2a] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-[#f8f1e7]">
                              Selected
                            </div>
                          ) : null}

                          {/* Text overlay */}
                          <div className="absolute inset-x-0 bottom-0">
                            <div className="h-24 bg-gradient-to-t from-black/70 via-black/35 to-transparent" />
                            <div className="absolute inset-x-0 bottom-0 px-4 pb-4 pt-2 text-left">
                              <p className="font-display text-xl text-white drop-shadow">
                                {displayName}
                              </p>
                              <p className="mt-1 text-xs text-white/85">
                                Tap to {isSelected ? "remove" : "add"}
                              </p>
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-6 grid gap-6">
                  {recipes
                    .filter((recipe) => selectedRecipeIds.has(recipe.id))
                    .map((recipe) => {
                      const servingsRaw = servingsByRecipeId[recipe.id] ?? "0";
                      const servings = Number(servingsRaw || "0") || 0;
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
                          className={`relative grid gap-4 rounded-[28px] border border-[#c47b4a]/20 bg-white/70 p-5 ${
                            ingredientsOpen ? "md:grid-cols-[240px_1fr]" : "md:grid-cols-[240px]"
                          }`}
                        >
                          <button
                            type="button"
                            disabled={isLocked}
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
                            className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-black/10 bg-white/60 text-[#6a2e2a] shadow-sm hover:bg-white/80 disabled:cursor-not-allowed disabled:opacity-40"
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
                                    event.currentTarget.src = PLACEHOLDER_IMAGE;
                                  }}
                                />
                              </div>
                              <h3 className="min-w-0 truncate font-display text-lg text-[#151210]">
                                {displayName}
                              </h3>
                            </div>
                            <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-[#6a2e2a]">
                              Quantity
                              <input
                                type="number"
                                min={0}
                                value={servingsRaw}
                                disabled={isLocked}
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
                                // iOS Safari zooms when inputs are < 16px font-size.
                                className="mt-2 w-full rounded-2xl border border-[#c47b4a]/30 bg-white/80 px-4 py-3 text-[16px]"
                              />
                            </label>

                            <button
                              type="button"
                              disabled={isLocked}
                              onClick={() =>
                                setIngredientsOpenByRecipeId((prev) => ({
                                  ...prev,
                                  [recipe.id]: !prev[recipe.id],
                                }))
                              }
                              className="w-fit appearance-none bg-transparent p-0 text-[11px] font-semibold text-[#6a2e2a] underline underline-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {ingredientsOpen ? "Hide ingredients" : "Show ingredients"}
                            </button>
                          </div>

                          {ingredientsOpen ? (
                            <div className="rounded-3xl border border-[#6a2e2a]/10 bg-white/80 px-5 py-4">
                              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#6a2e2a]">
                                {servings > 0
                                  ? `Ingredients (for ${servings})`
                                  : "Ingredients (per cocktail)"}
                              </p>
                              <div className="mt-3 grid gap-2 text-sm text-[#4b3f3a]">
                                {(recipe.recipe_ingredients ?? [])
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
                                      <span className="font-medium text-[#151210]">
                                        {row.name}
                                      </span>
                                      <span>
                                        {row.amount} {row.unit}
                                      </span>
                                    </div>
                                  ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                </div>
              )}

              <div className="mt-6 flex flex-wrap gap-4">
                {step === "select" ? (
                  <button
                    type="button"
                    onClick={() => setStep("quantity")}
                    disabled={selectedRecipeIds.size === 0}
                    className="rounded-full bg-[#6a2e2a] px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-[#f8f1e7] shadow-lg shadow-[#c47b4a]/30 hover:-translate-y-0.5 disabled:opacity-60"
                  >
                    Next: Add Quantities
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setStep("select")}
                    className="rounded-full border border-[#6a2e2a]/30 bg-white/70 px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-[#6a2e2a] hover:-translate-y-0.5"
                  >
                    Back
                  </button>
                )}
              </div>
            </div>

            {undoRemoval && step === "quantity" ? (
              <div className="fixed inset-x-0 bottom-6 z-50 px-6">
                <div className="mx-auto flex w-full max-w-xl items-center justify-between gap-4 rounded-2xl border border-black/10 bg-white/90 px-5 py-4 shadow-lg">
                  <p className="text-sm text-[#151210]">
                    Removed{" "}
                    <span className="font-semibold">{undoRemoval.recipeName}</span>
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
                    className="rounded-full bg-[#6a2e2a] px-5 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-[#f8f1e7] hover:-translate-y-0.5"
                  >
                    Undo
                  </button>
                </div>
              </div>
            ) : null}

            <div className="glass-panel rounded-[28px] px-8 py-6">
              <h2 className="font-display text-2xl text-[#6a2e2a]">
                Actions
              </h2>
              <div className="mt-4 flex flex-wrap gap-4">
                <button
                  onClick={handleSave}
                  disabled={saving || isLocked}
                  className="rounded-full border border-[#6a2e2a]/30 bg-white/70 px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-[#6a2e2a] hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={saving || event?.status !== "draft"}
                  className="rounded-full bg-[#c47b4a] px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-white shadow-lg shadow-[#c47b4a]/30 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {event?.status === "submitted" ? "Submitted" : "Book Bartenders"}
                </button>
              </div>

              {isLocked ? (
                <p className="mt-4 text-sm font-semibold text-red-600 normal-case tracking-normal">
                  {CONFIRMED_LOCK_MESSAGE}
                </p>
              ) : null}
            </div>

            <div className="glass-panel rounded-[28px] px-8 py-6">
              <h2 className="font-display text-2xl text-[#6a2e2a]">Order list</h2>
              <p className="mt-2 text-sm text-[#4b3f3a]">
                Shopping list style totals include a 10% buffer.
              </p>

              <ul className="mt-5 grid gap-3">
                {orderList.length ? (
                  orderList.map((item) => (
                    <li
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
                        <p className="text-sm font-semibold text-[#151210] tabular-nums">
                          {item.bottlesNeeded
                            ? `${item.bottlesNeeded} × ${item.bottleSizeMl}ml`
                            : `${item.total} ${item.unit}`}
                        </p>
                      </div>
                    </li>
                  ))
                ) : (
                  <li className="text-sm text-[#4b3f3a]">
                    Set cocktail quantities to generate your order list.
                  </li>
                )}
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
