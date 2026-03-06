import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const name = String(body?.name || "").trim();
    const descriptionRaw = body?.description;
    const description =
      descriptionRaw === null || descriptionRaw === undefined
        ? null
        : String(descriptionRaw).trim() || null;
    const image_url =
      body?.image_url === null || body?.image_url === undefined
        ? null
        : String(body.image_url).trim() || null;
    const is_active =
      typeof body?.is_active === "boolean" ? body.is_active : true;

    if (!name) {
      return NextResponse.json({ error: "Name is required." }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    const { error } = await supabase.from("recipes").insert({
      name,
      description,
      image_url,
      is_active,
    });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unable to add recipe." },
      { status: 500 },
    );
  }
}

