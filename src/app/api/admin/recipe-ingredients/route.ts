import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

function toNumber(value: any) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const recipe_id = String(body?.recipe_id || "").trim();
    const ingredient_id = String(body?.ingredient_id || "").trim();
    const ml_per_serving = toNumber(body?.ml_per_serving);

    if (!recipe_id || !ingredient_id) {
      return NextResponse.json(
        { error: "recipe_id and ingredient_id are required." },
        { status: 400 },
      );
    }
    if (ml_per_serving === null) {
      return NextResponse.json(
        { error: "ml_per_serving must be a number." },
        { status: 400 },
      );
    }

    const supabase = getSupabaseServerClient();
    const { error } = await supabase.from("recipe_ingredients").insert({
      recipe_id,
      ingredient_id,
      ml_per_serving,
    });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unable to link ingredient." },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const recipe_id = String(body?.recipe_id || "").trim();
    const ingredient_id = String(body?.ingredient_id || "").trim();
    const ml_per_serving = toNumber(body?.ml_per_serving);

    if (!recipe_id || !ingredient_id) {
      return NextResponse.json(
        { error: "recipe_id and ingredient_id are required." },
        { status: 400 },
      );
    }
    if (ml_per_serving === null) {
      return NextResponse.json(
        { error: "ml_per_serving must be a number." },
        { status: 400 },
      );
    }

    const supabase = getSupabaseServerClient();
    const { error } = await supabase
      .from("recipe_ingredients")
      .update({ ml_per_serving })
      .eq("recipe_id", recipe_id)
      .eq("ingredient_id", ingredient_id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unable to update recipe ingredient." },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const recipe_id = String(url.searchParams.get("recipe_id") || "").trim();
    const ingredient_id = String(url.searchParams.get("ingredient_id") || "").trim();
    if (!recipe_id || !ingredient_id) {
      return NextResponse.json(
        { error: "recipe_id and ingredient_id are required." },
        { status: 400 },
      );
    }

    const supabase = getSupabaseServerClient();
    const { error } = await supabase
      .from("recipe_ingredients")
      .delete()
      .eq("recipe_id", recipe_id)
      .eq("ingredient_id", ingredient_id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unable to delete recipe ingredient." },
      { status: 500 },
    );
  }
}

