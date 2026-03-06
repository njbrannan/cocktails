import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const name = String(body?.name || "").trim();
    const type = String(body?.type || "").trim();
    const bottle_size_ml =
      body?.bottle_size_ml === null || body?.bottle_size_ml === undefined
        ? null
        : Number(body?.bottle_size_ml);
    const unit = body?.unit ? String(body.unit) : null;

    if (!name) {
      return NextResponse.json({ error: "Name is required." }, { status: 400 });
    }
    if (!type) {
      return NextResponse.json({ error: "Type is required." }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    const { error } = await supabase.from("ingredients").insert({
      name,
      type,
      bottle_size_ml: Number.isFinite(bottle_size_ml) ? bottle_size_ml : null,
      unit,
    });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unable to add ingredient." },
      { status: 500 },
    );
  }
}

