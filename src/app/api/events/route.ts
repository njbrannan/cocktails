import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getAdminEmail, isEmailConfigured, sendEmail } from "@/lib/resend";
import { NextRequest, NextResponse } from "next/server";

function escapeHtml(input: string) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function POST(request: NextRequest) {
  try {
    const supabaseServer = getSupabaseServerClient();
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

    const origin = request.headers.get("origin") || "";
    const editLink = origin ? `${origin}/request/edit/${data.edit_token}` : "";

    // Draft created: email the client their private edit link (when email is configured).
    if (clientEmail && isEmailConfigured() && editLink) {
      const safeTitle = escapeHtml(title || "Cocktail request");
      const safeLink = escapeHtml(editLink);

      await sendEmail({
        to: clientEmail,
        subject: `Your edit link: ${title || "Cocktail request"}`,
        html: `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.5">
  <h2 style="margin:0 0 12px 0">Your private edit link</h2>
  <p style="margin:0 0 12px 0">Request: <strong>${safeTitle}</strong></p>
  <p style="margin:0 0 12px 0">Use this link to edit your request any time:</p>
  <p style="margin:0 0 12px 0"><a href="${safeLink}">${safeLink}</a></p>
  <p style="margin:0;color:#555">If you didn’t request this, you can ignore this email.</p>
</div>`,
        text: `Your private edit link for "${title || "Cocktail request"}": ${editLink}`,
      });
    }

    return NextResponse.json({
      id: data.id,
      editToken: data.edit_token,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Server error" },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabaseServer = getSupabaseServerClient();
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
    const { token, title, eventDate, guestCount, notes, status } = body;

    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    // We only want to fire "request submitted" emails on the transition to submitted.
    const { data: existing, error: existingError } = await supabaseServer
      .from("events")
      .select("id, title, event_date, guest_count, notes, status, client_email, edit_token")
      .eq("edit_token", token)
      .single();

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 404 });
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
      .select("id, title, event_date, guest_count, notes, status, client_email, edit_token")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const becameSubmitted =
      existing.status !== "submitted" && data.status === "submitted";

    if (becameSubmitted && isEmailConfigured()) {
      const origin = request.headers.get("origin") || "";
      const editLink = origin ? `${origin}/request/edit/${data.edit_token}` : "";

      const adminEmail = getAdminEmail();
      const safeTitle = escapeHtml(data.title || "Cocktail request");
      const safeDate = escapeHtml(data.event_date || "Date TBD");
      const safeGuests = escapeHtml(String(data.guest_count ?? ""));
      const safeNotes = escapeHtml(data.notes || "");
      const safeLink = escapeHtml(editLink);

      if (adminEmail) {
        await sendEmail({
          to: adminEmail,
          subject: `New booking request: ${data.title || "Cocktail request"}`,
          html: `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.5">
  <h2 style="margin:0 0 12px 0">New booking request submitted</h2>
  <p style="margin:0 0 8px 0"><strong>Title:</strong> ${safeTitle}</p>
  <p style="margin:0 0 8px 0"><strong>Date:</strong> ${safeDate}</p>
  <p style="margin:0 0 8px 0"><strong>Guests:</strong> ${safeGuests}</p>
  <p style="margin:0 0 8px 0"><strong>Client email:</strong> ${escapeHtml(data.client_email || "")}</p>
  <p style="margin:0 0 8px 0"><strong>Notes:</strong> ${safeNotes || "<em>(none)</em>"}</p>
  ${
    editLink
      ? `<p style="margin:12px 0 0 0"><strong>Edit link:</strong> <a href="${safeLink}">${safeLink}</a></p>`
      : ""
  }
</div>`,
          text: `New booking request submitted\nTitle: ${data.title || ""}\nDate: ${data.event_date || ""}\nGuests: ${data.guest_count || ""}\nClient: ${data.client_email || ""}\nNotes: ${data.notes || ""}\n${editLink ? `Edit: ${editLink}` : ""}`,
        });
      }

      if (data.client_email && editLink) {
        await sendEmail({
          to: data.client_email,
          subject: `Request sent: ${data.title || "Cocktail request"}`,
          html: `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.5">
  <h2 style="margin:0 0 12px 0">Request sent</h2>
  <p style="margin:0 0 12px 0">We’ve received your request: <strong>${safeTitle}</strong>.</p>
  <p style="margin:0 0 12px 0">If you need to make changes, use your private edit link:</p>
  <p style="margin:0 0 12px 0"><a href="${safeLink}">${safeLink}</a></p>
</div>`,
          text: `We’ve received your request: ${data.title || ""}\nEdit link: ${editLink}`,
        });
      }
    }

    return NextResponse.json({ id: data.id });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Server error" },
      { status: 500 },
    );
  }
}
