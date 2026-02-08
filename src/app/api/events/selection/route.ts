import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getAdminEmail, isEmailConfigured, sendEmail } from "@/lib/resend";
import {
  computeDrinksCountForEvent,
  computeOrderListForEvent,
  escapeHtml,
  formatOrderListHtml,
} from "@/lib/eventOrderEmail";
import { NextRequest, NextResponse } from "next/server";

type Selection = { recipeId: string; servings: number };

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

async function getEventByToken(supabaseServer: any, token: string) {
  if (isUuidLike(token)) {
    const result = await supabaseServer
      .from("events")
      .select("id, status")
      .or(`edit_slug.eq.${token},edit_token.eq.${token}`)
      .single();
    if (result?.error?.code === "42703") {
      return supabaseServer
        .from("events")
        .select("id, status")
        .eq("edit_token", token)
        .single();
    }
    return result;
  }

  const result = await supabaseServer
    .from("events")
    .select("id, status")
    .eq("edit_slug", token)
    .single();
  if (result?.error?.code === "42703") {
    return supabaseServer
      .from("events")
      .select("id, status")
      .eq("edit_token", token)
      .single();
  }
  return result;
}

export async function GET(request: NextRequest) {
  try {
    const supabaseServer = getSupabaseServerClient();
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    const { data: event, error: eventError } = await getEventByToken(
      supabaseServer,
      token,
    );

    if (eventError) {
      return NextResponse.json({ error: eventError.message }, { status: 404 });
    }

    const { data: rows, error: selectionError } = await supabaseServer
      .from("event_recipes")
      .select("recipe_id, servings")
      .eq("event_id", event.id);

    if (selectionError) {
      return NextResponse.json({ error: selectionError.message }, { status: 400 });
    }

    return NextResponse.json({
      status: event.status,
      selections: (rows ?? []).map((r: any) => ({
        recipeId: r.recipe_id,
        servings: r.servings,
      })),
    });
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
    const token = body?.token as string | undefined;
    const selections = (body?.selections ?? []) as Selection[];

    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    const { data: event, error: eventError } = await getEventByToken(
      supabaseServer,
      token,
    );

    if (eventError) {
      return NextResponse.json({ error: eventError.message }, { status: 404 });
    }

    if (event.status === "confirmed") {
      return NextResponse.json(
        { error: "This request is confirmed and can no longer be edited." },
        { status: 403 },
      );
    }

    const cleaned = (selections ?? [])
      .filter((s) => s && s.recipeId && Number(s.servings) >= 0)
      .map((s) => ({ recipeId: s.recipeId, servings: Number(s.servings) }));

    // Simple, safe approach: replace all selections for the event.
    const { error: deleteError } = await supabaseServer
      .from("event_recipes")
      .delete()
      .eq("event_id", event.id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 400 });
    }

    const toInsert = cleaned.filter((s) => s.servings > 0);
    if (toInsert.length > 0) {
      const { error: insertError } = await supabaseServer.from("event_recipes").insert(
        toInsert.map((s) => ({
          event_id: event.id,
          recipe_id: s.recipeId,
          servings: s.servings,
        })),
      );

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 400 });
      }
    }

    // If already submitted, notify admin + client that the request was amended (when email is configured).
    if (event.status === "submitted" && isEmailConfigured()) {
      const { data: fullEvent, error: fullEventError } = await supabaseServer
        .from("events")
        .select(
          "id, title, event_date, guest_count, notes, status, client_email, client_phone, edit_token, edit_slug",
        )
        .eq("id", event.id)
        .single();

      if (!fullEventError && fullEvent) {
        const origin = request.headers.get("origin") || "";
        const editTokenForUrl = fullEvent.edit_slug || fullEvent.edit_token;
        const editLink = origin ? `${origin}/request/edit/${editTokenForUrl}` : "";

        const adminEmail = getAdminEmail();
        const clientEmail = String(fullEvent.client_email || "").trim();

        let drinksCount = 0;
        try {
          drinksCount = await computeDrinksCountForEvent(supabaseServer, event.id);
        } catch {
          drinksCount = 0;
        }

        let orderTotals: any[] = [];
        try {
          orderTotals = await computeOrderListForEvent(supabaseServer, event.id);
        } catch {
          orderTotals = [];
        }

        const { data: cocktailsRows } = await supabaseServer
          .from("event_recipes")
          .select("servings, recipes(name)")
          .eq("event_id", event.id);

        const cocktails = (cocktailsRows ?? [])
          .flatMap((r: any) => {
            const servings = Number(r.servings) || 0;
            const recipe = r.recipes
              ? Array.isArray(r.recipes)
                ? r.recipes[0]
                : r.recipes
              : null;
            const name = String(recipe?.name || "").trim();
            if (!name || servings <= 0) return [];
            return [{ name, servings }];
          })
          .sort((a: any, b: any) => a.name.localeCompare(b.name));

        const safeTitle = escapeHtml(String(fullEvent.title || "Cocktail request"));
        const safeDate = escapeHtml(String(fullEvent.event_date || "Date TBD"));
        const safeGuests = escapeHtml(String(fullEvent.guest_count || ""));
        const safeNotes = escapeHtml(String(fullEvent.notes || ""));
        const safePhone = escapeHtml(String(fullEvent.client_phone || ""));
        const safeDrinks = escapeHtml(String(drinksCount || ""));
        const safeLink = escapeHtml(editLink);

        const cocktailsHtml = cocktails.length
          ? `<ul>${cocktails
              .map(
                (c: any) =>
                  `<li>${escapeHtml(c.name)} · ${escapeHtml(String(c.servings))}</li>`,
              )
              .join("")}</ul>`
          : "<p style=\"margin:0;color:#666\">(No cocktails selected)</p>";

        const orderListHtml = orderTotals.length
          ? formatOrderListHtml(orderTotals)
          : "<p style=\"margin:0;color:#666\">(Order list unavailable)</p>";

        if (adminEmail) {
          const guestsHtml = fullEvent.guest_count
            ? safeGuests
            : "<em>(not provided)</em>";
          await sendEmail({
            to: adminEmail,
            subject: `Booking request updated: ${String(fullEvent.title || "Cocktail request")}`,
            replyTo: clientEmail || undefined,
            html: `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.5">
  <h2 style="margin:0 0 12px 0">Booking request updated</h2>
  <p style="margin:0 0 8px 0"><strong>Title:</strong> ${safeTitle}</p>
  <p style="margin:0 0 8px 0"><strong>Date:</strong> ${safeDate}</p>
  <p style="margin:0 0 8px 0"><strong>Number of drinks:</strong> ${safeDrinks}</p>
  <p style="margin:0 0 8px 0"><strong>Number of guests:</strong> ${guestsHtml}</p>
  <p style="margin:0 0 8px 0"><strong>Client email:</strong> ${escapeHtml(clientEmail)}</p>
  <p style="margin:0 0 8px 0"><strong>Telephone:</strong> ${safePhone}</p>
  <p style="margin:0 0 8px 0"><strong>Notes:</strong> ${safeNotes || "<em>(none)</em>"}</p>
  ${editLink ? `<p style="margin:12px 0 0 0"><strong>Edit link:</strong> <a href="${safeLink}">${safeLink}</a></p>` : ""}
  <h3 style="margin:16px 0 8px 0">Cocktails</h3>
  ${cocktailsHtml}
  <h3 style="margin:16px 0 8px 0">Order list</h3>
  ${orderListHtml}
</div>`,
            text: `Booking request updated\nTitle: ${String(fullEvent.title || "")}\nDate: ${String(fullEvent.event_date || "")}\nNumber of drinks: ${drinksCount || ""}\nNumber of guests: ${String(fullEvent.guest_count || "")}\nClient: ${clientEmail}\nTelephone: ${String(fullEvent.client_phone || "")}\nNotes: ${String(fullEvent.notes || "")}\n${editLink ? `Edit: ${editLink}` : ""}`,
          });
        }

        if (clientEmail && editLink) {
          await sendEmail({
            to: clientEmail,
            subject: `Updated request received: ${String(fullEvent.title || "Cocktail request")}`,
            replyTo: adminEmail || undefined,
            html: `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.5">
  <h2 style="margin:0 0 12px 0">Order amended</h2>
  <p style="margin:0 0 12px 0">We’ve received your updated booking request and will be in contact shortly.</p>
  <p style="margin:0 0 12px 0">Your updated selection:</p>
  ${cocktailsHtml}
  <p style="margin:12px 0 12px 0">
    <a href="${safeLink}" style="display:inline-block;padding:10px 14px;border-radius:12px;background:#6a2e2a;color:#f8f1e7;text-decoration:none;font-weight:600">
      Open your booking link
    </a>
  </p>
  <p style="margin:0;color:#666;font-size:12px;word-break:break-all">${safeLink}</p>
  <p style="margin:12px 0 0 0">Cheers!</p>
</div>`,
            text:
              `Order amended\n\nWe’ve received your updated booking request and will be in contact shortly.\n\n` +
              `Edit link: ${editLink}\n\nCheers!`,
          });
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Server error" },
      { status: 500 },
    );
  }
}
