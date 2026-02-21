"use client";

import { buildIngredientTotals, type IngredientTotal } from "@/lib/inventoryMath";
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

const typePriority: Record<string, number> = {
  liquor: 0,
  mixer: 1,
  juice: 2,
  syrup: 3,
  garnish: 4,
  ice: 5,
  glassware: 6,
};

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
  if (plan.length > 1) return undefined;
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
  // Default: cheapest. Also treat legacy "economy/budget" as Budget.
  return "budget";
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
  rows: Array<{ url: string; count: number }>,
  origin = "https://www.getinvolved.com.au",
) {
  // Keep payload intentionally small.
  const payload = rows
    .filter((r) => r && r.url && r.count > 0)
    .map((r) => ({ url: r.url, count: r.count }));
  const encoded = base64UrlEncodeUtf8(JSON.stringify({ v: 1, items: payload }));
  return `${origin.replace(/\/$/, "")}/cart-import?items=${encoded}`;
}

export default function RequestOrderPage() {
  const router = useRouter();
  const orderBartendersRef = useRef<HTMLDivElement | null>(null);
  const [stored, setStored] = useState<StoredOrder | null>(null);
  const [drafts, setDrafts] = useState<OfflineDraft[]>([]);
  const [sendingDraftId, setSendingDraftId] = useState<string | null>(null);

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [servingsByRecipeId, setServingsByRecipeId] = useState<
    Record<string, string>
  >({});

  const [orderList, setOrderList] = useState<IngredientTotal[]>([]);
  const [recalcError, setRecalcError] = useState<string | null>(null);
  const [editingQuantities, setEditingQuantities] = useState(false);
  const [pricingTier, setPricingTier] = useState<
    "budget" | "house" | "top_shelf"
  >("budget");

  const [eventDate, setEventDate] = useState("");
  const [eventName, setEventName] = useState("");
  const [notes, setNotes] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [guestCountInput, setGuestCountInput] = useState("");
  const [phoneCountryIso2, setPhoneCountryIso2] = useState<keyof typeof countries>(
    "AU",
  );
  const [phoneLocal, setPhoneLocal] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [guestCountError, setGuestCountError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editLink, setEditLink] = useState<string | null>(null);
  const minDate = useMemo(() => todayIsoDate(), []);

  const estimatedCost = useMemo(() => {
    const sum = (orderList ?? []).reduce((acc, item) => acc + (item.totalCost ?? 0), 0);
    return Number.isFinite(sum) ? sum : 0;
  }, [orderList]);

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
        "id, name, recipe_ingredients(ml_per_serving, ingredients(id, name, type, unit, bottle_size_ml, purchase_url, price, ingredient_packs(pack_size, pack_price, purchase_url, search_url, search_query, retailer, tier, is_active)))";
      const selectWithoutPacks =
        "id, name, recipe_ingredients(ml_per_serving, ingredients(id, name, type, unit, bottle_size_ml, purchase_url, price))";

      let { data, error } = await supabase
        .from("recipes")
        .select(selectWithPacks)
        .in("id", recipeIds);

      if (
        error &&
        (String((error as any).code || "") === "42703" ||
          String(error.message || "").toLowerCase().includes("ingredient_packs"))
      ) {
        ({ data, error } = await supabase
          .from("recipes")
          .select(selectWithoutPacks)
          .in("id", recipeIds));
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
                    if (pricingTier === "budget") return true; // allow any tier, pick cheapest overall
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
        notes,
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

  const exportRetailer = (retailer: "danmurphys" | "woolworths" | "getinvolved") => {
    const rows: Array<{ name: string; type: string; qty: string; total: string; url: string }> = [];
    const getInvolvedCartItems: Array<{ url: string; count: number }> = [];

    for (const item of orderList ?? []) {
      if (item.packPlan?.length) {
        for (const line of item.packPlan) {
          const url = line.purchaseUrl || line.searchUrl || "";
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
            getInvolvedCartItems.push({ url, count: line.count });
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
        getInvolvedCartItems.push({ url, count: item.bottlesNeeded || 1 });
      }
    }

    if (!rows.length) {
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
      const importUrl = buildGetInvolvedCartImportUrl(getInvolvedCartItems);
      window.open(importUrl, "_blank", "noopener,noreferrer");
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
            Shopping list
          </h2>
          <ul className="mt-2 space-y-1 text-sm">
            {orderList.map((item) => (
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

          <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => window.print()}
              className="gi-btn-secondary px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] hover:-translate-y-0.5"
            >
              Print order list
            </button>
            <button
              type="button"
              onClick={() =>
                orderBartendersRef.current?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                })
              }
              className="gi-btn-primary px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] shadow-lg shadow-[#c47b4a]/30 hover:-translate-y-0.5"
            >
              Send order list
            </button>
          </div>

          <div className="mt-10 flex items-baseline justify-between gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-[0.25em] text-accent">
              Shopping list
            </h3>
            {formattedEstimatedCost ? (
              <p className="shrink-0 whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.2em] text-accent/80 sm:text-[11px]">
                Est. cost: {formattedEstimatedCost}
              </p>
            ) : null}
          </div>
          <div className="mt-3 flex items-center justify-start">
            <div className="inline-flex overflow-hidden rounded-full border border-subtle bg-white/70 text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
              <button
                type="button"
                onClick={() => setPricingTier("top_shelf")}
                className={`px-4 py-2 transition ${
                  pricingTier === "top_shelf"
                    ? "bg-accent text-on-accent"
                    : "hover:bg-white"
                }`}
              >
                Top Shelf
              </button>
              <button
                type="button"
                onClick={() => setPricingTier("house")}
                className={`border-x border-subtle px-4 py-2 transition ${
                  pricingTier === "house"
                    ? "bg-accent text-on-accent"
                    : "hover:bg-white"
                }`}
              >
                House
              </button>
              <button
                type="button"
                onClick={() => setPricingTier("budget")}
                className={`px-4 py-2 transition ${
                  pricingTier === "budget"
                    ? "bg-accent text-on-accent"
                    : "hover:bg-white"
                }`}
              >
                Cheap
              </button>
            </div>
          </div>
          <ul className="mt-4 divide-y divide-[#c47b4a]/15 overflow-hidden rounded-2xl border border-subtle bg-white/70">
            {(orderList ?? []).map((item) => (
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
                            const url = p.purchaseUrl || p.searchUrl;
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
                        {item.total} {item.unit}
                      </p>
                    </div>
                  ) : item.bottlesNeeded ? (
                    <div className="text-right">
                      <p className="text-sm font-semibold text-ink">
                        {item.bottlesNeeded} × {item.bottleSizeMl}
                        {item.unit}
                      </p>
                      <p className="mt-1 text-[12px] text-ink-muted">
                        {item.total} {item.unit}
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

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => exportRetailer("danmurphys")}
              className="gi-btn-primary w-full px-5 py-3 text-xs font-semibold uppercase tracking-[0.25em] hover:-translate-y-0.5"
            >
              Dan Murphy's
            </button>
            <button
              type="button"
              onClick={() => exportRetailer("woolworths")}
              className="gi-btn-primary w-full px-5 py-3 text-xs font-semibold uppercase tracking-[0.25em] hover:-translate-y-0.5"
            >
              Woolworths
            </button>
            <button
              type="button"
              onClick={() => exportRetailer("getinvolved")}
              className="gi-btn-primary w-full px-5 py-3 text-xs font-semibold uppercase tracking-[0.25em] hover:-translate-y-0.5"
            >
              Get Involved
            </button>
          </div>

          <div
            ref={orderBartendersRef}
            className="mt-8 rounded-[28px] border border-subtle bg-white/70 p-6"
          >
            <h3 className="font-display text-xl text-ink">
              Book Bartenders for your Event
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
                  // iOS Safari zooms when inputs are < 16px font-size.
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
              <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-accent md:col-span-2">
                Message
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="What’s the special occasion? Event schedule? Special/signature cocktail requests? Allergies, dietary requirements, venue details..."
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
              {loading ? "Sending request..." : "Book Bartenders"}
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
