import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

function isIsoDateTime(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return false;
  const t = new Date(value).getTime();
  return Number.isFinite(t);
}

export async function GET() {
  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("availability_slots")
      .select("id, start_ts, end_ts, is_active")
      .order("start_ts", { ascending: true })
      .limit(500);
    if (error) throw error;
    return NextResponse.json({ slots: data || [] });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unable to load slots." },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const start_ts = body?.start_ts;
    const end_ts = body?.end_ts;
    const is_active = body?.is_active;

    if (!isIsoDateTime(start_ts) || !isIsoDateTime(end_ts)) {
      return NextResponse.json(
        { error: "start_ts and end_ts must be valid ISO date-time strings." },
        { status: 400 },
      );
    }
    if (new Date(end_ts) <= new Date(start_ts)) {
      return NextResponse.json(
        { error: "end_ts must be after start_ts." },
        { status: 400 },
      );
    }

    const supabase = getSupabaseServerClient();
    const { error } = await supabase.from("availability_slots").insert({
      start_ts,
      end_ts,
      is_active: typeof is_active === "boolean" ? is_active : true,
    });
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unable to create slot." },
      { status: 500 },
    );
  }
}

