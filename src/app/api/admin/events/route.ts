import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { corsPreflight, withCors } from "@/lib/cors";

export function OPTIONS() {
  return corsPreflight();
}

function json(body: any, init?: Parameters<typeof NextResponse.json>[1]) {
  return withCors(NextResponse.json(body, init));
}

export async function GET() {
  try {
    const supabaseServer = getSupabaseServerClient();
    const { data, error } = await supabaseServer
      .from("events")
      .select("id, title, event_date, guest_count, status, pricing_tier")
      .order("event_date", { ascending: true });

    if (error) return json({ error: error.message }, { status: 400 });
    return json({ events: data || [] });
  } catch (e: any) {
    return json({ error: e?.message || "Server error" }, { status: 500 });
  }
}

