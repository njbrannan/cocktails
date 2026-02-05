import { supabaseServer } from "@/lib/supabaseServer";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { title, eventDate, guestCount, notes, clientEmail } = body;

  const { data, error } = await supabaseServer
    .from("events")
    .insert({
      title: title || "New Cocktail Event",
      event_date: eventDate || null,
      guest_count: guestCount || null,
      notes: notes || null,
      status: "draft",
      client_email: clientEmail || null,
    })
    .select("id, edit_token")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    id: data.id,
    editToken: data.edit_token,
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const { data, error } = await supabaseServer
    .from("events")
    .select("id, title, event_date, guest_count, notes, status")
    .eq("edit_token", token)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { token, title, eventDate, guestCount, notes, status } = body;

  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const { data, error } = await supabaseServer
    .from("events")
    .update({
      title,
      event_date: eventDate || null,
      guest_count: guestCount || null,
      notes: notes || null,
      status,
    })
    .eq("edit_token", token)
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ id: data.id });
}
