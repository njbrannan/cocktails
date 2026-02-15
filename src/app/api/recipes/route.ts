import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const supabaseServer = getSupabaseServerClient();
    const { data, error } = await supabaseServer
      .from("recipes")
      .select(
        "id, name, description, image_url, recipe_ingredients(ml_per_serving, ingredients(id, name, type, unit, bottle_size_ml))",
      )
      .eq("is_active", true);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const list = (data ?? []).slice().sort((a: any, b: any) => {
      return String(a?.name || "").localeCompare(String(b?.name || ""));
    });

    return NextResponse.json(
      { recipes: list },
      {
        headers: {
          // Browser/CDN can cache this. The mobile app also caches it locally.
          "Cache-Control": "public, max-age=60, s-maxage=300",
        },
      },
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Server error" },
      { status: 500 },
    );
  }
}

