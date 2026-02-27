"use client";

import {
  buildCheapestPackPlan,
  buildIngredientTotals,
  type IngredientTotal,
  type PackOption,
} from "@/lib/inventoryMath";
import {
  COCKTAIL_PLACEHOLDER_IMAGE,
  normalizeCocktailDisplayName,
  resolveCocktailImageSrc,
  resolveNextCocktailImageSrc,
  resolveSvgFallbackForImageSrc,
} from "@/lib/cocktailImages";
import { supabase } from "@/lib/supabaseClient";
import {
  loadDrafts,
  removeDraft,
  saveDraft,
  type OfflineDraft,
} from "@/lib/offlineDrafts";
import { useEdgeSwipeNav } from "@/hooks/useEdgeSwipeNav";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { countries } from "countries-list";
import { parsePhoneNumberFromString } from "libphonenumber-js";

type StoredCocktail = {
  recipeId: string;
  recipeName: string;
  servings: number;
};

type Ingredient = {
  id: string;
  name: string;
  type:
    | "liquor"
    | "mixer"
    | "juice"
    | "syrup"
    | "garnish"
    | "ice"
    | "glassware";
  bottle_size_ml: number | null;
  unit: string | null;
  purchase_url?: string | null;
  price?: number | null;
  ingredient_packs?: Array<{
    pack_size: number;
    pack_price: number;
    purchase_url?: string | null;
    search_url?: string | null;
    search_query?: string | null;
    variant_sku?: string | null;
    retailer?: "danmurphys" | "woolworths" | "getinvolved" | null;
    tier?: "economy" | "business" | "first_class" | "budget" | "premium" | null;
    is_active: boolean;
  }> | null;
};

type RecipeIngredient = {
  ml_per_serving: number;
  ingredients: Ingredient | Ingredient[] | null;
};

type Recipe = {
  id: string;
  name: string;
  recipe_packs?: Array<{
    pack_size: number;
    pack_price: number;
    purchase_url?: string | null;
    variant_sku?: string | null;
    tier?: "economy" | "business" | "first_class" | "budget" | "premium" | null;
    is_active: boolean;
  }> | null;
  recipe_ingredients: RecipeIngredient[];
};

type StoredOrder = {
  version: 1;
  createdAt: string;
  cocktails: StoredCocktail[];
  orderList: IngredientTotal[];
  // Enough to restore the previous screen if the user goes back.
  selectedRecipeIds: string[];
  servingsByRecipeId: Record<string, string>;
  guestCount?: number | null;
  drinksPerGuest?: number;
  occasion?: string | null;
  pricingTier?: "budget" | "house" | "top_shelf" | "economy" | "business" | "first_class";
};

const STORAGE_KEY = "get-involved:order:v1";

const DEFAULT_GI_BARTENDER_PRODUCT_URL =
  "https://www.getinvolved.com.au/store/p/hire-a-mixologist";
const DEFAULT_GI_BARTENDER_VARIANT_SKUS: Record<string, string> = {
  "4": "SQ6281902",
  "5": "SQ8139792",
  "6": "SQ3340008",
  "7": "SQ6433893",
  "8": "SQ9500617",
};

// Optional: when set, the "Get Involved!" export can also add recommended bartenders to cart.
// Example:
// NEXT_PUBLIC_GI_BARTENDER_PRODUCT_URL="https://www.getinvolved.com.au/services/p/bartender"
// NEXT_PUBLIC_GI_BARTENDER_VARIANT_SKU="SQxxxx" (only if the product has variants)
// NEXT_PUBLIC_GI_BARTENDER_VARIANT_SKUS='{"4":"SQ...","5":"SQ..."}' (map hours -> sku)
// NEXT_PUBLIC_GI_BARTENDER_DEFAULT_HOURS="4"
const GI_BARTENDER_PRODUCT_URL_RAW =
  process.env.NEXT_PUBLIC_GI_BARTENDER_PRODUCT_URL || "";
const GI_BARTENDER_PRODUCT_URL =
  GI_BARTENDER_PRODUCT_URL_RAW.trim() || DEFAULT_GI_BARTENDER_PRODUCT_URL;
const GI_BARTENDER_VARIANT_SKU =
  process.env.NEXT_PUBLIC_GI_BARTENDER_VARIANT_SKU || "";
const GI_BARTENDER_VARIANT_SKUS_RAW =
  process.env.NEXT_PUBLIC_GI_BARTENDER_VARIANT_SKUS || "";
const GI_BARTENDER_DEFAULT_HOURS =
  process.env.NEXT_PUBLIC_GI_BARTENDER_DEFAULT_HOURS || "4";

// Mixologist product has required product-form fields on Squarespace.
// If these IDs change (e.g. you edit the product form), update the env vars in Vercel.
const GI_MIXOLOGIST_FIELD_EMAIL =
  process.env.NEXT_PUBLIC_GI_MIXOLOGIST_FIELD_EMAIL ||
  "email-15b5309e-0de9-418d-9c17-e9f4d23bd666";
const GI_MIXOLOGIST_FIELD_PHONE =
  process.env.NEXT_PUBLIC_GI_MIXOLOGIST_FIELD_PHONE ||
  "phone-40d993da-d122-4534-af2d-b6c66853d03d";
const GI_MIXOLOGIST_FIELD_ADDRESS =
  process.env.NEXT_PUBLIC_GI_MIXOLOGIST_FIELD_ADDRESS ||
  "textarea-76333c31-e0ec-4a05-9b45-edfb1ebf36f9";

function normalizeUrlPath(value: string) {
  try {
    const u = new URL(String(value || "").trim());
    const path = u.pathname.replace(/\/+$/, "");
    return path || "/";
  } catch {
    return "";
  }
}

const DEFAULT_GI_BARTENDER_PRODUCT_PATH = normalizeUrlPath(
  DEFAULT_GI_BARTENDER_PRODUCT_URL,
);
const GI_BARTENDER_PRODUCT_PATH = normalizeUrlPath(GI_BARTENDER_PRODUCT_URL);

function parseBartenderSkuMap(raw: string): Record<string, string> {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return {};

  const normalize = (obj: any) => {
    if (!obj || typeof obj !== "object") return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj)) {
      const key = String(k).trim();
      const val = String(v || "").trim();
      if (key && val) out[key] = val;
    }
    return out;
  };

  const tryJson = (value: string) => {
    try {
      return normalize(JSON.parse(value));
    } catch {
      return null;
    }
  };

  // 1) Strict JSON
  const strict = tryJson(trimmed);
  if (strict && Object.keys(strict).length) return strict;

  // 2) Wrapped in quotes (common copy/paste)
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    const unwrapped = tryJson(trimmed.slice(1, -1).trim());
    if (unwrapped && Object.keys(unwrapped).length) return unwrapped;
  }

  // 3) JSON-ish single quotes
  if (trimmed.includes("'")) {
    const dequoted = tryJson(trimmed.replaceAll("'", '"'));
    if (dequoted && Object.keys(dequoted).length) return dequoted;
  }

  // 4) Fallback: parse "4=SKU,5=SKU" or "4:SKU" separated by commas/newlines
  const parts = trimmed.split(/[\n,]+/g).map((p) => p.trim()).filter(Boolean);
  const out: Record<string, string> = {};
  for (const part of parts) {
    const m = part.match(/^(\d+)\s*[:=]\s*([A-Za-z0-9_-]+)$/);
    if (!m) continue;
    out[m[1]!] = m[2]!;
  }
  return out;
}

const typePriority: Record<string, number> = {
  liquor: 0,
  mixer: 1,
  juice: 2,
  syrup: 3,
  garnish: 4,
  ice: 5,
  glassware: 6,
};

function CartIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="9" cy="20" r="1" />
      <circle cx="17" cy="20" r="1" />
      <path d="M3 4h2l2.2 10.4a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.6L23 7H6" />
    </svg>
  );
}

function recommendedBartenders(totalDrinks: number, cocktailCount: number) {
  const drinks = Math.max(0, Math.floor(totalDrinks || 0));
  const cocktails = Math.max(0, Math.floor(cocktailCount || 0));
  if (drinks <= 0) return 0;

  // Baseline: 1 bartender per 150 drinks.
  let count = Math.max(1, Math.ceil(drinks / 150));

  // If there are more than 2 cocktails, add an extra bartender,
  // unless the total is under 75 drinks.
  if (cocktails > 2 && drinks >= 75) count += 1;

  return count;
}

function todayIsoDate() {
  // Date-only string used by <input type="date" /> for min=...
  return new Date().toISOString().slice(0, 10);
}

