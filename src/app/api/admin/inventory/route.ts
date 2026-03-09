import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { buildCheapestPackPlan, buildIngredientTotals, type PackOption } from "@/lib/inventoryMath";
import { corsPreflight, withCors } from "@/lib/cors";

export function OPTIONS() {
  return corsPreflight();
}

function json(body: any, init?: Parameters<typeof NextResponse.json>[1]) {
  return withCors(NextResponse.json(body, init));
}

function normalizePackTier(tier: any): "economy" | "business" | "first_class" {
  const t = String(tier || "").trim().toLowerCase();
  if (t === "business") return "business";
  if (t === "first_class" || t === "first-class" || t === "firstclass" || t === "premium")
    return "first_class";
  if (t === "economy" || t === "budget") return "economy";
  return "economy";
}

function normalizePricingTier(value: any): "house" | "top_shelf" {
  const v = String(value || "").trim().toLowerCase();
  if (
    v === "top_shelf" ||
    v === "topshelf" ||
    v === "first_class" ||
    v === "first-class" ||
    v === "firstclass"
  ) {
    return "top_shelf";
  }
  return "house";
}

function recommendedBartenders(totalDrinks: number, cocktailCount: number) {
  const drinks = Math.max(0, Math.floor(totalDrinks || 0));
  const cocktails = Math.max(0, Math.floor(cocktailCount || 0));
  if (drinks <= 0) return 0;

  let count = Math.max(1, Math.ceil(drinks / 150));
  if (cocktails > 2 && drinks >= 75) count += 1;
  return count;
}

