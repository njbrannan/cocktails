import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

    const body = await req.json().catch(() => null);
    const patch: Record<string, any> = {};

    if (typeof body?.name === "string") patch.name = body.name.trim();
    if (body?.description !== undefined) {
      const v =
        body.description === null ? null : String(body.description).trim() || null;
      patch.description = v;
    }
    if (body?.image_url !== undefined) {
      const v = body.image_url === null ? null : String(body.image_url).trim() || null;
      patch.image_url = v;
    }
    if (typeof body?.is_active === "boolean") patch.is_active = body.is_active;

    if (!Object.keys(patch).length) {
      return NextResponse.json({ error: "No fields to update." }, { status: 400 });
    }
    if (patch.name !== undefined && !patch.name) {
      return NextResponse.json({ error: "Name cannot be empty." }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    const { error } = await supabase.from("recipes").update(patch).eq("id", id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unable to update recipe." },
      { status: 500 },
    );
  }
}