function formatAud(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) return "";
  try {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `$${Math.round(amount)}`;
  }
}

function formatPackPlan(
  packPlan: Array<{ packSize: number; count: number }> | null | undefined,
  unit: string,
) {
  if (!packPlan?.length) return "";
  return packPlan
    .filter((p) => p && p.count > 0 && p.packSize > 0)
    .sort((a, b) => b.packSize - a.packSize)
    .map((p) => `${p.count} × ${p.packSize}${unit}`)
    .join(" + ");
}

function resolvePurchaseUrlForItem(item: IngredientTotal) {
  const plan = item.packPlan ?? [];
  // If we have multiple pack sizes, we still want the ingredient name to be
  // clickable (use the canonical product/search page), while pack-size lines
  // can link individually when possible.
  if (plan.length > 1) return item.purchaseUrl;
  if (plan.length === 1) {
    return plan[0]?.purchaseUrl || plan[0]?.searchUrl || item.purchaseUrl;
  }
  return item.purchaseUrl;
}

function normalizePackTier(tier: any): "economy" | "business" | "first_class" {
  const t = String(tier || "").trim().toLowerCase();
  if (t === "business") return "business";
  if (t === "first_class" || t === "first-class" || t === "firstclass" || t === "premium")
    return "first_class";
  if (t === "economy" || t === "budget") return "economy";
  return "economy";
}

function normalizePricingTier(value: any): "budget" | "house" | "top_shelf" {
  const v = String(value || "").trim().toLowerCase();
  if (v === "top_shelf" || v === "topshelf" || v === "first_class" || v === "first-class" || v === "firstclass") {
    return "top_shelf";
  }
  if (v === "house" || v === "business" || v === "economy") return "house";
  // Default to Premium (most common).
  return "house";
}

function retailerForUrl(url: string) {
  const u = String(url || "").toLowerCase();
  if (!u) return null;
  if (u.includes("danmurphys.com.au")) return "danmurphys";
  if (u.includes("woolworths.com.au")) return "woolworths";
  if (u.includes("getinvolved.com.au")) return "getinvolved";
  return null;
}

function downloadTextFile(filename: string, content: string, mime = "text/plain") {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 1000);
}

