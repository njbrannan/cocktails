import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getAdminEmail, isEmailConfigured, sendEmail } from "@/lib/resend";
import { buildIngredientTotals } from "@/lib/inventoryMath";
import { NextRequest, NextResponse } from "next/server";

function escapeHtml(input: string) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function friendlyTokenLabel(token: string) {
  // Deterministic "cute" label so the link feels nicer in emails,
  // without changing the actual security token.
  const fruits = [
    "Lime",
    "Lemon",
    "Orange",
    "Cherry",
    "Mango",
    "Pineapple",
    "Passionfruit",
    "Grapefruit",
    "Peach",
    "Strawberry",
    "Coconut",
  ];
  const cocktailWords = [
    "Spritz",
    "Mule",
    "Daiquiri",
    "Martini",
    "OldFashioned",
    "Margarita",
    "Mojito",
    "Fizz",
    "Sour",
    "Negroni",
  ];
  const fancyBits = [
    "Zest",
    "Garnish",
    "Coupette",
    "Shaker",
    "Bitters",
    "Velvet",
    "Golden",
    "Spiced",
    "Citrus",
    "Mint",
  ];

  // Tiny hash: stable across runtimes.
  let h = 0;
  for (let i = 0; i < token.length; i++) h = (h * 31 + token.charCodeAt(i)) >>> 0;
  const pick = (arr: string[], offset: number) => arr[(h + offset) % arr.length];
  return `${pick(fancyBits, 1)}-${pick(fruits, 7)}-${pick(cocktailWords, 13)}`;
}

type CocktailSelection = {
  recipeId: string;
  recipeName?: string;
  servings: number;
};

function formatOrderListHtml(
  totals: ReturnType<typeof buildIngredientTotals>,
) {
  const rows = totals
    .map((t) => {
      const right = t.bottlesNeeded
        ? `${t.total} ml · ${t.bottlesNeeded} × ${t.bottleSizeMl}ml`
        : `${t.total} ${t.unit}`;
      return `<tr>
  <td style="padding:8px 10px;border-bottom:1px solid #eee"><strong>${escapeHtml(t.name)}</strong><br/><span style="color:#666;font-size:12px">${escapeHtml(t.type)}</span></td>
  <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">${escapeHtml(right)}</td>
</tr>`;
    })
    .join("");

  return `<table style="width:100%;border-collapse:collapse">${rows}</table>`;
}

async function computeOrderListForEvent(supabaseServer: any, eventId: string) {
  const { data, error } = await supabaseServer
    .from("event_recipes")
    .select(
      "servings, recipes(name, recipe_ingredients(ml_per_serving, ingredients(id, name, type, unit, bottle_size_ml)))",
    )
    .eq("event_id", eventId);

  if (error) {
    throw new Error(error.message);
  }

  const rows = ((data ?? []) as unknown as Array<{
    servings: number;
    recipes: any;
  }>) as any[];

  const items = rows.flatMap((row) => {
    const recipes = row.recipes
      ? Array.isArray(row.recipes)
        ? row.recipes
        : [row.recipes]
      : [];

    return recipes.flatMap((recipe: any) => {
      const recipeIngredients = recipe.recipe_ingredients ?? [];
      return recipeIngredients.flatMap((ri: any) => {
        const ingredients = ri.ingredients
          ? Array.isArray(ri.ingredients)
            ? ri.ingredients
            : [ri.ingredients]
          : [];
        return ingredients.map((ingredient: any) => ({
          ingredientId: ingredient.id,
          name: ingredient.name,
          type: ingredient.type,
          amountPerServing: ri.ml_per_serving,
          servings: row.servings,
          unit: ingredient.unit,
          bottleSizeMl: ingredient.bottle_size_ml,
        }));
      });
    });
  });

  return buildIngredientTotals(items);
}

