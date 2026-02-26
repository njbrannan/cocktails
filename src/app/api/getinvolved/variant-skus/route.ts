import { NextResponse } from "next/server";

type InputItem = {
  url: string;
  desiredValue?: string | number | null;
  providedSku?: string | null;
};

type OutputItem = {
  sku: string | null;
};

const BASE_ORIGIN = "https://www.getinvolved.com.au";

function normalizeHostname(hostname: string) {
  return String(hostname || "").trim().replace(/^www\./i, "").toLowerCase();
}

function normalizeGetInvolvedUrl(raw: string): URL | null {
  const value = String(raw || "").trim();
  if (!value) return null;

  try {
    // Allow relative paths like "/store/p/hire-a-mixologist"
    if (value.startsWith("/")) {
      const u = new URL(value, BASE_ORIGIN);
      u.protocol = "https:";
      u.hostname = "www.getinvolved.com.au";
      return u;
    }

    const u = new URL(value);
    const host = normalizeHostname(u.hostname);
    // Prevent SSRF: only allow our domain (apex or www).
    if (host !== "getinvolved.com.au" && host !== "www.getinvolved.com.au") {
      return null;
    }
    // Always fetch from the canonical host so response shape is consistent.
    u.protocol = "https:";
    u.hostname = "www.getinvolved.com.au";
    return u;
  } catch {
    return null;
  }
}

function pickSkuForValue(
  variants: Array<any>,
  desiredValue: string,
): string | null {
  const wanted = String(desiredValue || "").trim();
  if (!wanted) return null;

  const wantedLower = wanted.toLowerCase();
  const wantedNum = Number(wanted);
  const wantedHasNum = Number.isFinite(wantedNum) && wantedNum > 0;

  for (const v of variants || []) {
    const optionValues = Array.isArray(v?.optionValues) ? v.optionValues : [];
    const matches = optionValues.some((ov: any) => {
      const raw = String(ov?.value || "").trim();
      if (!raw) return false;
      if (raw === wanted) return true;

      const lower = raw.toLowerCase();
      if (lower === wantedLower) return true;

      // Common pattern: option is "5 hours" and we pass "5".
      if (wantedHasNum) {
        const n = Number(String(raw).match(/(\d+(?:\.\d+)?)/)?.[1] ?? "");
        if (Number.isFinite(n) && n === wantedNum) return true;
      }

      // Loose match for safety (e.g. "5h").
      return lower.includes(wantedLower);
    });
    if (matches) return String(v?.sku || "").trim() || null;
  }

  return null;
}

export async function POST(req: Request) {
  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const items = Array.isArray(body?.items) ? (body.items as InputItem[]) : [];
  if (!items.length) {
    return NextResponse.json({ items: [] satisfies OutputItem[] });
  }
  if (items.length > 60) {
    return NextResponse.json(
      { error: "Too many items." },
      { status: 400 },
    );
  }

  // Fetch each unique product JSON once.
  const normalizedByIndex: Array<URL | null> = items.map((it) =>
    normalizeGetInvolvedUrl(it?.url || ""),
  );
  if (normalizedByIndex.some((u) => u === null)) {
    return NextResponse.json(
      { error: "One or more product URLs are invalid." },
      { status: 400 },
    );
  }

  const uniqueUrls = Array.from(
    new Set(normalizedByIndex.map((u) => (u as URL).toString())),
  );

  const productByUrl = new Map<string, any>();
  for (const url of uniqueUrls) {
    const u = new URL(url);
    u.searchParams.set("format", "json");

    const res = await fetch(u.toString(), {
      // Keep it fresh-ish but still cacheable at the edge.
      next: { revalidate: 3600 },
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Failed to fetch product JSON (${res.status}).` },
        { status: 502 },
      );
    }

    const json = await res.json().catch(() => null);
    productByUrl.set(url, json);
  }

  const out: OutputItem[] = items.map((it, idx) => {
    const u = (normalizedByIndex[idx] as URL).toString();
    const product = productByUrl.get(u);
    const item = product?.item || null;
    const variants = Array.isArray(item?.variants) ? item.variants : [];

    const skuSet = new Set(
      (variants || [])
        .map((v: any) => String(v?.sku || "").trim())
        .filter(Boolean),
    );

    const desired = it?.desiredValue == null ? "" : String(it.desiredValue);
    const provided = String(it?.providedSku || "").trim();

    const skuForValue = desired ? pickSkuForValue(variants, desired) : null;
    const providedOk = provided ? skuSet.has(provided) : false;

    // If we can't match the desired option value or the provided SKU, fall back to:
    // - the first variant (common for services/glassware), or
    // - null (cart-import script can still try to add by URL, depending on implementation).
    const firstSku = String(variants?.[0]?.sku || "").trim() || null;

    return { sku: skuForValue || (providedOk ? provided : null) || firstSku };
  });

  return NextResponse.json({ items: out });
}
