import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { NextRequest, NextResponse } from "next/server";

type Selection = { recipeId: string; servings: number };

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

async function getEventByToken(supabaseServer: any, token: string) {
  if (isUuidLike(token)) {
    const result = await supabaseServer
      .from("events")
      .select("id, status")
      .or(`edit_slug.eq.${token},edit_token.eq.${token}`)
      .single();
    if (result?.error?.code === "42703") {
      return supabaseServer
        .from("events")
        .select("id, status")
        .eq("edit_token", token)
        .single();
    }
    return result;
  }

  const result = await supabaseServer
    .from("events")
    .select("id, status")
    .eq("edit_slug", token)
    .single();
  if (result?.error?.code === "42703") {
    return supabaseServer
      .from("events")
      .select("id, status")
      .eq("edit_token", token)
      .single();
  }
  return result;
}

export async function GET(request: NextRequest) {
  try {
    const supabaseServer = getSupabaseServerClient();
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    const { data: event, error: eventError } = await getEventByToken(
      supabaseServer,
      token,
    );

    if (eventError) {
      return NextResponse.json({ error: eventError.message }, { status: 404 });
    }

    const { data: rows, error: selectionError } = await supabaseServer
      .from("event_recipes")
      .select("recipe_id, servings")
      .eq("event_id", event.id);

    if (selectionError) {
      return NextResponse.json({ error: selectionError.message }, { status: 400 });
    }

    return NextResponse.json({
      status: event.status,
      selections: (rows ?? []).map((r: any) => ({
        recipeId: r.recipe_id,
        servings: r.servings,
      })),
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Server error" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabaseServer = getSupabaseServerClient();
    const body = await request.json();
    const token = body?.token as string | undefined;
    const selections = (body?.selections ?? []) as Selection[];

    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    const { data: event, error: eventError } = await getEventByToken(
      supabaseServer,
      token,
    );

    if (eventError) {
      return NextResponse.json({ error: eventError.message }, { status: 404 });
    }

    if (event.status === "confirmed") {
      return NextResponse.json(
        { error: "This request is confirmed and can no longer be edited." },
        { status: 403 },
      );
    }

    const cleaned = (selections ?? [])
      .filter((s) => s && s.recipeId && Number(s.servings) >= 0)
      .map((s) => ({ recipeId: s.recipeId, servings: Number(s.servings) }));

    // Simple, safe approach: replace all selections for the event.
    const { error: deleteError } = await supabaseServer
      .from("event_recipes")
      .delete()
      .eq("event_id", event.id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 400 });
    }

    const toInsert = cleaned.filter((s) => s.servings > 0);
    if (toInsert.length > 0) {
      const { error: insertError } = await supabaseServer.from("event_recipes").insert(
        toInsert.map((s) => ({
          event_id: event.id,
          recipe_id: s.recipeId,
          servings: s.servings,
        })),
      );

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 400 });
      }
    }

    // Guest count is collected separately; drink totals are computed from selections when needed.

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Server error" },
      { status: 500 },
    );
  }
}
