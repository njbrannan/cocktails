import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { corsPreflight, withCors } from "@/lib/cors";
import { NextResponse } from "next/server";

export function OPTIONS() {
  return corsPreflight();
}

export async function GET() {
  try {
    const supabaseServer = getSupabaseServerClient();
    const selectWithPacks =
      "id, name, description, image_url, recipe_ingredients(ml_per_serving, ingredients(id, name, type, unit, bottle_size_ml, purchase_url, price, ingredient_packs(pack_size, pack_price, purchase_url, tier, is_active)))";
    const selectWithoutPacks =
      "id, name, description, image_url, recipe_ingredients(ml_per_serving, ingredients(id, name, type, unit, bottle_size_ml, purchase_url, price))";

    let { data, error } = await supabaseServer
      .from("recipes")
      .select(selectWithPacks)
      .eq("is_active", true);

    if (
      error &&
      (String((error as any).code || "") === "42703" ||
        String(error.message || "").toLowerCase().includes("ingredient_packs"))
    ) {
      ({ data, error } = await supabaseServer
        .from("recipes")
        .select(selectWithoutPacks)
        .eq("is_active", true));
    }

    if (error) {
      return withCors(NextResponse.json({ error: error.message }, { status: 400 }));
    }

    const list = (data ?? []).slice().sort((a: any, b: any) => {
      return String(a?.name || "").localeCompare(String(b?.name || ""));
    });

    return withCors(
      NextResponse.json(
        { recipes: list },
        {
          headers: {
            // Browser/CDN can cache this. The mobile app also caches it locally.
            "Cache-Control": "public, max-age=60, s-maxage=300",
          },
        },
      ),
    );
  } catch (err: any) {
    return withCors(
      NextResponse.json(
        { error: err?.message || "Server error" },
        { status: 500 },
      ),
    );
  }
}
