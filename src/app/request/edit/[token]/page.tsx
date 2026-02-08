"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { buildIngredientTotals } from "@/lib/inventoryMath";
import { supabase } from "@/lib/supabaseClient";

type EventRecord = {
  id: string;
  title: string | null;
  event_date: string | null;
  guest_count: number | null;
  notes: string | null;
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

const PLACEHOLDER_IMAGE = "/cocktails/placeholder.svg";

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

  const [event, setEvent] = useState<EventRecord | null>(null);
  const [title, setTitle] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [guestCount, setGuestCount] = useState(50);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [selectedRecipeIds, setSelectedRecipeIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [servingsByRecipeId, setServingsByRecipeId] = useState<
    Record<string, string>
  >({});
  const [step, setStep] = useState<"select" | "quantity">("select");

  const normalizeIngredient = (value: Ingredient | Ingredient[] | null) => {
    if (!value) return null;
    return Array.isArray(value) ? value[0] ?? null : value;
  };

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
    const response = await fetch("/api/events", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        title,
        eventDate,
        guestCount,
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
      setError(selectionData.error || "Unable to save cocktail selection.");
      setSaving(false);
      return;
    }

    setSaving(false);
    setSuccess("Saved.");
    await loadEvent();
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    const response = await fetch("/api/events", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        title,
        eventDate,
        guestCount,
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

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {success ? <p className="text-sm text-[#4b3f3a]">{success}</p> : null}

        {loading ? (
          <p className="text-sm text-[#4b3f3a]">Loading request...</p>
        ) : (
          <>
            <div className="glass-panel rounded-[28px] px-8 py-6">
              <h2 className="font-display text-2xl text-[#6a2e2a]">
                Event details
              </h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <input
                  type="text"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Event name"
                  className="rounded-2xl border border-[#c47b4a]/30 bg-white/80 px-4 py-3 text-sm"
                />
                <input
                  type="date"
                  value={eventDate}
                  onChange={(event) => setEventDate(event.target.value)}
                  className="rounded-2xl border border-[#c47b4a]/30 bg-white/80 px-4 py-3 text-sm"
                />
                <input
                  type="number"
                  min={10}
                  value={guestCount}
                  onChange={(event) => setGuestCount(Number(event.target.value))}
                  className="rounded-2xl border border-[#c47b4a]/30 bg-white/80 px-4 py-3 text-sm"
                />
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Event notes"
                  className="min-h-[120px] rounded-2xl border border-[#c47b4a]/30 bg-white/80 px-4 py-3 text-sm md:col-span-2"
                />
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

                          {/* Text overlay */}
                          <div className="absolute inset-x-0 bottom-0">
                            <div className="h-24 bg-gradient-to-t from-black/70 via-black/35 to-transparent" />
                            <div className="absolute inset-x-0 bottom-0 px-4 pb-4 pt-2 text-left">
                              <p className="font-display text-xl text-white drop-shadow">
                                {recipe.name}
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
                                      unit: (ingredient.unit || "ml").trim().toLowerCase(),
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

            <div className="glass-panel rounded-[28px] px-8 py-6">
              <h2 className="font-display text-2xl text-[#6a2e2a]">
                Actions
              </h2>
              <div className="mt-4 flex flex-wrap gap-4">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded-full border border-[#6a2e2a]/30 bg-white/70 px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-[#6a2e2a] hover:-translate-y-0.5 disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={saving || event?.status === "submitted"}
                  className="rounded-full bg-[#c47b4a] px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-white shadow-lg shadow-[#c47b4a]/30 hover:-translate-y-0.5 disabled:opacity-60"
                >
                  {event?.status === "submitted" ? "Submitted" : "Book Bartenders"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
