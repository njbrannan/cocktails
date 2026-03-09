import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const eventId = String(url.searchParams.get("eventId") || "").trim();
  if (!eventId) return badRequest("Missing eventId.");

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("event_checklist")
    .select("key, label, checked, updated_at")
    .eq("event_id", eventId)
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const eventId = String(body?.eventId || "").trim();
  if (!eventId) return badRequest("Missing eventId.");

  const items = Array.isArray(body?.items) ? body.items : [];
  if (!items.length) return badRequest("Missing items.");

  const rows = items
    .map((it: any) => ({
      event_id: eventId,
      key: String(it?.key || "").trim(),
      label: String(it?.label || "").trim(),
      checked: Boolean(it?.checked),
      updated_at: new Date().toISOString(),
    }))
    .filter((r: { key: string; label: string }) => r.key && r.label);

  if (!rows.length) return badRequest("No valid items.");

  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("event_checklist")
    .upsert(rows, { onConflict: "event_id,key" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
