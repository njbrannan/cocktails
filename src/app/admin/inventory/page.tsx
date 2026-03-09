"use client";

import {
  buildCheapestPackPlan,
  buildIngredientTotals,
  type PackOption,
} from "@/lib/inventoryMath";
import { supabase } from "@/lib/supabaseClient";
import { useEffect, useMemo, useState } from "react";

type EventItem = {
  id: string;
  title: string | null;
  event_date: string | null;
  guest_count: number | null;
  status?: string | null;
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
    | "glassware"
    | "bar";
  bottle_size_ml: number | null;
  unit: string | null;
  purchase_url?: string | null;
  price?: number | null;
  ingredient_packs?: Array<{
    pack_size: number;
    pack_price: number;
    purchase_url?: string | null;
    search_url?: string | null;
    search_query?: string | null;
    variant_sku?: string | null;
    retailer?: "danmurphys" | "woolworths" | "getinvolved" | null;
    tier?: "economy" | "business" | "first_class" | "budget" | "premium" | null;
    is_active: boolean;
  }> | null;
};

type DbRecipeIngredient = {
  ml_per_serving: number;
  ingredients: DbIngredient | DbIngredient[] | null;
};

type DbRecipe = {
  id?: string;
  name: string;
  recipe_ingredients: DbRecipeIngredient[];
  recipe_packs?: Array<{
    pack_size: number;
    pack_price: number;
    purchase_url?: string | null;
    variant_sku?: string | null;
    tier?: "economy" | "business" | "first_class" | "budget" | "premium" | null;
    is_active: boolean;
  }> | null;
};

type DbEventRecipeRow = {
  recipe_id?: string | null;
  servings: number;
  recipes: DbRecipe | DbRecipe[] | null;
};

const typePriority: Record<string, number> = {
  liquor: 0,
  mixer: 1,
  juice: 2,
  syrup: 3,
  garnish: 4,
  ice: 5,
  glassware: 6,
  bar: 7,
};

function normalizeIngredient(value: DbIngredient | DbIngredient[] | null) {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function recommendedBartenders(totalDrinks: number, cocktailCount: number) {
  const drinks = Math.max(0, Math.floor(totalDrinks || 0));
  const cocktails = Math.max(0, Math.floor(cocktailCount || 0));
  if (drinks <= 0) return 0;

  let count = Math.max(1, Math.ceil(drinks / 150));
  if (cocktails > 2 && drinks >= 75) count += 1;
  return count;
}

function formatAud(amount: number) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return "";
  try {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `$${Math.round(n)}`;
  }
}

