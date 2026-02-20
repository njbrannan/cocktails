import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getAdminEmail, isEmailConfigured, sendEmail } from "@/lib/resend";
import { buildIngredientTotals } from "@/lib/inventoryMath";
import { corsPreflight, withCors } from "@/lib/cors";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export function OPTIONS() {
  return corsPreflight();
}

function json(body: any, init?: Parameters<typeof NextResponse.json>[1]) {
  return withCors(NextResponse.json(body, init));
}

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

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function toKebab(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
}

function createFancyEditSlug() {
  const cocktails = [
    "Negroni",
    "Spritz",
    "Margarita",
    "Mojito",
    "Mule",
    "Daiquiri",
    "Martini",
    "Old Fashioned",
    "Gimlet",
    "Sour",
    "Fizz",
    "Collins",
    "Paloma",
    "Manhattan",
  ];
  const michelin = [
    "Yuzu",
    "Saffron",
    "Truffle",
    "Bergamot",
    "Vanilla",
    "Matcha",
    "Hibiscus",
    "Fig",
    "Pistachio",
    "Hazelnut",
    "Tonka",
    "Jasmine",
    "Lavender",
    "Cacao",
  ];
  const flavors = [
    "Citrus",
    "Smoked",
    "Spiced",
    "Salted",
    "Honeyed",
    "Floral",
    "Herbal",
    "Bitter",
    "Caramel",
    "Peppery",
    "Velvet",
    "Golden",
    "Bright",
  ];
  const styles = [
    "Shaken",
    "Stirred",
    "Clarified",
    "Barrel Aged",
    "Fat Washed",
    "Nitro",
    "Zested",
    "Garnished",
  ];

  const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)]!;
  // Short secret code to keep the URL human-friendly while still unguessable.
  // 6 bytes => 48 bits => 8 base64url chars.
  const rand = crypto.randomBytes(6).toString("base64url");

  const parts = [
    toKebab(pick(flavors)),
    toKebab(pick(michelin)),
    toKebab(pick(cocktails)),
    toKebab(pick(styles)),
    rand,
  ].filter(Boolean);

  return parts.join("-");
}

async function getEventByToken(supabaseServer: any, token: string, columns: string) {
  if (isUuidLike(token)) {
    const result = await supabaseServer
      .from("events")
      .select(columns)
      .or(`edit_slug.eq.${token},edit_token.eq.${token}`)
      .single();
    // If the DB hasn't been migrated yet (missing `edit_slug`), fall back gracefully.
    if (result?.error?.code === "42703") {
      return supabaseServer
        .from("events")
        .select(columns)
        .eq("edit_token", token)
        .single();
    }
    return result;
  }

  const result = await supabaseServer
    .from("events")
    .select(columns)
    .eq("edit_slug", token)
    .single();
  if (result?.error?.code === "42703") {
    return supabaseServer
      .from("events")
      .select(columns)
      .eq("edit_token", token)
      .single();
  }
  return result;
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
      const pack =
        t.packPlan && t.packPlan.length
          ? t.packPlan
              .slice()
              .sort((a, b) => b.packSize - a.packSize)
              .map((p) => `${p.count} × ${p.packSize}${t.unit}`)
              .join(" + ")
          : t.bottlesNeeded
            ? `${t.bottlesNeeded} × ${t.bottleSizeMl}${t.unit}`
            : "";
      const right = pack
        ? `${t.total} ${t.unit} · ${pack}`
        : `${t.total} ${t.unit}`;
      return `<tr>
  <td style="padding:8px 10px;border-bottom:1px solid #eee"><strong>${escapeHtml(t.name)}</strong><br/><span style="color:#666;font-size:12px">${escapeHtml(t.type)}</span></td>
  <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">${escapeHtml(right)}</td>
</tr>`;
    })
    .join("");

  return `<table style="width:100%;border-collapse:collapse">${rows}</table>`;
}

