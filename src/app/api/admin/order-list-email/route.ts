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
  packPlan?: Array<{ packSize: number; count: number }>;
};

function formatPackPlan(packPlan: any, unit: string) {
  const list = Array.isArray(packPlan) ? packPlan : [];
  return list
    .filter((p) => p && Number(p.count) > 0 && Number(p.packSize) > 0)
    .sort((a, b) => Number(b.packSize) - Number(a.packSize))
    .map((p) => `${Number(p.count)} × ${Number(p.packSize)}${unit}`)
    .join(" + ");
}

function renderOrderListHtml(lines: Line[]) {
  const rows = (lines || [])
    .map((t) => {
      const pack = Array.isArray(t.packPlan) && t.packPlan.length
        ? formatPackPlan(t.packPlan, t.unit)
        : t.bottlesNeeded
          ? `${t.bottlesNeeded} × ${t.bottleSizeMl || ""}${t.unit}`
          : "";
      const right = pack ? `${t.total} ${t.unit} · ${pack}` : `${t.total} ${t.unit}`;
      return `<tr>
  <td style="padding:8px 10px;border-bottom:1px solid #eee"><strong>${escapeHtml(t.name)}</strong><br/><span style="color:#666;font-size:12px">${escapeHtml(t.type)}</span></td>
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
    const editLink = String(body?.editLink || "").trim();
    const guestCount = body?.guestCount;
    const cocktails = Array.isArray(body?.cocktails) ? body.cocktails : [];
    const orderList = Array.isArray(body?.orderList) ? body.orderList : [];

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
          .map((c: any) => `<li>${escapeHtml(String(c?.recipeName || c?.recipeId || ""))} · ${escapeHtml(String(Number(c?.servings || 0) || 0))}</li>`)
          .join("")}</ul>`
      : "<p style=\"margin:0;color:#666\">(No cocktails)</p>";

    const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.5">
  <h2 style="margin:0 0 12px 0">Booking request cart export</h2>
  <p style="margin:0 0 8px 0"><strong>Title:</strong> ${escapeHtml(title)}</p>
  <p style="margin:0 0 8px 0"><strong>Date:</strong> ${escapeHtml(eventDate || "TBD")}</p>
  <p style="margin:0 0 8px 0"><strong>Location:</strong> ${escapeHtml(eventLocation || "TBC")}</p>
  <p style="margin:0 0 8px 0"><strong>Number of drinks:</strong> ${escapeHtml(String(drinksCount))}</p>
  <p style="margin:0 0 8px 0"><strong>Number of guests:</strong> ${escapeHtml(String(guestCount ?? ""))}</p>
  <p style="margin:0 0 8px 0"><strong>Client email:</strong> ${escapeHtml(clientEmail)}</p>
  <p style="margin:0 0 8px 0"><strong>Telephone:</strong> ${escapeHtml(clientPhone)}</p>
  ${
    editLink
      ? `<p style="margin:12px 0 0 0"><strong>Edit link:</strong> <a href="${escapeHtml(editLink)}">${escapeHtml(editLink)}</a></p>`
      : ""
  }
  <h3 style="margin:16px 0 8px 0">Cocktails</h3>
  ${cocktailsHtml}
  <h3 style="margin:16px 0 8px 0">Full order list</h3>
  ${renderOrderListHtml(orderList)}
</div>`;

    const res = await sendEmail({
      to: adminEmail,
      subject: `Cart export: ${title}`,
      replyTo: clientEmail || undefined,
      html,
      text:
        `Cart export: ${title}\n` +
        `Date: ${eventDate || "TBD"}\n` +
        `Location: ${eventLocation || "TBC"}\n` +
        `Drinks: ${drinksCount}\n` +
        `Guests: ${guestCount || ""}\n` +
        `Client: ${clientEmail}\n` +
        `Phone: ${clientPhone}\n`,
    });

    if (!res.ok) {
      return NextResponse.json({ error: res.error || "Email failed." }, { status: 502 });
    }

    return NextResponse.json({ ok: true, id: res.id });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 },
    );
  }
}