function buildRetailerExportHtml(title: string, rows: Array<{ name: string; qty: string; url: string }>) {
  const safe = (s: string) =>
    String(s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const list = rows
    .map(
      (r) => `<li style="padding:10px 0;border-bottom:1px solid #eee">
  <div style="display:flex;gap:16px;justify-content:space-between;align-items:flex-start">
    <div style="min-width:0">
      <div style="font-weight:600">${safe(r.name)}</div>
      <div style="color:#555;font-size:12px;margin-top:4px">${safe(r.url)}</div>
    </div>
    <div style="white-space:nowrap;font-variant-numeric:tabular-nums;font-weight:600">${safe(r.qty)}</div>
  </div>
</li>`,
    )
    .join("");

  const urlsJson = safe(JSON.stringify(rows.map((r) => r.url)));

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safe(title)}</title>
</head>
<body style="margin:0;padding:24px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.4;background:#fafafa;color:#111">
  <div style="max-width:900px;margin:0 auto;background:#fff;border:1px solid #eee;border-radius:16px;padding:20px 20px 10px 20px">
    <div style="display:flex;justify-content:space-between;gap:16px;align-items:baseline;flex-wrap:wrap">
      <h1 style="margin:0;font-size:18px">${safe(title)}</h1>
      <button id="openAll" style="border:0;border-radius:999px;padding:10px 14px;background:#111;color:#fff;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;font-size:11px;cursor:pointer">
        Open Links
      </button>
    </div>
    <p style="margin:10px 0 16px 0;color:#555;font-size:13px">This opens product links in new tabs so you can add them to your cart.</p>
    <ul style="list-style:none;padding:0;margin:0">${list}</ul>
  </div>
  <script>
    const urls = JSON.parse("${urlsJson}");
    document.getElementById("openAll").addEventListener("click", () => {
      for (const url of urls) window.open(url, "_blank", "noopener,noreferrer");
    });
  </script>
</body>
</html>`;
}

function base64UrlEncodeUtf8(input: string) {
  // Encode compactly for query strings.
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  const base64 = btoa(binary);
  return base64.replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function buildGetInvolvedCartImportUrl(
  rows: Array<{ url: string; count: number; sku?: string | null }>,
  origin = "https://www.getinvolved.com.au",
) {
  const originNormalized = origin.replace(/\/$/, "");
  const originHost = (() => {
    try {
      return new URL(originNormalized).hostname.replace(/^www\./i, "").toLowerCase();
    } catch {
      return "getinvolved.com.au";
    }
  })();

  // Keep payload intentionally small.
  const payload = rows
    .filter((r) => r && r.url && r.count > 0)
    .map((r) => {
      // Reduce URL length to improve compatibility with mobile browsers.
      // The cart-import page runs on getinvolved.com.au, so relative URLs are fine.
      let url = String(r.url || "").trim();
      try {
        const parsed = new URL(url, originNormalized);
        const parsedHost = parsed.hostname.replace(/^www\./i, "").toLowerCase();
        // Treat apex + www as the same origin so the cart-import page can fetch JSON
        // without running into cross-origin/CORS issues.
        if (parsedHost === originHost) {
          url = `${parsed.pathname}${parsed.search}`;
        }
      } catch {
        // Keep as-is.
      }
      return { url, count: r.count, sku: r.sku || null };
    });
  const encoded = base64UrlEncodeUtf8(JSON.stringify({ v: 1, items: payload }));
  return `${originNormalized}/cart-import?items=${encoded}`;
}

function buildLocalGetInvolvedExportUrl(
  rows: Array<{
    url: string;
    count: number;
    sku?: string | null;
    desiredValue?: string | null;
    fields?: Record<string, any> | null;
  }>,
  origin = "https://www.getinvolved.com.au",
) {
  const originNormalized = origin.replace(/\/$/, "");
  const originHost = (() => {
    try {
      return new URL(originNormalized).hostname.replace(/^www\./i, "").toLowerCase();
    } catch {
      return "getinvolved.com.au";
    }
  })();

  const payload = rows
    .filter((r) => r && r.url && r.count > 0)
    .map((r) => {
      // Keep URLs short for mobile browsers (we'll re-expand later).
      let url = String(r.url || "").trim();
      try {
        const parsed = new URL(url, originNormalized);
        const parsedHost = parsed.hostname.replace(/^www\./i, "").toLowerCase();
        if (parsedHost === originHost) {
          url = `${parsed.pathname}${parsed.search}`;
        }
      } catch {
        // Keep as-is.
      }
      return {
        url,
        count: r.count,
        sku: r.sku || null,
        desiredValue: r.desiredValue || null,
        fields: r.fields || null,
      };
    });

  const encoded = base64UrlEncodeUtf8(JSON.stringify({ v: 1, items: payload }));
  return `/request/order/export?items=${encoded}`;
}

type PackTier = "economy" | "business" | "first_class";

function allowedPackTiersForPricingTier(
  pricingTier: "budget" | "house" | "top_shelf",
): PackTier[] | null {
  // Mapping:
  // - Top Shelf => first_class only
  // - House => economy only
  // - Budget => allow all tiers and choose the cheapest combination
  if (pricingTier === "top_shelf") return ["first_class"];
  if (pricingTier === "house") return ["economy"];
  return null;
}

function buildGetInvolvedCocktailKitCartItems(opts: {
  recipes: Recipe[];
  servingsByRecipeId: Record<string, string>;
  pricingTier: "budget" | "house" | "top_shelf";
}) {
  const allowedTiers = allowedPackTiersForPricingTier(opts.pricingTier);
  const out: Array<{
    url: string;
    count: number;
    sku?: string | null;
    desiredValue?: string | null;
  }> = [];

  for (const recipe of opts.recipes) {
    const servingsRaw = opts.servingsByRecipeId[recipe.id] ?? "0";
    const servings = Number(servingsRaw || "0") || 0;
    if (servings <= 0) continue;

    const packs = (recipe.recipe_packs ?? [])
      .filter((p) => p && p.is_active !== false)
      .filter((p) => {
        const t = normalizePackTier(p.tier);
        if (!allowedTiers) return true;
        return allowedTiers.includes(t);
      });

    if (!packs.length) continue;

    // Match the planner's 10% buffer for cocktail kits as well.
    const required = Math.ceil(servings * 1.1);

    const packOptions: PackOption[] = packs.map((p) => ({
      packSize: Number(p.pack_size),
      packPrice: Number(p.pack_price),
      purchaseUrl: p.purchase_url || null,
      searchUrl: null,
      searchQuery: null,
      variantSku: p.variant_sku || null,
      retailer: "getinvolved",
      tier: (p.tier as any) || null,
    }));

    const plan = buildCheapestPackPlan(required, packOptions, null);
    if (!plan?.plan?.length) continue;

    for (const line of plan.plan) {
      const url = line.purchaseUrl || "";
      if (!url || line.count <= 0) continue;
      out.push({
        url,
        count: line.count,
        sku: line.variantSku || null,
        desiredValue: String(line.packSize),
      });
    }
  }

  return out;
}

export default function RequestOrderPage() {
  const router = useRouter();
  const orderBartendersRef = useRef<HTMLDivElement | null>(null);
  const [stored, setStored] = useState<StoredOrder | null>(null);
  const [drafts, setDrafts] = useState<OfflineDraft[]>([]);
  const [sendingDraftId, setSendingDraftId] = useState<string | null>(null);
  const bartenderSkuMap = useMemo(
    () => {
      // For our canonical Mixologist product, keep the mapping hard-coded so
      // production doesn't break if Vercel env vars are misconfigured.
      if (
        GI_BARTENDER_PRODUCT_PATH &&
        GI_BARTENDER_PRODUCT_PATH === DEFAULT_GI_BARTENDER_PRODUCT_PATH
      ) {
        return DEFAULT_GI_BARTENDER_VARIANT_SKUS;
      }

      const parsed = parseBartenderSkuMap(GI_BARTENDER_VARIANT_SKUS_RAW);
      if (Object.keys(parsed).length) return parsed;
      if (GI_BARTENDER_VARIANT_SKU) {
        return { [String(GI_BARTENDER_DEFAULT_HOURS || "4")]: GI_BARTENDER_VARIANT_SKU };
      }
      return DEFAULT_GI_BARTENDER_VARIANT_SKUS;
    },
    [],
  );
  const [bartenderHours, setBartenderHours] = useState<string>(
    GI_BARTENDER_DEFAULT_HOURS,
  );
  useEffect(() => {
    const keys = Object.keys(bartenderSkuMap || {});
    if (!keys.length) return;
    if (bartenderSkuMap[bartenderHours]) return;
    const first = keys.slice().sort((a, b) => Number(a) - Number(b))[0];
    if (first) setBartenderHours(first);
  }, [bartenderSkuMap, bartenderHours]);

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [servingsByRecipeId, setServingsByRecipeId] = useState<
    Record<string, string>
  >({});

  const [orderList, setOrderList] = useState<IngredientTotal[]>([]);
  const [recalcError, setRecalcError] = useState<string | null>(null);
  const [editingQuantities, setEditingQuantities] = useState(false);
  const [pricingTier, setPricingTier] = useState<
    "budget" | "house" | "top_shelf"
  >("house");

  const [eventDate, setEventDate] = useState("");
  const [eventName, setEventName] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [guestCountInput, setGuestCountInput] = useState("");
  const [phoneCountryIso2, setPhoneCountryIso2] = useState<keyof typeof countries>(
    "AU",
  );
  const [phoneLocal, setPhoneLocal] = useState("");

  const [loading, setLoading] = useState(false);
  const [exportingToCart, setExportingToCart] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [guestCountError, setGuestCountError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editLink, setEditLink] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const minDate = useMemo(() => todayIsoDate(), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const user = data?.user;
        if (!user) return;
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();
        if (cancelled) return;
        if (!profileError && profile?.role === "admin") setIsAdmin(true);
      } catch {
        // Ignore auth/profile errors; treat as non-admin.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleOrderList = useMemo(() => {
    const list = orderList ?? [];
    return isAdmin ? list : list.filter((it) => it.type === "liquor");
  }, [orderList, isAdmin]);

  const estimatedCost = useMemo(() => {
    const sum = (visibleOrderList ?? []).reduce(
      (acc, item) => acc + (item.totalCost ?? 0),
      0,
    );
    return Number.isFinite(sum) ? sum : 0;
  }, [visibleOrderList]);

  const formattedEstimatedCost = useMemo(() => formatAud(estimatedCost), [estimatedCost]);

  useEdgeSwipeNav({
    canGoBack: true,
    canGoForward: true,
    onBack: () => {
      // Prefer "previous page" semantics: go back to the quantities step.
      if (editingQuantities) {
        setEditingQuantities(false);
        return;
      }
      router.push("/request?resume=1&step=quantity");
    },
    onForward: () => {
      // "Next page" in this screen is the booking section.
      orderBartendersRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    },
  });

  const handleEventDateChange = (value: string) => {
    // Even with `min=...`, some browsers allow typing an older date.
    // Clamp so the user can't set a past date in the UI.
    if (!value) {
      setEventDate("");
      return;
    }
    setEventDate(value < minDate ? minDate : value);
  };

  const normalizeIngredient = (value: Ingredient | Ingredient[] | null) => {
    if (!value) return null;
    return Array.isArray(value) ? value[0] ?? null : value;
  };

  const fieldClass =
    // `tracking-normal` is important because these inputs sit inside uppercase/letter-spaced labels.
    // Without this, iOS can render them with huge letter spacing.
    "h-[52px] w-full max-w-full min-w-0 rounded-2xl border bg-white/80 px-4 py-3 text-[16px] tracking-normal text-ink";

  const flagEmoji = (iso2: string) => {
    const upper = iso2.toUpperCase();
    if (!/^[A-Z]{2}$/.test(upper)) return "";
    const points = [...upper].map((c) => 127397 + c.charCodeAt(0));
    return String.fromCodePoint(...points);
  };

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });

    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as StoredOrder;
      if (parsed?.version !== 1) return;
      setStored(parsed);
      setPricingTier(normalizePricingTier(parsed?.pricingTier));
      setServingsByRecipeId(parsed.servingsByRecipeId || {});
      setOrderList(parsed.orderList || []);
      if (!guestCountInput) {
        const guests = typeof parsed.guestCount === "number" ? parsed.guestCount : null;
        if (guests && guests > 0) setGuestCountInput(String(guests));
      }
      // Pre-fill a helpful note line based on their selected occasion.
      // Only do this if the notes box is still empty.
      if (!notes.trim()) {
        const occ = String(parsed.occasion || "").trim();
        if (occ) {
          const label =
            occ === "relaxed"
              ? "Dinner / relaxed"
              : occ === "cocktail"
                ? "Cocktail party"
                : occ === "wedding"
                  ? "Wedding / celebration"
                  : occ === "big-night"
                    ? "Big Celebration"
                    : occ === "custom"
                      ? "Custom"
                      : occ;
          setNotes(`Occasion: ${label}\n`);
        }
      }
    } catch {
      // Ignore parse errors; user can go back and recreate.
    }
  }, []);

  useEffect(() => {
    setDrafts(loadDrafts());
    const onStorage = () => setDrafts(loadDrafts());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const parseNonNegativeInt = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed === "") return null;
    if (!/^\d+$/.test(trimmed)) return null;
    const n = Number(trimmed);
    if (!Number.isSafeInteger(n)) return null;
    return n;
  };

  const isValidEmail = (value: string) => {
    const v = value.trim();
    if (!v) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  };

  const validateEmail = (value: string) => {
    if (!value.trim()) return "Email is required.";
    if (!isValidEmail(value)) return "Enter a valid email address.";
    return null;
  };

  const validateGuestCount = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return "Number of guests is required.";
    if (!/^\d+$/.test(trimmed)) return "Enter a whole number of guests.";
    const n = Number(trimmed);
    if (!Number.isSafeInteger(n) || n <= 0) {
      return "Enter a valid number of guests.";
    }
    return null;
  };

  const validatePhone = (value: string) => {
    if (!value.trim()) return "Telephone number is required.";
    const parsed = parsePhoneNumberFromString(value.trim(), phoneCountryIso2 as any);
    // `isValid()` is strict and can produce false negatives for some real-world formats.
    // `isPossible()` is a better UX fit for event enquiries.
    if (!parsed || !(parsed.isValid() || parsed.isPossible())) {
      return `Enter a valid telephone number for ${selectedCountryName}.`;
    }
    return null;
  };

  const selectedCountryName = useMemo(() => {
    return countries[phoneCountryIso2]?.name || "Selected country";
  }, [phoneCountryIso2]);

  const countryOptions = useMemo(() => {
    const all = Object.entries(countries).map(([iso2, c]) => {
      const phoneValue = Array.isArray(c.phone) ? c.phone[0] : c.phone;
      const phoneRaw = phoneValue ? String(phoneValue).trim() : "";
      const dial = phoneRaw ? `+${phoneRaw}` : "";
      return {
        iso2: iso2 as keyof typeof countries,
        name: c.name,
        flag: flagEmoji(iso2),
        dial,
        // compact display for the closed select
        labelCompact: `${flagEmoji(iso2)}${dial ? ` ${dial}` : ""}`.trim(),
      };
    });

    const priorityIso2: Array<keyof typeof countries> = [
      "AU",
      "NZ",
      "JP",
      "GB",
      "US",
      "NL",
      "CH",
    ];
    const byIso2 = new Map(all.map((c) => [c.iso2, c]));

    const priority = priorityIso2
      .map((iso2) => byIso2.get(iso2))
      .filter(Boolean) as Array<(typeof all)[number]>;

    const rest = all
      .filter((c) => !priorityIso2.includes(c.iso2))
      .sort((a, b) => a.name.localeCompare(b.name));

    return { priority, rest };
  }, []);

  const selectedDialCode = useMemo(() => {
    const c = countries[phoneCountryIso2];
    if (!c?.phone) return "";
    const phoneValue = Array.isArray(c.phone) ? c.phone[0] : c.phone;
    const phoneRaw = phoneValue ? String(phoneValue).trim() : "";
    return phoneRaw ? `+${phoneRaw}` : "";
  }, [phoneCountryIso2]);

  const phonePlaceholder = useMemo(() => {
    // Simple, friendly examples for our most common markets.
    // (These are examples only; validation still uses the country's rules.)
    switch (phoneCountryIso2) {
      case "AU":
        return "0412 345 678";
      case "NZ":
        return "021 123 4567";
      case "JP":
        return "090-1234-5678";
      case "GB":
        return "07123 456789";
      case "US":
        return "(201) 555-0123";
      case "NL":
        return "06 12345678";
      case "CH":
        return "079 123 45 67";
      default:
        return "Telephone number";
    }
  }, [phoneCountryIso2]);

  const phoneE164 = useMemo(() => {
    const local = phoneLocal.trim();
    if (!local) return "";
    const parsed = parsePhoneNumberFromString(local, phoneCountryIso2 as any);
    return parsed && (parsed.isValid() || parsed.isPossible()) ? parsed.number : "";
  }, [phoneLocal, phoneCountryIso2]);

  const combinedPhone = useMemo(() => {
    const local = phoneLocal.trim();
    if (!local) return "";
    return phoneE164 || `${selectedDialCode} ${local}`.trim();
  }, [selectedDialCode, phoneLocal, phoneE164]);

  useEffect(() => {
    const load = async () => {
      if (!stored?.cocktails?.length) return;
      setRecalcError(null);

      const recipeIds = stored.cocktails.map((c) => c.recipeId).filter(Boolean);
      if (recipeIds.length === 0) return;

      const selectWithPacks =
        "id, name, recipe_packs(pack_size, pack_price, purchase_url, variant_sku, tier, is_active), recipe_ingredients(ml_per_serving, ingredients(id, name, type, unit, bottle_size_ml, purchase_url, price, ingredient_packs(pack_size, pack_price, purchase_url, search_url, search_query, variant_sku, retailer, tier, is_active)))";
      const selectWithoutPacks =
        "id, name, recipe_ingredients(ml_per_serving, ingredients(id, name, type, unit, bottle_size_ml, purchase_url, price))";

      let data: any = null;
      let error: any = null;
      {
        const resp = await supabase
          .from("recipes")
          .select(selectWithPacks)
          .in("id", recipeIds);
        data = resp.data;
        error = resp.error;
      }

      if (
        error &&
        (String((error as any).code || "") === "42703" ||
          String(error.message || "").toLowerCase().includes("ingredient_packs") ||
          String(error.message || "").toLowerCase().includes("recipe_packs"))
      ) {
        const resp = await supabase
          .from("recipes")
          .select(selectWithoutPacks)
          .in("id", recipeIds);
        data = resp.data;
        error = resp.error;
      }

      if (error) {
        setRecalcError(error.message);
        return;
      }

      setRecipes(((data ?? []) as unknown as Recipe[]) || []);
    };

    load();
  }, [stored]);

  useEffect(() => {
    if (!stored) return;
    // Persist tier selection so refresh/back keeps it.
    try {
      window.sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          ...stored,
          pricingTier,
        }),
      );
    } catch {}
  }, [stored, pricingTier]);

  const cocktailsSummary = useMemo(() => {
    const list = stored?.cocktails ?? [];
    const filtered = list.filter((c) => {
      const raw = servingsByRecipeId[c.recipeId] ?? String(c.servings ?? 0);
      return (Number(raw || "0") || 0) > 0;
    });
    return [...filtered].sort((a, b) => a.recipeName.localeCompare(b.recipeName));
  }, [stored, servingsByRecipeId]);

  const cocktailsEditable = useMemo(() => {
    const list = stored?.cocktails ?? [];
    return [...list].sort((a, b) => a.recipeName.localeCompare(b.recipeName));
  }, [stored]);

  const totalDrinks = useMemo(() => {
    return cocktailsSummary.reduce((sum, c) => {
      const raw = servingsByRecipeId[c.recipeId] ?? String(c.servings ?? 0);
      return sum + (Number(raw || "0") || 0);
    }, 0);
  }, [cocktailsSummary]);

  const recommendedMixologists = useMemo(() => {
    return recommendedBartenders(totalDrinks, cocktailsSummary.length);
  }, [totalDrinks, cocktailsSummary.length]);

  useEffect(() => {
    if (!stored) return;
    if (!stored.cocktails.length) return;
    if (recipes.length === 0) return;

    try {
      const recipeById = new Map(recipes.map((r) => [r.id, r]));

      const items = stored.cocktails.flatMap((c) => {
        const raw = servingsByRecipeId[c.recipeId] ?? String(c.servings ?? 0);
        const servings = Number(raw || "0") || 0;
        if (servings <= 0) return [];

        const recipe = recipeById.get(c.recipeId);
        if (!recipe) return [];

        return (recipe.recipe_ingredients ?? []).flatMap((ri) => {
          const ingredient = normalizeIngredient(ri.ingredients);
          if (!ingredient) return [];

          const normalizedKey = `${ingredient.type}:${ingredient.name
            .trim()
            .toLowerCase()}:${(ingredient.unit || "ml").trim().toLowerCase()}`;

          return [
            {
              ingredientId: normalizedKey,
              name: ingredient.name,
              type: ingredient.type,
              amountPerServing: ri.ml_per_serving,
              servings,
              unit: ingredient.unit,
              bottleSizeMl: ingredient.bottle_size_ml,
              purchaseUrl: ingredient.purchase_url,
              price: ingredient.price ?? null,
              packOptions:
                ingredient.ingredient_packs
                  ?.filter((p) => {
                    if (!p?.is_active) return false;
                    const normalized = normalizePackTier(p.tier);
                    if (pricingTier === "top_shelf") return normalized === "first_class";
                    // house (budget/economy-only)
                    return normalized === "economy";
                  })
                  .map((p) => ({
                    packSize: Number(p.pack_size),
                    packPrice: Number(p.pack_price),
                    purchaseUrl: p.purchase_url || null,
                    searchUrl: p.search_url || null,
                    searchQuery: p.search_query || null,
                    variantSku: p.variant_sku || null,
                    retailer: (p.retailer as any) || null,
                    tier: (p.tier as any) || null,
                  })) ?? null,
            },
          ];
        });
      });

      const totals = buildIngredientTotals(items).sort((a, b) => {
        const typeA = typePriority[a.type] ?? 99;
        const typeB = typePriority[b.type] ?? 99;
        if (typeA !== typeB) return typeA - typeB;
        if (a.total !== b.total) return b.total - a.total;
        return a.name.localeCompare(b.name);
      });

      setOrderList(totals);

      // Persist so refresh/back keeps the updated quantities + order list.
      window.sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          ...stored,
          orderList: totals,
          servingsByRecipeId,
          pricingTier,
        }),
      );
    } catch {
      // Ignore storage errors.
    }
  }, [stored, recipes, servingsByRecipeId, pricingTier]);

  const handleBack = () => {
    // Take them back to the drink selection step (with their previous order restored).
    router.push("/request?resume=1&step=select");
  };

  const handleOrderBartenders = async () => {
      setLoading(true);
      setError(null);
      setEmailError(null);
      setGuestCountError(null);
      setPhoneError(null);
      setSuccess(null);
      setEditLink(null);

    try {
      if (!stored || cocktailsSummary.length === 0) {
        setError("No order list found. Go back and create your order list first.");
        return;
      }

      if (eventDate && eventDate < minDate) {
        setError("Date of Event must be today or in the future.");
        return;
      }
      const guestsMessage = validateGuestCount(guestCountInput);
      if (guestsMessage) {
        setGuestCountError(guestsMessage);
        setError("Please fix the highlighted fields.");
        return;
      }
      const emailMessage = validateEmail(clientEmail);
      if (emailMessage) {
        setEmailError(emailMessage);
        setError("Please fix the highlighted fields.");
        return;
      }

      // Validate quantities (must be whole numbers, 0+)
      for (const c of stored.cocktails) {
        const raw = servingsByRecipeId[c.recipeId] ?? String(c.servings ?? 0);
        const n = parseNonNegativeInt(raw);
        if (n === null) {
          setError(`Please enter a valid quantity for ${c.recipeName}.`);
          return;
        }
      }

      // Phone validation (required)
      const phoneMessage = validatePhone(phoneLocal);
      if (phoneMessage) {
        setPhoneError(phoneMessage);
        setError("Please fix the highlighted fields.");
        return;
      }

      const payload = {
        title: eventName.trim() ? eventName.trim() : "Cocktail booking request",
        eventDate,
        notes: [
          eventLocation.trim()
            ? `Event location: ${eventLocation.trim()}`
            : "",
          notes,
        ]
          .filter(Boolean)
          .join("\n\n"),
        clientEmail,
        guestCount: Number(guestCountInput),
        clientPhone: combinedPhone || null,
        pricingTier,
        submit: true,
        cocktails: cocktailsSummary.map((c) => ({
          recipeId: c.recipeId,
          recipeName: c.recipeName,
          servings:
            Number(
              servingsByRecipeId[c.recipeId] ?? String(c.servings ?? 0),
            ) || 0,
        })),
      };

      if (typeof navigator !== "undefined" && !navigator.onLine) {
        saveDraft(payload);
        setDrafts(loadDrafts());
        setSuccess(
          "You’re offline. We saved your booking request on this device. When you’re back online, return here and send it from Saved drafts.",
        );
        return;
      }

      const response = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      let data: any = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }

      if (!response.ok) {
        setError(data?.error || `Unable to send request (HTTP ${response.status}).`);
        return;
      }

      const token = data?.editToken as string | undefined;
      const slug = data?.editSlug as string | undefined | null;
      if (!token && !slug) {
        setError("Request created, but no edit token was returned.");
        return;
      }

      const link = `${window.location.origin}/request/edit/${slug || token}`;
      setEditLink(link);
      const emailConfigured = Boolean(data?.email?.configured);
      const adminOk = Boolean(data?.email?.admin?.ok);
      const clientOk = Boolean(data?.email?.client?.ok);
      const clientErr = String(data?.email?.client?.error || "").trim();
      const adminErr = String(data?.email?.admin?.error || "").trim();

      if (!emailConfigured) {
        setSuccess(
          "Booking request submitted, we will be in contact shortly.",
        );
      } else if (adminOk || clientOk) {
        // If either email sends successfully, keep the UI reassuring.
        setSuccess("Booking request submitted, we will be in contact shortly.");
      } else {
        // Keep the failure reason for debugging, but don't show provider IDs.
        setSuccess(
          `Booking request submitted, but we couldn’t send emails (${adminErr || clientErr || "email failed"}).`,
        );
      }
    } catch (err: any) {
      // If the network request fails, store it as a draft so nothing is lost.
      saveDraft({
        title: eventName.trim() ? eventName.trim() : "Cocktail booking request",
        eventDate,
        notes,
        clientEmail,
        guestCount: Number(guestCountInput),
        clientPhone: combinedPhone || null,
        submit: true,
        cocktails: cocktailsSummary.map((c) => ({
          recipeId: c.recipeId,
          recipeName: c.recipeName,
          servings:
            Number(
              servingsByRecipeId[c.recipeId] ?? String(c.servings ?? 0),
            ) || 0,
        })),
      });
      setDrafts(loadDrafts());
      setError(
        err?.message ||
          "Network error while sending request. We saved it as a draft on this device.",
      );
    } finally {
      setLoading(false);
    }
  };

  type GetInvolvedCartItem = {
    url: string;
    count: number;
    sku?: string | null;
    desiredValue?: string | null;
    // Squarespace additionalFields values can be strings or arrays (e.g. phone field expects parts).
    fields?: Record<string, any> | null;
  };

  const exportRetailer = async (
    retailer: "danmurphys" | "woolworths" | "getinvolved",
  ) => {
    const rows: Array<{ name: string; type: string; qty: string; total: string; url: string }> = [];
    const getInvolvedCartItems: GetInvolvedCartItem[] = [];

    for (const item of orderList ?? []) {
      if (item.packPlan?.length) {
        for (const line of item.packPlan) {
          const url =
            line.purchaseUrl || line.searchUrl || item.purchaseUrl || "";
          const lineRetailer = (line.retailer as any) || retailerForUrl(url);
          if (lineRetailer !== retailer) continue;
          if (!url) continue;
          rows.push({
            name: `${item.name} (${line.packSize}${item.unit})`,
            type: item.type,
            qty: `${line.count} × ${line.packSize}${item.unit}`,
            total: `${item.total} ${item.unit}`,
            url,
          });
          if (retailer === "getinvolved") {
            getInvolvedCartItems.push({
              url,
              count: line.count,
              sku: line.variantSku || null,
              desiredValue: String(line.packSize),
              fields: null,
            });
          }
        }
        continue;
      }

      const url = resolvePurchaseUrlForItem(item) || "";
      if (retailerForUrl(url) !== retailer) continue;
      if (!url) continue;
      const qty = item.bottlesNeeded
        ? `${item.bottlesNeeded} × ${item.bottleSizeMl}${item.unit}`
        : `${item.total} ${item.unit}`;
      rows.push({
        name: item.name,
        type: item.type,
        qty,
        total: `${item.total} ${item.unit}`,
        url,
      });
      if (retailer === "getinvolved") {
        getInvolvedCartItems.push({
          url,
          count: item.bottlesNeeded || 1,
          sku: null,
          desiredValue: null,
          fields: null,
        });
      }
    }

    if (retailer === "getinvolved") {
      const kitItems = buildGetInvolvedCocktailKitCartItems({
        recipes,
        servingsByRecipeId,
        pricingTier,
      });
      if (kitItems.length) getInvolvedCartItems.push(...kitItems);

      // Also add recommended bartenders to cart (if configured).
      const cocktailCount = cocktailsSummary.length;
      const bartenders = recommendedBartenders(totalDrinks, cocktailCount);
      if (bartenders > 0 && GI_BARTENDER_PRODUCT_URL) {
        const variantSku =
          bartenderSkuMap[bartenderHours] ||
          bartenderSkuMap[String(Number(bartenderHours) || "")] ||
          GI_BARTENDER_VARIANT_SKU ||
          null;
        // Add this last so a bartender failure doesn't block glassware/ice/kits.
        getInvolvedCartItems.push({
          url: GI_BARTENDER_PRODUCT_URL,
          count: bartenders,
          sku: variantSku,
          desiredValue: bartenderHours,
          fields: null,
        });
      }
    }

    if (!rows.length && !(retailer === "getinvolved" && getInvolvedCartItems.length)) {
      setError("No items found for that store yet. Add pack purchase/search links for those items first.");
      return;
    }

    const storeLabel =
      retailer === "danmurphys"
        ? "dan-murphys"
        : retailer === "woolworths"
          ? "woolworths"
          : "getinvolved";

    // For Get Involved items (ice + glassware), we can optionally deep-link to a
    // Squarespace page that adds these products to cart in the *customer's* browser session.
    // This requires a small JS snippet on getinvolved.com.au to process the query string.
    if (retailer === "getinvolved" && getInvolvedCartItems.length) {
      // Also email the full order list to admin (so clients only see liquor, but you still get everything).
      // Don't block the cart export if email fails.
      try {
        await fetch("/api/admin/order-list-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: eventName.trim() ? eventName.trim() : "Cocktail booking request",
            eventDate,
            guestCount: guestCountInput ? Number(guestCountInput) : null,
            clientEmail,
            clientPhone: combinedPhone || null,
            notes,
            cocktails: cocktailsSummary.map((c) => ({
              recipeId: c.recipeId,
              recipeName: c.recipeName,
              servings:
                Number(servingsByRecipeId[c.recipeId] ?? String(c.servings ?? 0)) ||
                0,
            })),
            // Send the *full* order list (not the liquor-only client view).
            orderList,
          }),
        });
      } catch {
        // Ignore; cart export is still useful.
      }

      // Mixologist add-to-cart on Squarespace requires required product-form fields.
      // If the user hasn't filled these yet, we can still add glassware/ice/kits,
      // but the mixologist line would silently fail. We block and explain instead.
      const hasMixologist = getInvolvedCartItems.some((it) =>
        String(it.url || "").includes("/store/p/hire-a-mixologist"),
      );
      if (hasMixologist) {
        const emailMessage = validateEmail(clientEmail);
        const phoneMessage = validatePhone(phoneLocal);
        if (emailMessage || phoneMessage) {
          setError(
            "To add a mixologist to the cart, please fill Email and Telephone above (then click Get Involved! again).",
          );
          return;
        }

        const email = String(clientEmail || "").trim();
        const phoneRaw = String(phoneLocal || "").trim();
        const address =
          String(eventLocation || "").trim() ||
          String(notes || "").trim() ||
          String(eventName || "").trim() ||
          "TBC";

        // Squarespace's "phone" form field expects 3-3-4 parts: [Country, AreaCode, Prefix, Line]
        // (Country is blank when showCountryCode=false).
        const phoneParts = (() => {
          const digits = phoneRaw.replace(/\D/g, "");
          if (digits.length < 10) return null;
          const last10 = digits.slice(-10);
          return [
            "",
            last10.slice(0, 3),
            last10.slice(3, 6),
            last10.slice(6, 10),
          ];
        })();

        // Attach required fields to the mixologist item(s).
        for (const it of getInvolvedCartItems) {
          if (!String(it.url || "").includes("/store/p/hire-a-mixologist")) continue;
          it.fields = {
            [GI_MIXOLOGIST_FIELD_EMAIL]: email,
            // If we can't safely format the phone into parts, fall back to raw.
            // (Cart-import script can still try to coerce it.)
            [GI_MIXOLOGIST_FIELD_PHONE]: phoneParts || phoneRaw,
            [GI_MIXOLOGIST_FIELD_ADDRESS]: address,
          };
        }
      }

      // Open a dedicated export page (new tab). That page resolves SKUs + redirects to /cart-import.
      // This avoids popup blockers while still giving users a clean "Adding to cart…" experience.
      const exportUrl = buildLocalGetInvolvedExportUrl(getInvolvedCartItems);
      window.open(exportUrl, "_blank", "noopener,noreferrer");
      return;
    }

    const html = buildRetailerExportHtml(
      `Shopping list — ${storeLabel.replaceAll("-", " ")}`,
      rows.map((r) => ({ name: r.name, qty: r.qty, url: r.url })),
    );
    window.open(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`, "_blank", "noopener,noreferrer");
  };

  const sendDraft = async (draft: OfflineDraft) => {
    if (!draft?.payload) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setError("You’re offline. Connect to the internet to send this draft.");
      return;
    }
    setSendingDraftId(draft.id);
    setError(null);
    setSuccess(null);
    setEditLink(null);
    try {
      const response = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft.payload),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setError(data?.error || `Unable to send draft (HTTP ${response.status}).`);
        return;
      }

      removeDraft(draft.id);
      setDrafts(loadDrafts());

      const token = data?.editToken as string | undefined;
      const slug = data?.editSlug as string | undefined | null;
      if (token || slug) {
        const link = `${window.location.origin}/request/edit/${slug || token}`;
        setEditLink(link);
      }
      setSuccess("Draft sent. We’ll be in touch soon.");
    } catch (err: any) {
      setError(err?.message || "Network error while sending draft.");
    } finally {
      setSendingDraftId(null);
    }
  };

  if (!stored) {
    return (
      <div className="min-h-screen hero-grid px-6 py-16">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
          <header>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">
              Get Involved with our
            </p>
            <h1 className="font-display text-4xl text-ink">Order List</h1>
            <p className="mt-2 text-sm text-muted">
              No order list found yet. Go back to select cocktails and create one.
            </p>
          </header>

          <button
            type="button"
            onClick={() => router.push("/request")}
            className="gi-btn-primary w-fit px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] shadow-lg shadow-[#c47b4a]/30 hover:-translate-y-0.5"
          >
            Back to builder
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen hero-grid px-6 py-16">
      {/* Print view: compact shopping-list style (hides the UI) */}
      <div className="print-only">
        <div className="mx-auto w-full max-w-3xl py-6">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-black/70">
            Brought to you by GET INVOLVED! Catering - The Connoisseurs of Cocktail Catering
          </p>
          <h1 className="text-xl font-semibold">Order List</h1>
          <p className="mt-1 text-sm text-black/70">
            Totals include a 10% buffer. Items are rounded up to pack sizes where provided (for example, 700ml bottles).
          </p>

          <h2 className="mt-6 text-sm font-semibold uppercase tracking-[0.2em] text-black/80">
            Cocktails
          </h2>
          <ul className="mt-2 space-y-1 text-sm">
            {cocktailsSummary.map((c) => (
              <li key={c.recipeId} className="flex items-baseline justify-between gap-6">
                <span className="font-medium">{c.recipeName}</span>
                <span className="tabular-nums">{Number(servingsByRecipeId[c.recipeId] ?? c.servings ?? 0) || 0}</span>
              </li>
            ))}
          </ul>

          <h2 className="mt-6 text-sm font-semibold uppercase tracking-[0.2em] text-black/80">
            {isAdmin ? "Shopping list" : "Your Shopping List"}
          </h2>
          <ul className="mt-2 space-y-1 text-sm">
            {visibleOrderList.map((item) => (
              <li key={item.ingredientId} className="flex items-baseline justify-between gap-6">
                <span>
                  <span className="font-medium">{item.name}</span>{" "}
                  <span className="text-black/60">
                    ({item.type}
                    {item.totalCost ? ` · ${formatAud(item.totalCost)}` : ""}
                    )
                  </span>
                </span>
                <span className="tabular-nums text-right">
                  {item.packPlan?.length ? (
                    <span>
                      {formatPackPlan(item.packPlan, item.unit)}
                      <span className="block text-[11px] text-black/60">
                        Total: {item.total} {item.unit}
                      </span>
                    </span>
                  ) : item.bottlesNeeded ? (
                    <span>
                      {item.bottlesNeeded} × {item.bottleSizeMl}
                      {item.unit}
                      <span className="block text-[11px] text-black/60">
                        Total: {item.total} {item.unit}
                      </span>
                    </span>
                  ) : (
                    `${item.total} ${item.unit}`
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="no-print mx-auto flex w-full max-w-5xl flex-col gap-8 overflow-x-hidden">
        <header>
          <p className="flex items-center justify-between gap-3 font-semibold uppercase tracking-[0.22em] text-accent">
            <a
              href="https://www.getinvolved.com.au"
              target="_blank"
              rel="noreferrer"
              className="whitespace-nowrap text-[13px] font-bold sm:text-sm"
            >
              Involved Events
            </a>
            <a
              href="https://www.getinvolved.com.au"
              target="_blank"
              rel="noreferrer"
              aria-label="Get Involved! Catering"
              className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full border border-subtle bg-white/70 shadow-sm hover:-translate-y-0.5"
            >
              <img
                src="/prawn-icon.png"
                alt=""
                aria-hidden="true"
                className="h-full w-full object-cover"
              />
            </a>
          </p>
          <h1 className="font-display text-4xl text-ink">Order List</h1>
          <p className="mt-2 text-sm text-muted">
            Totals include a 10% buffer. Items are rounded up to pack sizes where provided (for example, 700ml bottles).
          </p>
        </header>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {recalcError ? <p className="text-sm text-red-600">{recalcError}</p> : null}

        {drafts.length ? (
          <div className="rounded-[28px] border border-subtle bg-white/70 px-8 py-6">
            <h2 className="font-display text-2xl text-accent">Saved drafts</h2>
            <p className="mt-2 text-sm text-muted">
              If you were offline, your booking request was saved here. When you’re online, you can send it.
            </p>
            <div className="mt-4 grid gap-3">
              {drafts.map((d) => (
                <div
                  key={d.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-subtle bg-white/80 px-5 py-4"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">
                      {String(d.payload?.title || "Draft request")}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {new Date(d.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      disabled={
                        sendingDraftId === d.id ||
                        loading ||
                        (typeof navigator !== "undefined" && !navigator.onLine)
                      }
                      onClick={() => sendDraft(d)}
                      className="gi-btn-primary px-5 py-2 text-xs font-semibold uppercase tracking-[0.25em] hover:-translate-y-0.5 disabled:opacity-60"
                    >
                      {sendingDraftId === d.id ? "Sending..." : "Send"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        removeDraft(d.id);
                        setDrafts(loadDrafts());
                      }}
                      className="gi-btn-secondary px-5 py-2 text-xs font-semibold uppercase tracking-[0.25em] hover:-translate-y-0.5"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="glass-panel rounded-[28px] px-8 py-6">
          <h2 className="font-display text-2xl text-accent">
            Selected cocktails
          </h2>
          {(() => {
            const guests = parseNonNegativeInt(guestCountInput);
            const perGuest =
              guests && guests > 0 ? totalDrinks / guests : null;
            const perGuestLabel =
              perGuest === null || !Number.isFinite(perGuest)
                ? null
                : perGuest
                    .toFixed(2)
                    .replace(/\.00$/, "")
                    .replace(/(\.\d)0$/, "$1");

            return (
              <>
                <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 text-sm text-muted">
                  <span>
                    {totalDrinks > 0
                      ? `Total drinks: ${totalDrinks}`
                      : "Set quantities to generate totals."}
                  </span>
                  <span>{`Total guests: ${guests ?? "—"}`}</span>
                </div>

                <div className="mt-0.5 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                  <button
                    type="button"
                    onClick={() => setEditingQuantities((v) => !v)}
                    className="w-fit appearance-none bg-transparent p-0 text-[11px] font-semibold text-accent underline underline-offset-2"
                  >
                    {editingQuantities ? "Done amending" : "Amend quantities"}
                  </button>
                  {perGuestLabel !== null ? (
                    <span className="text-[12px] leading-none text-ink-muted">
                      {perGuestLabel} cocktails per guest
                    </span>
                  ) : (
                    <span />
                  )}
                </div>
              </>
            );
          })()}

          <div className="mt-4 grid gap-3">
            {(editingQuantities ? cocktailsEditable : cocktailsSummary).map((c) => {
              const displayName = normalizeCocktailDisplayName(c.recipeName);
              return (
                <div
                  key={c.recipeId}
                  className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-2xl border border-subtle bg-white/80 px-4 py-3 sm:px-5 sm:py-4"
                >
                  <div className="flex min-w-0 items-center gap-3 overflow-hidden">
                    <div className="h-9 w-9 shrink-0 overflow-hidden rounded-xl border border-black/10 bg-white/70 p-1">
                      <img
                        src={resolveCocktailImageSrc(null, displayName)}
                        alt=""
                        aria-hidden="true"
                        className="h-full w-full object-contain"
                        onError={(event) => {
                          const img = event.currentTarget;
                          const stage = Number(img.dataset.fallbackStage || "0") || 0;
                          if (stage >= 3) {
                            img.src = COCKTAIL_PLACEHOLDER_IMAGE;
                            return;
                          }
                          const current = img.getAttribute("src") || "";
                          const next = resolveNextCocktailImageSrc(current);
                          img.dataset.fallbackStage = String(stage + 1);
                          img.src = next || COCKTAIL_PLACEHOLDER_IMAGE;
                        }}
                      />
                    </div>
                    <p className="min-w-0 truncate text-sm font-semibold text-ink">
                      {displayName}
                    </p>
                  </div>

                  <div className="shrink-0 justify-self-end text-right">
                    {editingQuantities ? (
                      <div className="flex items-center justify-end">
                        <input
                          type="number"
                          min={0}
                          value={
                            servingsByRecipeId[c.recipeId] ?? String(c.servings ?? 0)
                          }
                          onFocus={() => {
                            const current =
                              servingsByRecipeId[c.recipeId] ??
                              String(c.servings ?? 0);
                            if (current === "0") {
                              setServingsByRecipeId((prev) => ({
                                ...prev,
                                [c.recipeId]: "",
                              }));
                            }
                          }}
                          onBlur={() => {
                            const current =
                              servingsByRecipeId[c.recipeId] ??
                              String(c.servings ?? 0);
                            if (current === "") {
                              setServingsByRecipeId((prev) => ({
                                ...prev,
                                [c.recipeId]: "0",
                              }));
                            }
                          }}
                          onChange={(event) =>
                            setServingsByRecipeId((prev) => ({
                              ...prev,
                              [c.recipeId]: event.target.value,
                            }))
                          }
                          // iOS Safari zooms when inputs are < 16px font-size.
                          className="h-10 w-[5.2ch] rounded-xl border border-soft bg-white/90 px-1 py-0 text-right text-[16px] text-ink tabular-nums"
                        />
                      </div>
                    ) : (
                      <div className="h-10 w-[5.2ch] px-1 text-right text-[16px] leading-10 text-ink-muted tabular-nums">
                        {Number(servingsByRecipeId[c.recipeId] ?? c.servings ?? 0) || 0}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-6">
            <button
              type="button"
              onClick={handleBack}
              className="gi-btn-primary w-full px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] shadow-lg shadow-[#c47b4a]/30 hover:-translate-y-0.5"
            >
              Add/remove drinks
            </button>
          </div>
        </div>

        <div className="glass-panel rounded-[28px] px-8 py-6">
          <h2 className="font-display text-2xl text-accent">Order List</h2>

          <div className="mt-4 flex items-baseline justify-between gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-[0.25em] text-accent">
              {isAdmin ? "Shopping list" : "Your Shopping List"}
            </h3>
            {formattedEstimatedCost ? (
              <p className="shrink-0 whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.2em] text-accent/80 sm:text-[11px]">
                Est. cost: {formattedEstimatedCost}
              </p>
            ) : null}
          </div>
          <div className="mt-3">
            <div className="flex w-full overflow-hidden rounded-full border border-subtle bg-white/70 text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
              <button
                type="button"
                onClick={() => setPricingTier("house")}
                className={`flex-1 px-4 py-2 text-center transition ${
                  pricingTier === "house"
                    ? "bg-accent text-on-accent"
                    : "hover:bg-white"
                }`}
              >
                Premium
              </button>
              <button
                type="button"
                onClick={() => setPricingTier("top_shelf")}
                className={`flex-1 border-l border-subtle px-4 py-2 text-center transition ${
                  pricingTier === "top_shelf"
                    ? "bg-accent text-on-accent"
                    : "hover:bg-white"
                }`}
              >
                Top Shelf
              </button>
            </div>
          </div>
          <ul className="mt-4 divide-y divide-[#c47b4a]/15 overflow-hidden rounded-2xl border border-subtle bg-white/70">
            {visibleOrderList.map((item) => (
              <li
                key={item.ingredientId}
                className="flex items-start justify-between gap-6 px-4 py-3"
              >
                <div className="min-w-0">
                  {resolvePurchaseUrlForItem(item) ? (
                    <a
                      href={resolvePurchaseUrlForItem(item)}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="truncate text-sm font-semibold text-ink underline underline-offset-2 hover:opacity-80"
                      title={item.name}
                    >
                      {item.name}
                    </a>
                  ) : (
                    <p className="truncate text-sm font-semibold text-ink">
                      {item.name}
                    </p>
                  )}
                  <p className="text-[11px] uppercase tracking-[0.2em] text-accent">
                    {item.type}
                    {item.totalCost ? ` (${formatAud(item.totalCost)})` : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right tabular-nums">
                  {item.packPlan?.length ? (
                    <div className="text-right">
                      <div className="text-sm font-semibold text-ink">
                        {item.packPlan
                          .slice()
                          .sort((a, b) => b.packSize - a.packSize)
                          .map((p) => {
                            const url =
                              p.purchaseUrl || p.searchUrl || item.purchaseUrl;
                            const label = `${p.count} × ${p.packSize}${item.unit}`;
                            return url ? (
                              <a
                                key={`${p.packSize}-${p.count}`}
                                href={url}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="block underline underline-offset-2 hover:opacity-80"
                              >
                                {label}
                              </a>
                            ) : (
                              <span key={`${p.packSize}-${p.count}`} className="block">
                                {label}
                              </span>
                            );
                          })}
                      </div>
                      <p className="mt-1 text-[12px] text-ink-muted">
                        {(item.type === "glassware" && item.exactTotal
                          ? item.exactTotal
                          : item.total)}{" "}
                        {item.unit}
                      </p>
                    </div>
                  ) : item.bottlesNeeded ? (
                    <div className="text-right">
                      <p className="text-sm font-semibold text-ink">
                        {item.bottlesNeeded} × {item.bottleSizeMl}
                        {item.unit}
                      </p>
                      <p className="mt-1 text-[12px] text-ink-muted">
                        {(item.type === "glassware" && item.exactTotal
                          ? item.exactTotal
                          : item.total)}{" "}
                        {item.unit}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm font-semibold text-ink">
                      {item.total} {item.unit}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-accent md:col-span-2">
              Event location
              <input
                type="text"
                value={eventLocation}
                onChange={(event) => setEventLocation(event.target.value)}
                placeholder="Venue address, suburb, city..."
                autoComplete="street-address"
                className={`mt-2 ${fieldClass} border-soft`}
              />
            </label>

            <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-accent">
              Email
              <input
                type="email"
                value={clientEmail}
                onChange={(event) => {
                  setClientEmail(event.target.value);
                  if (emailError) setEmailError(null);
                }}
                onBlur={() => setEmailError(validateEmail(clientEmail))}
                placeholder="you@example.com"
                inputMode="email"
                autoComplete="email"
                className={`mt-2 ${fieldClass} ${
                  emailError ? "border-red-400" : "border-soft"
                }`}
              />
              {emailError ? (
                <p className="mt-2 text-[12px] font-medium text-red-600 normal-case tracking-normal">
                  {emailError}
                </p>
              ) : null}
            </label>

            <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-accent">
              Telephone
              <div className="mt-2 flex w-full max-w-full flex-nowrap items-stretch gap-2">
                <div className="relative h-[52px] w-[52px] shrink-0">
                  <div className="pointer-events-none flex h-full w-full items-center justify-center rounded-2xl border border-soft bg-white/80 text-[18px]">
                    {flagEmoji(phoneCountryIso2 as string)}
                  </div>
                  <select
                    value={phoneCountryIso2}
                    onChange={(event) => {
                      setPhoneCountryIso2(
                        event.target.value as keyof typeof countries,
                      );
                      if (phoneError) setPhoneError(null);
                    }}
                    aria-label="Country"
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  >
                    <optgroup label="Priority">
                      {countryOptions.priority.map((c) => (
                        <option key={c.iso2} value={c.iso2}>
                          {c.flag} {c.dial} {c.name}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="All countries">
                      {countryOptions.rest.map((c) => (
                        <option key={c.iso2} value={c.iso2}>
                          {c.flag} {c.dial} {c.name}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>

                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={phoneLocal}
                  onChange={(event) => {
                    setPhoneLocal(event.target.value);
                    if (phoneError) setPhoneError(null);
                  }}
                  onBlur={() => setPhoneError(validatePhone(phoneLocal))}
                  placeholder={phonePlaceholder}
                  className={`${fieldClass} flex-1 placeholder:text-muted/55 focus:placeholder-transparent ${
                    phoneError ? "border-red-400" : "border-soft"
                  }`}
                />
              </div>
              {phoneError ? (
                <p className="mt-2 text-[12px] font-medium text-red-600 normal-case tracking-normal">
                  {phoneError}
                </p>
              ) : null}
            </label>
          </div>

          {GI_BARTENDER_PRODUCT_URL ? (
            <div className="mt-4">
              <label className="block text-center text-xs font-semibold uppercase tracking-[0.2em] text-accent">
                Hours per bartender
                <div className="mx-auto mt-2 max-w-[240px]">
                  <select
                    value={bartenderHours}
                    onChange={(event) => setBartenderHours(event.target.value)}
                    className={`${fieldClass} border-soft text-center`}
                    style={{ textAlignLast: "center" }}
                  >
                    {(Object.keys(bartenderSkuMap).length
                      ? Object.keys(bartenderSkuMap)
                          .slice()
                          .sort((a, b) => Number(a) - Number(b))
                      : ["4", "5", "6", "7", "8"]
                    ).map((h) => (
                      <option key={h} value={h}>
                        {h} hours
                      </option>
                    ))}
                  </select>
                </div>
              </label>
              <p className="mt-2 text-center text-[12px] text-ink-muted">
                Recommended:{" "}
                {recommendedMixologists} mixologist
                {recommendedMixologists ===
                1
                  ? ""
                  : "s"}
              </p>
            </div>
          ) : null}

          <div className="mt-4">
            <button
              type="button"
              onClick={() => {
                void exportRetailer("getinvolved");
              }}
              disabled={exportingToCart}
              className="gi-btn-primary w-full px-5 py-3 text-xs font-semibold uppercase tracking-[0.25em] hover:-translate-y-0.5 disabled:opacity-60"
            >
              <span className="inline-flex items-center justify-center gap-2">
                {exportingToCart ? "Adding to cart..." : "Get Involved!"}
                <CartIcon className="h-4 w-4 text-white" />
              </span>
            </button>
          </div>
          <p className="mt-4 text-[12px] leading-relaxed text-ink-muted">
            Alcohol must be bought and supplied by the client. Involved Events are
            a service provider only &mdash; ultimately the type and volume of
            alcohol supplied remains the client&apos;s choice and responsibility.
          </p>
          <button
            type="button"
            onClick={() =>
              window.open("https://www.danmurphys.com.au", "_blank", "noopener,noreferrer")
            }
            className="gi-btn-secondary mt-3 w-full px-5 py-3 text-xs font-semibold uppercase tracking-[0.25em] hover:-translate-y-0.5"
          >
            Dan Murphy&apos;s
          </button>

          <div
            ref={orderBartendersRef}
            className="mt-8 rounded-[28px] border border-subtle bg-white/70 p-6"
          >
            <h3 className="font-display text-xl text-ink">
              Bespoke Requests
            </h3>
            <p className="mt-2 text-sm text-muted">
              {success
                ? "Booking request submitted, we will be in contact shortly."
                : "Send this order list to Get Involved and we’ll follow up."}
            </p>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-accent">
                Event name
                <input
                  type="text"
                  value={eventName}
                  onChange={(event) => setEventName(event.target.value)}
                  placeholder="Birthday, corporate event, engagement..."
                  autoComplete="organization"
                  // iOS Safari zooms when inputs are < 16px font-size.
                  className={`mt-2 ${fieldClass} border-soft`}
                />
              </label>

              <label className="block min-w-0 text-xs font-semibold uppercase tracking-[0.2em] text-accent">
                Date of Event
                <input
                  type="date"
                  min={minDate}
                  value={eventDate}
                  onChange={(event) => handleEventDateChange(event.target.value)}
                  onBlur={(event) => handleEventDateChange(event.target.value)}
                  // iOS Safari zooms when inputs are < 16px font-size.
                  className={`mt-2 ${fieldClass} appearance-none border-soft`}
                  // iOS sometimes applies inherited letter-spacing to date inputs; force normal.
                  style={{ letterSpacing: "normal" }}
                />
              </label>

              <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-accent md:col-start-2">
                Number of guests
                <input
                  type="number"
                  min={1}
                  value={guestCountInput}
                  onChange={(event) => {
                    setGuestCountInput(event.target.value);
                    if (guestCountError) setGuestCountError(null);
                  }}
                  onBlur={() =>
                    setGuestCountError(validateGuestCount(guestCountInput))
                  }
                  placeholder="50"
                  inputMode="numeric"
                  // iOS Safari zooms when inputs are < 16px font-size.
                  className={`mt-2 ${fieldClass} ${
                    guestCountError ? "border-red-400" : "border-soft"
                  }`}
                />
                {guestCountError ? (
                  <p className="mt-2 text-[12px] font-medium text-red-600 normal-case tracking-normal">
                    {guestCountError}
                  </p>
                ) : null}
              </label>
              <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-accent md:col-span-2">
                Message
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Dietary requirements, custom creations, special requests, etc..."
                  // iOS Safari zooms when inputs are < 16px font-size.
                  className="mt-2 min-h-[120px] w-full max-w-full rounded-2xl border border-soft bg-white/80 px-4 py-3 text-[16px] tracking-normal text-ink"
                />
              </label>
            </div>

            <button
              onClick={handleOrderBartenders}
              disabled={loading}
              className="gi-btn-primary mt-4 px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] shadow-lg shadow-[#c47b4a]/30 hover:-translate-y-0.5 disabled:opacity-60"
            >
              {loading ? "Submitting..." : "Submit request"}
            </button>
          </div>

          {editLink ? (
            <div className="mt-6 rounded-3xl border border-subtle bg-white/70 px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
                Booking request submitted, a member of our team will be in contact shortly.
              </p>
              <p className="mt-2 break-all text-sm text-ink">{editLink}</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