async function computeOrderListForEvent(
  supabaseServer: any,
  eventId: string,
  pricingTier: "economy" | "business" | "first_class" = "economy",
) {
  const selectWithPacks =
    "servings, recipes(name, recipe_ingredients(ml_per_serving, ingredients(id, name, type, unit, bottle_size_ml, purchase_url, price, ingredient_packs(pack_size, pack_price, purchase_url, search_url, search_query, retailer, tier, is_active))))";
  const selectWithoutPacks =
    "servings, recipes(name, recipe_ingredients(ml_per_serving, ingredients(id, name, type, unit, bottle_size_ml, purchase_url, price)))";

  let { data, error } = await supabaseServer
    .from("event_recipes")
    .select(selectWithPacks)
    .eq("event_id", eventId);

  if (
    error &&
    (String((error as any).code || "") === "42703" ||
      String(error.message || "").toLowerCase().includes("ingredient_packs"))
  ) {
    ({ data, error } = await supabaseServer
      .from("event_recipes")
      .select(selectWithoutPacks)
      .eq("event_id", eventId));
  }

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

        return ingredients.map((ingredient: any) => {
          const packs = (ingredient.ingredient_packs ?? [])
            .filter((p: any) => p?.is_active)
            .filter((p: any) => {
              const t = String(p?.tier || "").toLowerCase();
              if (pricingTier === "first_class") return t === "first_class" || t === "premium";
              if (pricingTier === "business") return t === "business";
              return t === "economy" || t === "budget" || t === "";
            });

          return {
          ingredientId: ingredient.id,
          name: ingredient.name,
          type: ingredient.type,
          amountPerServing: ri.ml_per_serving,
          servings: row.servings,
          unit: ingredient.unit,
          bottleSizeMl: ingredient.bottle_size_ml,
          purchaseUrl: ingredient.purchase_url,
          price: ingredient.price ?? null,
          packOptions: packs.map((p: any) => ({
              packSize: Number(p.pack_size),
              packPrice: Number(p.pack_price),
              purchaseUrl: p.purchase_url || null,
              searchUrl: p.search_url || null,
              searchQuery: p.search_query || null,
              retailer: (p.retailer as any) || null,
              tier: (p.tier as any) || null,
            })),
          };
        });
      });
    });
  });

  return buildIngredientTotals(items);
}

