import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

export async function GET() {
  try {
    const supabase = getSupabaseServerClient();

    const [{ data: ingredients, error: ingErr }, { data: recipes, error: recErr }] =
      await Promise.all([
        supabase
          .from("ingredients")
          .select("id, name, type, bottle_size_ml, unit")
          .order("name", { ascending: true }),
        supabase
          .from("recipes")
          .select(
            "id, name, description, is_active, image_url, recipe_ingredients(ml_per_serving, ingredient_id, recipe_id, ingredients(id, name, type, bottle_size_ml, unit))",
          )
          .order("created_at", { ascending: false }),
      ]);

    if (ingErr) throw ingErr;
    if (recErr) throw recErr;

    return NextResponse.json({
      ingredients: ingredients || [],
      recipes: recipes || [],
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unable to load menu." },
      { status: 500 },
    );
  }
}

