"use client";

import { buildIngredientTotals } from "@/lib/inventoryMath";
import { supabase } from "@/lib/supabaseClient";
import { useEffect, useState } from "react";

type EventItem = {
  id: string;
  title: string | null;
  event_date: string | null;
  guest_count: number | null;
};

type DbIngredient = {
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

type DbRecipeIngredient = {
  ml_per_serving: number;
  // Supabase embedded relations can type as object or array depending on schema typing.
  ingredients: DbIngredient | DbIngredient[] | null;
};

type DbRecipe = {
  name: string;
  recipe_ingredients: DbRecipeIngredient[];
};

type DbEventRecipeRow = {
  servings: number;
  // Supabase embedded relations can type as object or array depending on schema typing.
  recipes: DbRecipe | DbRecipe[] | null;
};

export default function InventoryAdmin() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [selectedEvent, setSelectedEvent] = useState("");
  const [totals, setTotals] = useState<ReturnType<typeof buildIngredientTotals>>([]);
  const [error, setError] = useState<string | null>(null);

  const loadEvents = async () => {
    const { data, error: fetchError } = await supabase
      .from("events")
      .select("id, title, event_date, guest_count")
      .order("event_date", { ascending: true });

    if (fetchError) {
      setError(fetchError.message);
      return;
    }

    setEvents((data as EventItem[]) || []);
    if (data && data.length && !selectedEvent) {
      setSelectedEvent(data[0].id);
    }
  };

  const loadTotals = async (eventId: string) => {
    const { data, error: fetchError } = await supabase
      .from("event_recipes")
      .select(
        "servings, recipes(name, recipe_ingredients(ml_per_serving, ingredients(id, name, type, unit, bottle_size_ml)))",
      )
      .eq("event_id", eventId);

    if (fetchError) {
      setError(fetchError.message);
      return;
    }

    const rows = ((data ?? []) as unknown as DbEventRecipeRow[]) || [];
    const items = rows.flatMap((row) => {
      const recipes = row.recipes
        ? Array.isArray(row.recipes)
          ? row.recipes
          : [row.recipes]
        : [];

      return recipes.flatMap((recipe) =>
        (recipe.recipe_ingredients ?? []).flatMap((ingredientRow) => {
          const ingredients = ingredientRow.ingredients
            ? Array.isArray(ingredientRow.ingredients)
              ? ingredientRow.ingredients
              : [ingredientRow.ingredients]
            : [];

          return ingredients.map((ingredient) => ({
            ingredientId: ingredient.id,
            name: ingredient.name,
            type: ingredient.type,
            amountPerServing: ingredientRow.ml_per_serving,
            servings: row.servings,
            unit: ingredient.unit,
            bottleSizeMl: ingredient.bottle_size_ml,
          }));
        }),
      );
    });

    const cleanItems = items.filter(Boolean) as Array<{
      ingredientId: string;
      name: string;
      type:
        | "liquor"
        | "mixer"
        | "juice"
        | "syrup"
        | "garnish"
        | "ice"
        | "glassware";
      amountPerServing: number;
      servings: number;
      unit?: string | null;
      bottleSizeMl?: number | null;
    }>;

    setTotals(buildIngredientTotals(cleanItems));
  };

  useEffect(() => {
    loadEvents();
  }, []);

  useEffect(() => {
    if (selectedEvent) {
      loadTotals(selectedEvent);
    }
  }, [selectedEvent]);

  return (
    <div className="min-h-screen hero-grid px-6 py-16">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <header className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#6a2e2a]">
              Admin
            </p>
            <h1 className="font-display text-4xl text-[#151210]">
              Inventory overview
            </h1>
          </div>
          <button className="rounded-full bg-[#c47b4a] px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-white shadow-lg shadow-[#c47b4a]/30 hover:-translate-y-0.5">
            Export List
          </button>
        </header>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <div className="glass-panel rounded-[28px] px-8 py-6">
          <h2 className="font-display text-2xl text-[#6a2e2a]">
            Select event
          </h2>
          <select
            value={selectedEvent}
            onChange={(event) => setSelectedEvent(event.target.value)}
            className="mt-4 w-full rounded-2xl border border-[#c47b4a]/30 bg-white/80 px-4 py-3 text-sm"
          >
            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.title || "Untitled Event"} · {event.event_date || "Date TBD"}
              </option>
            ))}
          </select>
        </div>

        <div className="glass-panel rounded-[28px] px-8 py-6">
          <h2 className="font-display text-2xl text-[#6a2e2a]">
            Auto-calculated totals (10% buffer)
          </h2>
          <div className="mt-4 grid gap-4">
            {totals.length === 0 ? (
              <p className="text-sm text-[#4b3f3a]">
                No recipes attached to this event yet.
              </p>
            ) : (
              totals.map((item) => (
                <div
                  key={item.ingredientId}
                  className="flex flex-wrap items-center justify-between gap-4 border-b border-[#c47b4a]/20 pb-4 last:border-b-0 last:pb-0"
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
                      {item.total} {item.unit}
                    </p>
                    {item.bottlesNeeded ? (
                      <p className="text-xs text-[#4b3f3a]">
                        Order: {item.bottlesNeeded} × {item.bottleSizeMl}
                        {item.unit}
                      </p>
                    ) : (
                      <p className="text-xs text-[#4b3f3a]">Total</p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
