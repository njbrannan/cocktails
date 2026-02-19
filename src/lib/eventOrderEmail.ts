import { buildIngredientTotals } from "@/lib/inventoryMath";

export function escapeHtml(input: string) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function formatOrderListHtml(
  totals: ReturnType<typeof buildIngredientTotals>,
) {
  const rows = totals
    .map((t) => {
      const pack =
        t.packPlan && t.packPlan.length
          ? t.packPlan
              .slice()
              .sort((a, b) => b.packSize - a.packSize)
              .map((p) => `${p.count} × ${p.packSize}${t.unit}`)
              .join(" + ")
          : t.bottlesNeeded
            ? `${t.bottlesNeeded} × ${t.bottleSizeMl}${t.unit}`
            : "";
      const right = pack
        ? `${t.total} ${t.unit} · ${pack}`
        : `${t.total} ${t.unit}`;
      return `<tr>
  <td style="padding:8px 10px;border-bottom:1px solid #eee"><strong>${escapeHtml(t.name)}</strong><br/><span style="color:#666;font-size:12px">${escapeHtml(t.type)}</span></td>
  <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">${escapeHtml(right)}</td>
</tr>`;
    })
    .join("");

  return `<table style="width:100%;border-collapse:collapse">${rows}</table>`;
}

export async function computeOrderListForEvent(supabaseServer: any, eventId: string) {
  const selectWithPacks =
    "servings, recipes(name, recipe_ingredients(ml_per_serving, ingredients(id, name, type, unit, bottle_size_ml, price, ingredient_packs(pack_size, pack_price, is_active))))";
  const selectWithoutPacks =
    "servings, recipes(name, recipe_ingredients(ml_per_serving, ingredients(id, name, type, unit, bottle_size_ml, price)))";

  let { data, error } = await supabaseServer
    .from("event_recipes")
    .select(selectWithPacks)
    .eq("event_id", eventId);

  if (
    error &&
    (String((error as any).code || "") === "42703" ||
      String(error.message || "").toLowerCase().includes("ingredient_packs"))
  ) {
    ({ data, error } = await supabaseServer
      .from("event_recipes")
      .select(selectWithoutPacks)
      .eq("event_id", eventId));
  }

  if (error) {
    throw new Error(error.message);
  }

  const rows = ((data ?? []) as unknown as Array<{
    servings: number;
    recipes: any;
  }>) as any[];

  const items = rows.flatMap((row) => {
    const recipes = row.recipes
      ? Array.isArray(row.recipes)
        ? row.recipes
        : [row.recipes]
      : [];

    return recipes.flatMap((recipe: any) => {
      const recipeIngredients = recipe.recipe_ingredients ?? [];
      return recipeIngredients.flatMap((ri: any) => {
        const ingredients = ri.ingredients
          ? Array.isArray(ri.ingredients)
            ? ri.ingredients
            : [ri.ingredients]
          : [];
        return ingredients.map((ingredient: any) => ({
          ingredientId: ingredient.id,
          name: ingredient.name,
          type: ingredient.type,
          amountPerServing: ri.ml_per_serving,
          servings: row.servings,
          unit: ingredient.unit,
          bottleSizeMl: ingredient.bottle_size_ml,
          price: ingredient.price ?? null,
          packOptions: (ingredient.ingredient_packs ?? [])
            .filter((p: any) => p?.is_active)
            .map((p: any) => ({
              packSize: Number(p.pack_size) || 0,
              packPrice: Number(p.pack_price) || 0,
            })),
        }));
      });
    });
  });

  return buildIngredientTotals(items);
}

export async function computeDrinksCountForEvent(supabaseServer: any, eventId: string) {
  const { data, error } = await supabaseServer
    .from("event_recipes")
    .select("servings")
    .eq("event_id", eventId);

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Array<{ servings: number }>;
  return rows.reduce((sum, r) => sum + (Number(r.servings) || 0), 0);
}
