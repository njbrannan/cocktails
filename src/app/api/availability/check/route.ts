import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const startIso = String(body?.start || "").trim();
    const endIso = String(body?.end || "").trim();

    if (!startIso || !endIso) {
      return NextResponse.json(
        { error: "Missing start/end." },
        { status: 400 },
      );
    }

    const start = new Date(startIso);
    const end = new Date(endIso);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
      return NextResponse.json({ error: "Invalid start/end." }, { status: 400 });
    }
    if (end <= start) {
      return NextResponse.json(
        { error: "End must be after start." },
        { status: 400 },
      );
    }

    const supabase = getSupabaseServerClient();

    // We treat rows in availability_slots as *blocked* periods.
    // If no slots exist at all, fail open (so the app doesn't lock up on day 1).
    const { count: totalSlots, error: countErr } = await supabase
      .from("availability_slots")
      .select("id", { count: "exact", head: true });
    if (countErr) {
      return NextResponse.json(
        { error: countErr.message },
        { status: 502 },
      );
    }
    if (!totalSlots || totalSlots <= 0) {
      return NextResponse.json({ available: true, reason: "no_slots_configured" });
    }

    const { data, error } = await supabase
      .from("availability_slots")
      .select("id, start_ts, end_ts")
      .eq("is_active", true)
      // Overlap rule: start < block.end AND end > block.start
      .lt("start_ts", end.toISOString())
      .gt("end_ts", start.toISOString())
      .limit(1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }

    const blocked = Boolean(data && data.length);
    return NextResponse.json({ available: !blocked });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 },
    );
  }
}
