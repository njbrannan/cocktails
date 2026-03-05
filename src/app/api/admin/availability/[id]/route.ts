import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const body = await req.json().catch(() => null);

    const patch: Record<string, any> = {};
    if (typeof body?.is_active === "boolean") patch.is_active = body.is_active;
    if (typeof body?.start_ts === "string") patch.start_ts = body.start_ts;
    if (typeof body?.end_ts === "string") patch.end_ts = body.end_ts;

    if (!id) {
      return NextResponse.json({ error: "Missing id." }, { status: 400 });
    }
    if (!Object.keys(patch).length) {
      return NextResponse.json({ error: "No fields to update." }, { status: 400 });
    }
    if (patch.start_ts && !Number.isFinite(new Date(patch.start_ts).getTime())) {
      return NextResponse.json({ error: "Invalid start_ts." }, { status: 400 });
    }
    if (patch.end_ts && !Number.isFinite(new Date(patch.end_ts).getTime())) {
      return NextResponse.json({ error: "Invalid end_ts." }, { status: 400 });
    }
    if (patch.start_ts && patch.end_ts && new Date(patch.end_ts) <= new Date(patch.start_ts)) {
      return NextResponse.json(
        { error: "end_ts must be after start_ts." },
        { status: 400 },
      );
    }

    const supabase = getSupabaseServerClient();
    const { error } = await supabase
      .from("availability_slots")
      .update(patch)
      .eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unable to update slot." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    if (!id) {
      return NextResponse.json({ error: "Missing id." }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    const { error } = await supabase
      .from("availability_slots")
      .delete()
      .eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unable to delete slot." },
      { status: 500 },
    );
  }
}