export async function GET(req: NextRequest) {
  try {
    const supabaseServer = getSupabaseServerClient();
    const url = new URL(req.url);
    const eventId = String(url.searchParams.get("eventId") || "").trim();
    if (!eventId) return json({ error: "Missing eventId" }, { status: 400 });

    const { data: ev, error: evErr } = await supabaseServer
      .from("events")
      .select("id, title, event_date, guest_count, status, pricing_tier")
      .eq("id", eventId)
      .single();
    if (evErr) return json({ error: evErr.message }, { status: 400 });

    const pricingTier = normalizePricingTier((ev as any)?.pricing_tier);

    const { data, error } = await supabaseServer
      .from("event_recipes")
      .select(
        "recipe_id, servings, recipes(id, name, recipe_packs(pack_size, pack_price, purchase_url, variant_sku, tier, is_active), recipe_ingredients(ml_per_serving, ingredients(id, name, type, unit, bottle_size_ml, purchase_url, price, ingredient_packs(pack_size, pack_price, purchase_url, search_url, search_query, variant_sku, retailer, tier, is_active))))",
      )
      .eq("event_id", eventId);

    if (error) return json({ error: error.message }, { status: 400 });

    const rows = (data ?? []) as any[];

    const cocktailsSorted: Array<{ recipeId: string; name: string; servings: number }> = [];
    for (const row of rows) {
      const recipe = row?.recipes && Array.isArray(row.recipes) ? row.recipes[0] : row?.recipes;
      const recipeId = String(row?.recipe_id || recipe?.id || "").trim();
      const name = String(recipe?.name || "").trim();
      const servings = Number(row?.servings || 0) || 0;
      if (!recipeId || !name || servings <= 0) continue;
      cocktailsSorted.push({ recipeId, name, servings });
    }
    cocktailsSorted.sort((a, b) => b.servings - a.servings || a.name.localeCompare(b.name));

    const totalDrinks = cocktailsSorted.reduce((s, c) => s + (Number(c.servings) || 0), 0);
    const bartenderCount = recommendedBartenders(totalDrinks, cocktailsSorted.length);

    const items: any[] = [];
    for (const row of rows) {
      const recipe = row?.recipes && Array.isArray(row.recipes) ? row.recipes[0] : row?.recipes;
      const servings = Number(row?.servings || 0) || 0;
      if (!recipe || servings <= 0) continue;
      for (const ingredientRow of recipe?.recipe_ingredients ?? []) {
        const ingredient = ingredientRow?.ingredients && Array.isArray(ingredientRow.ingredients)
          ? ingredientRow.ingredients[0]
          : ingredientRow?.ingredients;
        if (!ingredient) continue;

        const packs = (ingredient?.ingredient_packs ?? []).filter((p: any) => p && p.is_active !== false);
        const packOptions: PackOption[] =
          packs
            .filter((p: any) => {
              const normalized = normalizePackTier(p?.tier);
              if (pricingTier === "top_shelf") return normalized === "first_class";
              return normalized === "economy";
            })
            .map((p: any) => ({
              packSize: Number(p.pack_size),
              packPrice: Number(p.pack_price),
              purchaseUrl: p.purchase_url || null,
              searchUrl: p.search_url || null,
              searchQuery: p.search_query || null,
              variantSku: p.variant_sku || null,
              retailer: (p.retailer as any) || null,
              tier: (p.tier as any) || null,
            })) ?? [];

        items.push({
          ingredientId: ingredient.id,
          name: ingredient.name,
          type: ingredient.type,
          amountPerServing: Number(ingredientRow?.ml_per_serving || 0) || 0,
          servings,
          unit: ingredient.unit,
          bottleSizeMl: ingredient.bottle_size_ml,
          purchaseUrl: ingredient.purchase_url,
          price: ingredient.price ?? null,
          packOptions: packOptions.length ? packOptions : null,
        });
      }
    }

    // Bars: add recommended small/large bars if they exist.
    try {
      const { data: barData } = await supabaseServer
        .from("ingredients")
        .select(
          "id, name, type, unit, bottle_size_ml, purchase_url, price, ingredient_packs(pack_size, pack_price, purchase_url, search_url, search_query, variant_sku, retailer, tier, is_active)",
        )
        .eq("type", "bar");
      const bars = (barData ?? []) as any[];
      const findBar = (needle: string) =>
        bars.find((b) => String(b?.name || "").toLowerCase().includes(needle)) || null;
      const large = findBar("large");
      const small = findBar("small");
      const largeCount = Math.floor(bartenderCount / 2);
      const smallCount = bartenderCount % 2;

      const makeBarItem = (b: any, count: number) => {
        const packs = (b?.ingredient_packs ?? []).filter((p: any) => p && p.is_active !== false);
        const packOptions: PackOption[] =
          packs
            .filter((p: any) => {
              const normalized = normalizePackTier(p?.tier);
              if (pricingTier === "top_shelf") return normalized === "first_class";
              return normalized === "economy";
            })
            .map((p: any) => ({
              packSize: Number(p.pack_size),
              packPrice: Number(p.pack_price),
              purchaseUrl: p.purchase_url || null,
              searchUrl: p.search_url || null,
              searchQuery: p.search_query || null,
              variantSku: p.variant_sku || null,
              retailer: (p.retailer as any) || null,
              tier: (p.tier as any) || null,
            })) ?? [];

        return {
          ingredientId: b.id,
          name: b.name,
          type: b.type,
          amountPerServing: 1,
          servings: count,
          unit: b.unit || "pcs",
          bottleSizeMl: b.bottle_size_ml,
          purchaseUrl: b.purchase_url,
          price: b.price ?? null,
          packOptions: packOptions.length ? packOptions : null,
        };
      };

      if (large && largeCount > 0) items.push(makeBarItem(large, largeCount));
      if (small && smallCount > 0) items.push(makeBarItem(small, smallCount));
    } catch {
      // ignore
    }

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

    const totals = buildIngredientTotals(items as any[]).sort((a, b) => {
      const typeA = typePriority[a.type] ?? 99;
      const typeB = typePriority[b.type] ?? 99;
      if (typeA !== typeB) return typeA - typeB;
      if (a.total !== b.total) return b.total - a.total;
      return a.name.localeCompare(b.name);
    });

    // Get Involved cocktail kits: choose the cheapest pack plan for each selected recipe.
    const kitPlan: Array<{ label: string; url: string; count: number }> = [];
    let kitCost = 0;
    try {
      for (const c of cocktailsSorted) {
        const recipe = rows
          .map((r) => (r?.recipes && Array.isArray(r.recipes) ? r.recipes[0] : r?.recipes))
          .find((rr) => String(rr?.id || "") === c.recipeId);

        const packs = (recipe?.recipe_packs ?? []).filter((p: any) => p && p.is_active !== false);
        if (!packs.length) continue;

        const required = Math.ceil((Number(c.servings) || 0) * 1.1);
        const options: PackOption[] = packs.map((p: any) => ({
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
        kitCost += Number(plan.totalCost) || 0;
        for (const line of plan.plan) {
          const url = line.purchaseUrl || "";
          if (!url || line.count <= 0) continue;
          kitPlan.push({
            label: `${c.name} (${line.packSize} pack)`,
            url,
            count: line.count,
          });
        }
      }
    } catch {
      // ignore
    }

    return json({
      event: ev,
      pricingTier,
      cocktails: cocktailsSorted,
      totals,
      recommendedMixologists: bartenderCount,
      kitPlan,
      kitCost,
    });
  } catch (e: any) {
    return json({ error: e?.message || "Server error" }, { status: 500 });
  }
}