async function computeDrinksCountForEvent(supabaseServer: any, eventId: string) {
  const { data, error } = await supabaseServer
    .from("event_recipes")
    .select("servings")
    .eq("event_id", eventId);

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Array<{ servings: number }>;
  return rows.reduce((sum, r) => sum + (Number(r.servings) || 0), 0);
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
      pricingTier,
    }: {
      title?: string;
      eventDate?: string;
      guestCount?: number;
      notes?: string;
      clientEmail?: string;
      clientPhone?: string;
      cocktails?: CocktailSelection[];
      submit?: boolean;
      pricingTier?: "economy" | "business" | "first_class";
    } = body;

    if (submit) {
      const phone = String(clientPhone || "").trim();
      if (!phone) {
        return json({ error: "Telephone number is required." }, { status: 400 });
      }
    }

    // Enforce "today or future" for eventDate on the server (prevents bypassing UI constraints).
    if (eventDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const submitted = new Date(`${eventDate}T00:00:00`);
      if (Number.isNaN(submitted.valueOf()) || submitted < today) {
        return json(
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

    const computedDrinksCount =
      cleanedCocktails.reduce((sum, c) => sum + c.servings, 0) || 0;

    let cleanedGuestCount: number | null = null;
    if (typeof guestCount === "number") {
      if (
        !Number.isFinite(guestCount) ||
        !Number.isInteger(guestCount) ||
        guestCount <= 0
      ) {
        return json(
          { error: "Number of guests must be a whole number." },
          { status: 400 },
        );
      }
      cleanedGuestCount = guestCount;
    }

    const { data, error } = await supabaseServer
      .from("events")
      .insert({
        title: title || "New Cocktail Event",
        event_date: eventDate || null,
        guest_count: cleanedGuestCount,
        notes: notes || null,
        status: submit ? "submitted" : "draft",
        client_email: clientEmail || null,
        client_phone: clientPhone || null,
          pricing_tier:
            pricingTier === "first_class"
              ? "first_class"
              : pricingTier === "business"
                ? "business"
                : "economy",
      })
      .select("id, edit_token")
      .single();

    if (error) {
      return json({ error: error.message }, { status: 400 });
    }

    const origin = request.headers.get("origin") || "";
    const adminEmail = getAdminEmail();

    // Generate a human-friendly edit URL slug so the actual URL looks nicer.
    // We update after insert to avoid accidental duplicate event rows if a slug collides.
    let editSlug: string | null = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      const candidate = createFancyEditSlug();
      const { error: slugError } = await supabaseServer
        .from("events")
        .update({ edit_slug: candidate })
        .eq("id", data.id);

      if (!slugError) {
        editSlug = candidate;
        break;
      }

      // If the DB isn't migrated yet, don't fail the request.
      if (slugError.code === "42703") {
        break;
      }

      // 23505 = unique_violation
      if (slugError.code !== "23505") {
        break;
      }
    }

    const editTokenForUrl = editSlug || data.edit_token;
    const editLink = origin ? `${origin}/request/edit/${editTokenForUrl}` : "";

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
        return json(
          { error: insertEventRecipesError.message },
          { status: 400 },
        );
      }
    }

    const emailReport: {
      configured: boolean;
      admin: { ok: boolean; id?: string; error?: string };
      client: { ok: boolean; id?: string; error?: string };
    } = {
      configured: isEmailConfigured(),
      admin: { ok: false },
      client: { ok: false },
    };

    // If it's submitted immediately, email admin + client confirmation (when email is configured).
    if (submit && emailReport.configured) {
      const safeTitle = escapeHtml(title || "Cocktail request");
      const safeDate = escapeHtml(eventDate || "Date TBD");
      const safeDrinks = escapeHtml(String(computedDrinksCount));
      const safeGuests = escapeHtml(String(cleanedGuestCount ?? ""));
      const safeNotes = escapeHtml(notes || "");
      const safeLink = escapeHtml(editLink);

      let orderTotals: ReturnType<typeof buildIngredientTotals> = [];
      try {
        orderTotals = await computeOrderListForEvent(supabaseServer, data.id, pricingTier);
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
        const guestsHtml = cleanedGuestCount
          ? safeGuests
          : "<em>(not provided)</em>";
        const res = await sendEmail({
          to: adminEmail,
          subject: `New booking request: ${title || "Cocktail request"}`,
          // Let the team simply hit "Reply" to respond to the client.
          replyTo: clientEmail || undefined,
          html: `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.5">
  <h2 style="margin:0 0 12px 0">New booking request submitted</h2>
  <p style="margin:0 0 8px 0"><strong>Title:</strong> ${safeTitle}</p>
  <p style="margin:0 0 8px 0"><strong>Date:</strong> ${safeDate}</p>
  <p style="margin:0 0 8px 0"><strong>Number of drinks:</strong> ${safeDrinks}</p>
  <p style="margin:0 0 8px 0"><strong>Number of guests:</strong> ${guestsHtml}</p>
  <p style="margin:0 0 8px 0"><strong>Client email:</strong> ${escapeHtml(clientEmail || "")}</p>
  <p style="margin:0 0 8px 0"><strong>Telephone:</strong> ${escapeHtml(clientPhone || "")}</p>
  <p style="margin:0 0 8px 0"><strong>Notes:</strong> ${safeNotes || "<em>(none)</em>"}</p>
  ${editLink ? `<p style="margin:12px 0 0 0"><strong>Edit link:</strong> <a href="${safeLink}">${safeLink}</a></p>` : ""}
  <h3 style="margin:16px 0 8px 0">Order list</h3>
  ${orderListHtml}
</div>`,
          text: `New booking request submitted\nTitle: ${title || ""}\nDate: ${eventDate || ""}\nNumber of drinks: ${computedDrinksCount}\nNumber of guests: ${cleanedGuestCount || ""}\nClient: ${clientEmail || ""}\nTelephone: ${clientPhone || ""}\nNotes: ${notes || ""}\n${editLink ? `Edit: ${editLink}` : ""}`,
        });
        emailReport.admin = res.ok
          ? { ok: true, id: res.id }
          : { ok: false, error: res.error };
      }

      if (clientEmail && editLink) {
        const res = await sendEmail({
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
        emailReport.client = res.ok
          ? { ok: true, id: res.id }
          : { ok: false, error: res.error };
      }
    }

    return json({
      id: data.id,
      editToken: data.edit_token,
      editSlug,
      email: emailReport,
    });
  } catch (err: any) {
    return json({ error: err?.message || "Server error" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabaseServer = getSupabaseServerClient();
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token) return json({ error: "Missing token" }, { status: 400 });

    const { data, error } = await getEventByToken(
      supabaseServer,
      token,
      "id, title, event_date, guest_count, notes, status, client_phone",
    );

    if (error) {
      return json({ error: error.message }, { status: 404 });
    }

    return json(data);
  } catch (err: any) {
    return json({ error: err?.message || "Server error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabaseServer = getSupabaseServerClient();
    const body = await request.json();
    const { token, title, eventDate, guestCount, notes, status, clientPhone } = body;

    if (!token) {
      return json({ error: "Missing token" }, { status: 400 });
    }

    // Enforce "today or future" for eventDate on the server (prevents bypassing UI constraints).
    if (eventDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const submitted = new Date(`${eventDate}T00:00:00`);
      if (Number.isNaN(submitted.valueOf()) || submitted < today) {
        return json(
          { error: "Date of Event must be today or in the future." },
          { status: 400 },
        );
      }
    }

    let cleanedGuestCount: number | null = null;
    if (typeof guestCount === "number" && Number.isFinite(guestCount)) {
      if (guestCount <= 0) {
        cleanedGuestCount = null;
      } else if (!Number.isInteger(guestCount)) {
        return json(
          { error: "Number of guests must be a whole number." },
          { status: 400 },
        );
      } else {
        cleanedGuestCount = guestCount;
      }
    }

    // We only want to fire "request submitted" emails on the transition to submitted.
    const { data: existing, error: existingError } = await getEventByToken(
      supabaseServer,
      token,
      "id, title, event_date, guest_count, notes, status, client_email, client_phone, edit_token, edit_slug",
    );

    if (existingError) {
      return json({ error: existingError.message }, { status: 404 });
    }

    const updateData: Record<string, any> = {
      title,
      event_date: eventDate || null,
      guest_count: cleanedGuestCount,
      notes: notes || null,
      status,
    };

    if (typeof clientPhone === "string") {
      const cleanedPhone = clientPhone.trim();
      updateData.client_phone = cleanedPhone ? cleanedPhone : null;
    }

    const { data, error } = await supabaseServer
      .from("events")
      .update(updateData)
      .eq("id", existing.id)
      .select("id, title, event_date, guest_count, notes, status, client_email, client_phone, edit_token, edit_slug")
      .single();

    if (error) {
      return json({ error: error.message }, { status: 400 });
    }

    const becameSubmitted =
      existing.status !== "submitted" && data.status === "submitted";

    if (becameSubmitted && isEmailConfigured()) {
      const origin = request.headers.get("origin") || "";
      const editTokenForUrl = data.edit_slug || data.edit_token;
      const editLink = origin ? `${origin}/request/edit/${editTokenForUrl}` : "";

      const adminEmail = getAdminEmail();
      const safeTitle = escapeHtml(data.title || "Cocktail request");
      const safeDate = escapeHtml(data.event_date || "Date TBD");
      const safeGuests = escapeHtml(String(data.guest_count ?? ""));
      const safeNotes = escapeHtml(data.notes || "");
      const safeLink = escapeHtml(editLink);
      const safePhone = escapeHtml(String(data.client_phone || ""));
      let safeDrinks = "";
      try {
        safeDrinks = escapeHtml(
          String(await computeDrinksCountForEvent(supabaseServer, data.id)),
        );
      } catch {
        safeDrinks = "";
      }

      if (adminEmail) {
        const guestsHtml = data.guest_count ? safeGuests : "<em>(not provided)</em>";
        await sendEmail({
          to: adminEmail,
          subject: `New booking request: ${data.title || "Cocktail request"}`,
          // Let the team simply hit "Reply" to respond to the client.
          replyTo: data.client_email || undefined,
          html: `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.5">
  <h2 style="margin:0 0 12px 0">New booking request submitted</h2>
  <p style="margin:0 0 8px 0"><strong>Title:</strong> ${safeTitle}</p>
  <p style="margin:0 0 8px 0"><strong>Date:</strong> ${safeDate}</p>
  <p style="margin:0 0 8px 0"><strong>Number of drinks:</strong> ${safeDrinks || ""}</p>
  <p style="margin:0 0 8px 0"><strong>Number of guests:</strong> ${guestsHtml}</p>
  <p style="margin:0 0 8px 0"><strong>Client email:</strong> ${escapeHtml(data.client_email || "")}</p>
  <p style="margin:0 0 8px 0"><strong>Telephone:</strong> ${safePhone}</p>
  <p style="margin:0 0 8px 0"><strong>Notes:</strong> ${safeNotes || "<em>(none)</em>"}</p>
  ${
    editLink
      ? `<p style="margin:12px 0 0 0"><strong>Edit link:</strong> <a href="${safeLink}">${safeLink}</a></p>`
      : ""
  }
</div>`,
          text: `New booking request submitted\nTitle: ${data.title || ""}\nDate: ${data.event_date || ""}\nNumber of drinks: ${safeDrinks || ""}\nNumber of guests: ${data.guest_count || ""}\nClient: ${data.client_email || ""}\nTelephone: ${data.client_phone || ""}\nNotes: ${data.notes || ""}\n${editLink ? `Edit: ${editLink}` : ""}`,
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

    return json({ id: data.id });
  } catch (err: any) {
    return json({ error: err?.message || "Server error" }, { status: 500 });
  }
}
