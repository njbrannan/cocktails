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
      const right = t.bottlesNeeded
        ? `${t.total} ${t.unit} · ${t.bottlesNeeded} × ${t.bottleSizeMl}${t.unit}`
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
  const { data, error } = await supabaseServer
    .from("event_recipes")
    .select(
      "servings, recipes(name, recipe_ingredients(ml_per_serving, ingredients(id, name, type, unit, bottle_size_ml)))",
    )
    .eq("event_id", eventId);

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