export async function POST(request: NextRequest) {
  try {
    const supabaseServer = getSupabaseServerClient();
    const body = await request.json();
    const {
      title,
      eventDate,
      guestCount,
      notes,
      clientEmail,
      clientPhone,
      cocktails,
      submit,
    }: {
      title?: string;
      eventDate?: string;
      guestCount?: number;
      notes?: string;
      clientEmail?: string;
      clientPhone?: string;
      cocktails?: CocktailSelection[];
      submit?: boolean;
    } = body;

    // Enforce "today or future" for eventDate on the server (prevents bypassing UI constraints).
    if (eventDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const submitted = new Date(`${eventDate}T00:00:00`);
      if (Number.isNaN(submitted.valueOf()) || submitted < today) {
        return NextResponse.json(
          { error: "Date of Event must be today or in the future." },
          { status: 400 },
        );
      }
    }

    const cleanedCocktails = (cocktails ?? [])
      .filter((c) => c && c.recipeId && Number(c.servings) > 0)
      .map((c) => ({
        recipeId: c.recipeId,
        recipeName: c.recipeName,
        servings: Number(c.servings),
      }));

    const computedGuestCount =
      typeof guestCount === "number" && guestCount > 0
        ? guestCount
        : cleanedCocktails.reduce((sum, c) => sum + c.servings, 0) || null;

    const { data, error } = await supabaseServer
      .from("events")
      .insert({
        title: title || "New Cocktail Event",
        event_date: eventDate || null,
        guest_count: computedGuestCount,
        notes: notes || null,
        status: submit ? "submitted" : "draft",
        client_email: clientEmail || null,
        client_phone: clientPhone || null,
      })
      .select("id, edit_token")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const origin = request.headers.get("origin") || "";
    const editLink = origin ? `${origin}/request/edit/${data.edit_token}` : "";
    const adminEmail = getAdminEmail();

    if (cleanedCocktails.length > 0) {
      const { error: insertEventRecipesError } = await supabaseServer
        .from("event_recipes")
        .insert(
          cleanedCocktails.map((c) => ({
            event_id: data.id,
            recipe_id: c.recipeId,
            servings: c.servings,
          })),
        );

      if (insertEventRecipesError) {
        return NextResponse.json(
          { error: insertEventRecipesError.message },
          { status: 400 },
        );
      }
    }

    // If it's submitted immediately, email admin + client confirmation (when email is configured).
    if (submit && isEmailConfigured()) {
      const safeTitle = escapeHtml(title || "Cocktail request");
      const safeDate = escapeHtml(eventDate || "Date TBD");
      const safeGuests = escapeHtml(String(computedGuestCount ?? ""));
      const safeNotes = escapeHtml(notes || "");
      const safeLink = escapeHtml(editLink);
      const linkLabel = friendlyTokenLabel(data.edit_token);

      let orderTotals: ReturnType<typeof buildIngredientTotals> = [];
      try {
        orderTotals = await computeOrderListForEvent(supabaseServer, data.id);
      } catch {
        orderTotals = [];
      }

      const cocktailsHtml = cleanedCocktails.length
        ? `<ul>${cleanedCocktails
            .map(
              (c) =>
                `<li>${escapeHtml(c.recipeName || c.recipeId)} · ${escapeHtml(String(c.servings))}</li>`,
            )
            .join("")}</ul>`
        : "";

      const orderListHtml = orderTotals.length
        ? formatOrderListHtml(orderTotals)
        : "<p style=\"margin:0;color:#666\">(Order list unavailable)</p>";

      if (adminEmail) {
        await sendEmail({
          to: adminEmail,
          subject: `New booking request: ${title || "Cocktail request"}`,
          // Let the team simply hit "Reply" to respond to the client.
          replyTo: clientEmail || undefined,
          html: `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.5">
  <h2 style="margin:0 0 12px 0">New booking request submitted</h2>
  <p style="margin:0 0 8px 0"><strong>Title:</strong> ${safeTitle}</p>
  <p style="margin:0 0 8px 0"><strong>Date:</strong> ${safeDate}</p>
  <p style="margin:0 0 8px 0"><strong>Guests:</strong> ${safeGuests}</p>
  <p style="margin:0 0 8px 0"><strong>Client email:</strong> ${escapeHtml(clientEmail || "")}</p>
  <p style="margin:0 0 8px 0"><strong>Telephone:</strong> ${escapeHtml(clientPhone || "")}</p>
  <p style="margin:0 0 8px 0"><strong>Notes:</strong> ${safeNotes || "<em>(none)</em>"}</p>
  ${editLink ? `<p style="margin:12px 0 0 0"><strong>Edit link:</strong> <a href="${safeLink}">${safeLink}</a></p>` : ""}
  <h3 style="margin:16px 0 8px 0">Order list</h3>
  ${orderListHtml}
</div>`,
          text: `New booking request submitted\nTitle: ${title || ""}\nDate: ${eventDate || ""}\nGuests: ${computedGuestCount || ""}\nClient: ${clientEmail || ""}\nTelephone: ${clientPhone || ""}\nNotes: ${notes || ""}\n${editLink ? `Edit: ${editLink}` : ""}`,
        });
      }

      if (clientEmail && editLink) {
        await sendEmail({
          to: clientEmail,
          subject: `Request sent: ${title || "Cocktail request"}`,
          html: `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.5">
  <h2 style="margin:0 0 12px 0">Thank you!</h2>
  <p style="margin:0 0 12px 0">We have received your booking request. A member of our team will be in contact shortly to organise everything with you properly.</p>
  <p style="margin:0 0 12px 0">In the meantime, if you would like to update your booking request, please feel free to use your personal booking request link to make amendments:</p>
  <p style="margin:0 0 12px 0">
    <a href="${safeLink}" style="display:inline-block;padding:10px 14px;border-radius:12px;background:#6a2e2a;color:#f8f1e7;text-decoration:none;font-weight:600">
      Open your booking link
    </a>
  </p>
  <p style="margin:0 0 8px 0;color:#666;font-size:12px">Link name: <strong>${escapeHtml(linkLabel)}</strong></p>
  <p style="margin:0;color:#666;font-size:12px;word-break:break-all">${safeLink}</p>
  <p style="margin:12px 0 0 0">Cheers!</p>
</div>`,
          text:
            `Thank you! We have received your booking request. ` +
            `A member of our team will be in contact shortly to organise everything with you properly.\n\n` +
            `In the meantime, if you would like to update your booking request, please use your personal booking request link:\n` +
            `${editLink}\n\n` +
            `Cheers!`,
          replyTo: adminEmail || undefined,
        });
      }
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
      const linkLabel = friendlyTokenLabel(data.edit_token);

      if (adminEmail) {
        await sendEmail({
          to: adminEmail,
          subject: `New booking request: ${data.title || "Cocktail request"}`,
          // Let the team simply hit "Reply" to respond to the client.
          replyTo: data.client_email || undefined,
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
  <h2 style="margin:0 0 12px 0">Thank you!</h2>
  <p style="margin:0 0 12px 0">We have received your booking request. A member of our team will be in contact shortly to organise everything with you properly.</p>
  <p style="margin:0 0 12px 0">In the meantime, if you would like to update your booking request, please feel free to use your personal booking request link to make amendments:</p>
  <p style="margin:0 0 12px 0">
    <a href="${safeLink}" style="display:inline-block;padding:10px 14px;border-radius:12px;background:#6a2e2a;color:#f8f1e7;text-decoration:none;font-weight:600">
      Open your booking link
    </a>
  </p>
  <p style="margin:0 0 8px 0;color:#666;font-size:12px">Link name: <strong>${escapeHtml(linkLabel)}</strong></p>
  <p style="margin:0;color:#666;font-size:12px;word-break:break-all">${safeLink}</p>
  <p style="margin:12px 0 0 0">Cheers!</p>
</div>`,
          text:
            `Thank you! We have received your booking request. ` +
            `A member of our team will be in contact shortly to organise everything with you properly.\n\n` +
            `In the meantime, if you would like to update your booking request, please use your personal booking request link:\n` +
            `${editLink}\n\n` +
            `Cheers!`,
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
