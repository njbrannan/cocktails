import { corsPreflight, withCors } from "@/lib/cors";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
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
  try {
    const supabaseServer = getSupabaseServerClient();
    const type = (request.nextUrl.searchParams.get("type") || "").trim();
    const selectWithPacks =
      "id, name, type, unit, bottle_size_ml, purchase_url, price, ingredient_packs(pack_size, pack_price, purchase_url, search_url, search_query, variant_sku, retailer, tier, is_active)";
    const selectWithoutPacks =
      "id, name, type, unit, bottle_size_ml, purchase_url, price";

    let data: any = null;
    let error: any = null;

    {
      let query = supabaseServer.from("ingredients").select(selectWithPacks);
      if (type) query = query.eq("type", type);
      const resp = await withTimeout(query, 12_000);
      data = resp.data;
      error = resp.error;
    }

    if (
      error &&
      (String((error as any).code || "") === "42703" ||
        String(error.message || "").toLowerCase().includes("ingredient_packs"))
    ) {
      let query = supabaseServer.from("ingredients").select(selectWithoutPacks);
      if (type) query = query.eq("type", type);
      const resp = await withTimeout(query, 12_000);
      data = resp.data;
      error = resp.error;
    }

    if (error) {
      return withCors(NextResponse.json({ error: error.message }, { status: 400 }));
    }

    const list = (data ?? []).slice().sort((a: any, b: any) => {
      return String(a?.name || "").localeCompare(String(b?.name || ""));
    });

    return withCors(
      NextResponse.json(
        { ingredients: list },
        {
          headers: {
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
