import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { corsPreflight, withCors } from "@/lib/cors";
import { filterFallbackRecipes } from "@/lib/fallbackMenu";
import { NextRequest, NextResponse } from "next/server";

export function OPTIONS() {
  return corsPreflight();
}

async function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("Supabase request timed out")),
          ms,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function GET(request: NextRequest) {
  const ids = (request.nextUrl.searchParams.get("ids") || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  const fallbackResponse = (reason?: string) =>
    withCors(
      NextResponse.json(
        {
          recipes: filterFallbackRecipes(ids),
          fallback: true,
          reason: reason || null,
        },
        {
          headers: {
            "Cache-Control": "public, max-age=60, s-maxage=300",
          },
        },
      ),
    );

  try {
    const supabaseServer = getSupabaseServerClient();
    const selectWithPacks =
      "id, name, description, image_url, recipe_packs(pack_size, pack_price, purchase_url, variant_sku, tier, is_active), recipe_ingredients(ml_per_serving, ingredients(id, name, type, unit, bottle_size_ml, purchase_url, price, ingredient_packs(pack_size, pack_price, purchase_url, search_url, search_query, variant_sku, retailer, tier, is_active)))";
    const selectWithoutPacks =
      "id, name, description, image_url, recipe_ingredients(ml_per_serving, ingredients(id, name, type, unit, bottle_size_ml, purchase_url, price))";

    let data: any = null;
    let error: any = null;
    {
      let query = supabaseServer
        .from("recipes")
        .select(selectWithPacks);
      query = ids.length ? query.in("id", ids) : query.eq("is_active", true);
      const resp = await withTimeout(query, 12_000);
      data = resp.data;
      error = resp.error;
    }

    if (
      error &&
      (String((error as any).code || "") === "42703" ||
        String(error.message || "").toLowerCase().includes("ingredient_packs") ||
        String(error.message || "").toLowerCase().includes("recipe_packs"))
    ) {
      let query = supabaseServer
        .from("recipes")
        .select(selectWithoutPacks);
      query = ids.length ? query.in("id", ids) : query.eq("is_active", true);
      const resp = await withTimeout(query, 12_000);
      data = resp.data;
      error = resp.error;
    }

    if (error) {
      return fallbackResponse(error.message);
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
    return fallbackResponse(err?.message || "Server error");
  }
}
