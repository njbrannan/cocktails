import { NextRequest, NextResponse } from "next/server";
import { getAdminEmail, isEmailConfigured, sendEmail } from "@/lib/resend";

function escapeHtml(input: string) {
  return String(input || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

type Line = {
  name: string;
  type: string;
  total: number;
  unit: string;
  bottlesNeeded?: number | null;
  bottleSizeMl?: number | null;
  purchaseUrl?: string | null;
  packPlan?: Array<{ packSize: number; count: number; purchaseUrl?: string | null }>;
};

function formatPackPlan(packPlan: any, unit: string) {
  const list = Array.isArray(packPlan) ? packPlan : [];
  return list
    .filter((p) => p && Number(p.count) > 0 && Number(p.packSize) > 0)
    .sort((a, b) => Number(b.packSize) - Number(a.packSize))
    .map((p) => `${Number(p.count)} × ${Number(p.packSize)}${unit}`)
    .join(" + ");
}

function renderOrderListHtml(lines: Line[], includeLinks: boolean) {
  const rows = (lines || [])
    .map((t) => {
      const pack =
        Array.isArray(t.packPlan) && t.packPlan.length
          ? formatPackPlan(t.packPlan, t.unit)
          : t.bottlesNeeded
            ? `${t.bottlesNeeded} × ${t.bottleSizeMl || ""}${t.unit}`
            : "";

      const right = pack ? `${t.total} ${t.unit} · ${pack}` : `${t.total} ${t.unit}`;

      const nameCell = includeLinks && t.purchaseUrl
        ? `<a href="${escapeHtml(t.purchaseUrl)}" style="color:#111;text-decoration:underline" target="_blank" rel="noreferrer noopener">${escapeHtml(t.name)}</a>`
        : `<strong>${escapeHtml(t.name)}</strong>`;

      return `<tr>
  <td style="padding:8px 10px;border-bottom:1px solid #eee">${nameCell}<br/><span style="color:#666;font-size:12px">${escapeHtml(t.type)}</span></td>
  <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">${escapeHtml(right)}</td>
</tr>`;
    })
    .join("");
  return `<table style="width:100%;border-collapse:collapse">${rows}</table>`;
}

export async function POST(req: NextRequest) {
  try {
    const adminEmail = getAdminEmail();
    if (!adminEmail) {
      return NextResponse.json(
        { error: "Missing ADMIN_EMAIL env var." },
        { status: 400 },
      );
    }
    if (!isEmailConfigured()) {
      return NextResponse.json(
        { error: "Email is not configured on the server." },
        { status: 400 },
      );
    }

    const body = await req.json().catch(() => null);
    const title = String(body?.title || "Cocktail booking request");
    const clientEmail = String(body?.clientEmail || "").trim();
    const clientPhone = String(body?.clientPhone || "").trim();
    const eventDate = String(body?.eventDate || "").trim();
    const eventLocation = String(body?.eventLocation || "").trim();
    const bartenderStartTime = String(body?.bartenderStartTime || "").trim();
    const bartenderFinishTime = String(body?.bartenderFinishTime || "").trim();
    const bartenderHours = body?.bartenderHours;
    const guestCount = body?.guestCount;
    const cocktails = Array.isArray(body?.cocktails) ? body.cocktails : [];
    const orderList = Array.isArray(body?.orderList) ? body.orderList : [];

    if (!clientEmail) {
      return NextResponse.json(
        { error: "Missing clientEmail in request." },
        { status: 400 },
      );
    }
    if (!orderList.length) {
      return NextResponse.json(
        { error: "Missing orderList in request." },
        { status: 400 },
      );
    }

    const drinksCount = cocktails.reduce((sum: number, c: any) => {
      const n = Number(c?.servings || 0) || 0;
      return sum + n;
    }, 0);

    const cocktailsHtml = cocktails.length
      ? `<ul>${cocktails
          .map(
            (c: any) =>
              `<li>${escapeHtml(String(c?.recipeName || c?.recipeId || ""))} · ${escapeHtml(String(Number(c?.servings || 0) || 0))}</li>`,
          )
          .join("")}</ul>`
      : "<p style=\"margin:0;color:#666\">(No cocktails)</p>";

    const liquorOnly = orderList.filter((l: any) => String(l?.type || "") === "liquor");

    // Admin email: full list + links
    const adminHtml = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.5">
  <h2 style="margin:0 0 12px 0">Booking request (Cart export)</h2>
  <p style="margin:0 0 8px 0"><strong>Title:</strong> ${escapeHtml(title)}</p>
  <p style="margin:0 0 8px 0"><strong>Date:</strong> ${escapeHtml(eventDate || "TBD")}</p>
  <p style="margin:0 0 8px 0"><strong>Location:</strong> ${escapeHtml(eventLocation || "TBC")}</p>
  <p style="margin:0 0 8px 0"><strong>Number of drinks:</strong> ${escapeHtml(String(drinksCount))}</p>
  <p style="margin:0 0 8px 0"><strong>Number of guests:</strong> ${escapeHtml(String(guestCount ?? ""))}</p>
  <p style="margin:0 0 8px 0"><strong>Client email:</strong> ${escapeHtml(clientEmail)}</p>
  <p style="margin:0 0 8px 0"><strong>Telephone:</strong> ${escapeHtml(clientPhone)}</p>
  ${
    bartenderStartTime || bartenderFinishTime || bartenderHours
      ? `<p style="margin:0 0 8px 0"><strong>Bartender time:</strong> ${escapeHtml(
          bartenderStartTime && bartenderFinishTime
            ? `${bartenderStartTime}–${bartenderFinishTime}`
            : bartenderStartTime || bartenderFinishTime,
        )}${bartenderHours ? ` (${escapeHtml(String(bartenderHours))} hours)` : ""}</p>`
      : ""
  }
  <h3 style="margin:16px 0 8px 0">Cocktails</h3>
  ${cocktailsHtml}
  <h3 style="margin:16px 0 8px 0">Full shopping list (links)</h3>
  ${renderOrderListHtml(orderList, true)}
</div>`;

    // Client email: cocktails + liquor only (no links for non-liquor)
    const clientHtml = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.5">
  <h2 style="margin:0 0 12px 0">Booking request submitted</h2>
  <p style="margin:0 0 12px 0">Thanks — a member of our team will be in contact shortly to organise everything with you.</p>
  <p style="margin:0 0 12px 0"><strong>Event:</strong> ${escapeHtml(title)}</p>
  <p style="margin:0 0 12px 0"><strong>Date:</strong> ${escapeHtml(eventDate || "TBD")}</p>
  <p style="margin:0 0 12px 0"><strong>Location:</strong> ${escapeHtml(eventLocation || "TBC")}</p>
  <h3 style="margin:16px 0 8px 0">Cocktail summary</h3>
  ${cocktailsHtml}
  <h3 style="margin:16px 0 8px 0">Your Shopping List (liquor)</h3>
  ${renderOrderListHtml(liquorOnly, false)}
  <p style="margin:16px 0 0 0;color:#555">Involved Events supplies everything else. Alcohol must be bought and supplied by the client — ultimately the type and volume of alcohol supplied remains the client's choice and responsibility.</p>
</div>`;

    const [adminRes, clientRes] = await Promise.all([
      sendEmail({
        to: adminEmail,
        subject: `Cart export: ${title}`,
        replyTo: clientEmail || undefined,
        html: adminHtml,
        text:
          `Cart export: ${title}\n` +
          `Date: ${eventDate || "TBD"}\n` +
          `Location: ${eventLocation || "TBC"}\n` +
          `Drinks: ${drinksCount}\n` +
          `Guests: ${guestCount || ""}\n` +
          `Client: ${clientEmail}\n` +
          `Phone: ${clientPhone}\n`,
      }),
      sendEmail({
        to: clientEmail,
        subject: "Booking request submitted — Involved Events",
        replyTo: adminEmail || undefined,
        html: clientHtml,
        text:
          `Booking request submitted.\n\n` +
          `Event: ${title}\n` +
          `Date: ${eventDate || "TBD"}\n` +
          `Location: ${eventLocation || "TBC"}\n`,
      }),
    ]);

    return NextResponse.json({
      ok: Boolean(adminRes.ok && clientRes.ok),
      admin: adminRes,
      client: clientRes,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 },
    );
  }
}