export default function InventoryAdmin() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [selectedEvent, setSelectedEvent] = useState("");
  const [totals, setTotals] = useState<ReturnType<typeof buildIngredientTotals>>(
    [],
  );
  const [cocktails, setCocktails] = useState<Array<{ name: string; servings: number }>>([]);
  const [recommendedMixologists, setRecommendedMixologists] = useState<number>(0);
  const [kitPlan, setKitPlan] = useState<
    Array<{ label: string; url: string; count: number }>
  >([]);
  const [kitCost, setKitCost] = useState<number>(0);
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedEventLabel = useMemo(() => {
    const ev = events.find((e) => e.id === selectedEvent);
    if (!ev) return "";
    const title = ev.title || "Booking";
    const date = ev.event_date || "Date TBD";
    return `${date} · ${title}`;
  }, [events, selectedEvent]);

  const loadEvents = async () => {
    const { data, error: fetchError } = await supabase
      .from("events")
      .select("id, title, event_date, guest_count, status")
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

  const loadChecklist = async (eventId: string) => {
    try {
      const resp = await fetch(
        `/api/admin/checklist?eventId=${encodeURIComponent(eventId)}`,
      );
      const json = await resp.json().catch(() => null);
      const items = Array.isArray(json?.items) ? json.items : [];
      const next: Record<string, boolean> = {};
      for (const it of items) {
        const k = String(it?.key || "").trim();
        if (!k) continue;
        next[k] = Boolean(it?.checked);
      }
      setChecklist(next);
    } catch {
      // ignore
    }
  };

  const saveChecklist = async (
    eventId: string,
    key: string,
    label: string,
    checked: boolean,
  ) => {
    setSavingKey(key);
    try {
      await fetch("/api/admin/checklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          items: [{ key, label, checked }],
        }),
      });
    } finally {
      setSavingKey(null);
    }
  };

  const loadTotals = async (eventId: string) => {
    setError(null);
    setTotals([]);
    setCocktails([]);
    setKitPlan([]);
    setKitCost(0);
    setRecommendedMixologists(0);

    await loadChecklist(eventId);

    const { data, error: fetchError } = await supabase
      .from("event_recipes")
      .select(
        "recipe_id, servings, recipes(id, name, recipe_packs(pack_size, pack_price, purchase_url, variant_sku, tier, is_active), recipe_ingredients(ml_per_serving, ingredients(id, name, type, unit, bottle_size_ml, purchase_url, price, ingredient_packs(pack_size, pack_price, purchase_url, search_url, search_query, variant_sku, retailer, tier, is_active))))",
      )
      .eq("event_id", eventId);

    if (fetchError) {
      setError(fetchError.message);
      return;
    }

    const rows = ((data ?? []) as unknown as DbEventRecipeRow[]) || [];

    const cocktailSummary: Array<{ name: string; servings: number; recipeId: string }> = [];
    for (const row of rows) {
      const recipes = row.recipes
        ? Array.isArray(row.recipes)
          ? row.recipes
          : [row.recipes]
        : [];
      for (const r of recipes) {
        const name = String(r?.name || "").trim();
        if (!name) continue;
        cocktailSummary.push({
          name,
          servings: Number(row.servings) || 0,
          recipeId: String((r as any)?.id || row.recipe_id || ""),
        });
      }
    }

    const cocktailsSorted = cocktailSummary
      .filter((c) => c.servings > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
    setCocktails(cocktailsSorted.map((c) => ({ name: c.name, servings: c.servings })));

    const totalDrinks = cocktailsSorted.reduce((s, c) => s + (Number(c.servings) || 0), 0);
    const bartenderCount = recommendedBartenders(totalDrinks, cocktailsSorted.length);
    setRecommendedMixologists(bartenderCount);

    const items = rows.flatMap((row) => {
      const recipes = row.recipes
        ? Array.isArray(row.recipes)
          ? row.recipes
          : [row.recipes]
        : [];

      return recipes.flatMap((recipe) =>
        (recipe.recipe_ingredients ?? []).flatMap((ingredientRow) => {
          const ingredient = normalizeIngredient(ingredientRow.ingredients);
          if (!ingredient) return [];

          const packOptions =
            ingredient.ingredient_packs
              ?.filter((p) => p?.is_active)
              .map((p) => ({
                packSize: Number(p.pack_size),
                packPrice: Number(p.pack_price),
                purchaseUrl: p.purchase_url || null,
                searchUrl: p.search_url || null,
                searchQuery: p.search_query || null,
                variantSku: p.variant_sku || null,
                retailer: (p.retailer as any) || null,
                tier: (p.tier as any) || null,
              })) ?? null;

          return [
            {
              ingredientId: ingredient.id,
              name: ingredient.name,
              type: ingredient.type,
              amountPerServing: ingredientRow.ml_per_serving,
              servings: row.servings,
              unit: ingredient.unit,
              bottleSizeMl: ingredient.bottle_size_ml,
              purchaseUrl: ingredient.purchase_url,
              price: ingredient.price ?? null,
              packOptions,
            },
          ];
        }),
      );
    });

    // Bars: add recommended small/large bars if they exist.
    try {
      const { data: barData } = await supabase
        .from("ingredients")
        .select(
          "id, name, type, unit, bottle_size_ml, purchase_url, price, ingredient_packs(pack_size, pack_price, purchase_url, search_url, search_query, variant_sku, retailer, tier, is_active)",
        )
        .eq("type", "bar");
      const bars = ((barData ?? []) as unknown as DbIngredient[]) || [];

      const findBar = (needle: string) =>
        bars.find((b) => String(b?.name || "").toLowerCase().includes(needle)) || null;
      const large = findBar("large");
      const small = findBar("small");
      const largeCount = Math.floor(bartenderCount / 2);
      const smallCount = bartenderCount % 2;

      const makeBarItem = (b: DbIngredient, count: number) => ({
        ingredientId: b.id,
        name: b.name,
        type: b.type,
        amountPerServing: 1,
        servings: count,
        unit: b.unit || "pcs",
        bottleSizeMl: b.bottle_size_ml,
        purchaseUrl: b.purchase_url,
        price: b.price ?? null,
        packOptions:
          b.ingredient_packs
            ?.filter((p) => p?.is_active)
            .map((p) => ({
              packSize: Number(p.pack_size),
              packPrice: Number(p.pack_price),
              purchaseUrl: p.purchase_url || null,
              searchUrl: p.search_url || null,
              searchQuery: p.search_query || null,
              variantSku: p.variant_sku || null,
              retailer: (p.retailer as any) || null,
              tier: (p.tier as any) || null,
            })) ?? null,
      });

      if (large && largeCount > 0) items.push(makeBarItem(large, largeCount));
      if (small && smallCount > 0) items.push(makeBarItem(small, smallCount));
    } catch {
      // ignore
    }

    const built = buildIngredientTotals(items as any[]).sort((a, b) => {
      const typeA = typePriority[a.type] ?? 99;
      const typeB = typePriority[b.type] ?? 99;
      if (typeA !== typeB) return typeA - typeB;
      if (a.total !== b.total) return b.total - a.total;
      return a.name.localeCompare(b.name);
    });
    setTotals(built);

    // Get Involved cocktail kits: choose the cheapest pack plan for each selected recipe.
    try {
      const kitLines: Array<{ label: string; url: string; count: number }> = [];
      let total = 0;

      for (const c of cocktailsSorted) {
        const recipe = rows
          .flatMap((r) =>
            r.recipes
              ? Array.isArray(r.recipes)
                ? r.recipes
                : [r.recipes]
              : [],
          )
          .find((rr) => String((rr as any)?.id || "") === c.recipeId);

        const packs = (recipe as any)?.recipe_packs as any[] | null | undefined;
        const active = (packs ?? []).filter((p) => p && p.is_active !== false);
        if (!active.length) continue;

        const required = Math.ceil((Number(c.servings) || 0) * 1.1);
        const options: PackOption[] = active.map((p) => ({
          packSize: Number(p.pack_size),
          packPrice: Number(p.pack_price),
          purchaseUrl: p.purchase_url || null,
          searchUrl: null,
          searchQuery: null,
          variantSku: p.variant_sku || null,
          retailer: "getinvolved",
          tier: (p.tier as any) || null,
        }));

        const plan = buildCheapestPackPlan(required, options, null);
        if (!plan?.plan?.length) continue;
        total += Number(plan.totalCost) || 0;

        for (const line of plan.plan) {
          const url = line.purchaseUrl || "";
          if (!url || line.count <= 0) continue;
          kitLines.push({
            label: `${c.name} (${line.packSize} pack)`,
            url,
            count: line.count,
          });
        }
      }

      setKitPlan(kitLines);
      setKitCost(total);
    } catch {
      setKitPlan([]);
      setKitCost(0);
    }
  };

  useEffect(() => {
    loadEvents();
  }, []);

  useEffect(() => {
    if (selectedEvent) {
      void loadTotals(selectedEvent);
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
              Inventory & Checklist
            </h1>
            <p className="mt-2 text-sm text-[#4b3f3a]">
              Calculate everything needed for a booking, then tick items off as you purchase them.
            </p>
          </div>
        </header>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <div className="glass-panel rounded-[28px] px-8 py-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#6a2e2a]">
                Booking
              </p>
              <p className="text-sm text-[#151210]/70">{selectedEventLabel}</p>
            </div>
            <div className="w-full sm:w-[360px]">
              <select
                value={selectedEvent}
                onChange={(e) => setSelectedEvent(e.target.value)}
                className="h-[52px] w-full rounded-2xl border border-[#c47b4a]/25 bg-white/80 px-4 text-[16px] text-[#151210]"
              >
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {(ev.event_date ? `${ev.event_date} · ` : "") + (ev.title || "Booking")}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {cocktails.length ? (
            <div className="mt-6 rounded-2xl border border-[#c47b4a]/15 bg-white/70 px-5 py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#6a2e2a]">
                  Calculator
                </p>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#6a2e2a]/70">
                  Recommended mixologists: {recommendedMixologists}
                </p>
              </div>
              <ul className="mt-2 space-y-1 text-sm text-[#151210]/80">
                {cocktails.map((c) => (
                  <li key={c.name} className="flex items-baseline justify-between gap-6">
                    <span className="min-w-0 truncate font-medium">{c.name}</span>
                    <span className="tabular-nums">{c.servings}</span>
                  </li>
                ))}
              </ul>

              {kitPlan.length ? (
                <div className="mt-4 border-t border-[#c47b4a]/15 pt-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#6a2e2a]">
                    Cocktail packs (Get Involved)
                    {kitCost ? (
                      <span className="ml-2 text-[#6a2e2a]/70">
                        · Est. {formatAud(kitCost)}
                      </span>
                    ) : null}
                  </p>
                  <ul className="mt-2 space-y-1 text-sm">
                    {kitPlan.map((k, idx) => (
                      <li
                        key={`${k.url}-${idx}`}
                        className="flex items-baseline justify-between gap-4"
                      >
                        <a
                          href={k.url}
                          target="_blank"
                          rel="noreferrer"
                          className="min-w-0 truncate text-[#151210] underline decoration-[#c47b4a]/50 underline-offset-4"
                        >
                          {k.label}
                        </a>
                        <span className="tabular-nums text-[#151210]/70">
                          {k.count}×
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="mt-6 overflow-hidden rounded-2xl border border-[#c47b4a]/15 bg-white/70">
            <div className="flex items-center justify-between gap-4 px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#6a2e2a]">
                Full shopping list (links)
              </p>
              {savingKey ? (
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#6a2e2a]/70">
                  Saving…
                </p>
              ) : null}
            </div>
            <ul className="divide-y divide-[#c47b4a]/15">
              {totals.length === 0 ? (
                <li className="px-5 py-4 text-sm text-[#4b3f3a]">
                  No recipes attached to this booking yet.
                </li>
              ) : (
                totals.map((t) => {
                  const key = `ingredient:${t.ingredientId}`;
                  const checked = Boolean(checklist[key]);
                  const link =
                    t.packPlan?.[0]?.purchaseUrl ||
                    t.packPlan?.[0]?.searchUrl ||
                    t.purchaseUrl ||
                    "";
                  const right = t.packPlan?.length
                    ? t.packPlan
                        .slice()
                        .sort((a, b) => b.packSize - a.packSize)
                        .map((p) => `${p.count}×${p.packSize}${t.unit}`)
                        .join(" + ")
                    : t.bottlesNeeded
                      ? `${t.bottlesNeeded}×${t.bottleSizeMl}${t.unit}`
                      : `${t.total} ${t.unit}`;

                  return (
                    <li key={key} className="flex items-start gap-4 px-5 py-4">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={async (e) => {
                          const next = e.target.checked;
                          setChecklist((prev) => ({ ...prev, [key]: next }));
                          await saveChecklist(selectedEvent, key, t.name, next);
                        }}
                        className="mt-1 h-5 w-5 accent-[#c47b4a]"
                      />
                      <div className="min-w-0 flex-1">
                        {link ? (
                          <a
                            href={link}
                            target="_blank"
                            rel="noreferrer"
                            className="block min-w-0 truncate font-semibold text-[#151210] underline decoration-[#c47b4a]/50 underline-offset-4"
                          >
                            {t.name}
                          </a>
                        ) : (
                          <p className="min-w-0 truncate font-semibold text-[#151210]">
                            {t.name}
                          </p>
                        )}
                        <p className="mt-1 text-xs uppercase tracking-[0.18em] text-[#151210]/50">
                          {t.type}
                        </p>
                      </div>
                      <div className="shrink-0 text-right text-sm tabular-nums text-[#151210]/70">
                        {right}
                      </div>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

