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

export default function RequestOrderPage() {
  const router = useRouter();
  const orderBartendersRef = useRef<HTMLDivElement | null>(null);
  const [stored, setStored] = useState<StoredOrder | null>(null);

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [servingsByRecipeId, setServingsByRecipeId] = useState<
    Record<string, string>
  >({});

  const [orderList, setOrderList] = useState<IngredientTotal[]>([]);
  const [recalcError, setRecalcError] = useState<string | null>(null);
  const [editingQuantities, setEditingQuantities] = useState(false);

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
                    ? "Big night"
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
    if (!parsed || !parsed.isValid()) {
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
    return parsed?.isValid() ? parsed.number : "";
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

      const { data, error } = await supabase
        .from("recipes")
        .select(
          "id, name, recipe_ingredients(ml_per_serving, ingredients(id, name, type, unit, bottle_size_ml))",
        )
        .in("id", recipeIds);

      if (error) {
        setRecalcError(error.message);
        return;
      }

      setRecipes(((data ?? []) as unknown as Recipe[]) || []);
    };

    load();
  }, [stored]);

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
        }),
      );
    } catch {
      // Ignore storage errors.
    }
  }, [stored, recipes, servingsByRecipeId]);

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

      const response = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
        }),
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
      setSuccess("Request sent. We’ll be in touch soon.");
    } catch (err: any) {
      setError(err?.message || "Network error while sending request.");
    } finally {
      setLoading(false);
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
            Brought to you by Get Involved - The Kings of Cocktail Catering
          </p>
          <h1 className="text-xl font-semibold">Order List</h1>
          <p className="mt-1 text-sm text-black/70">
            Totals include a 10% buffer. Liquor is rounded to 700ml bottles.
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
                  <span className="text-black/60">({item.type})</span>
                </span>
                <span className="tabular-nums">
                  {item.bottlesNeeded
                    ? `${item.bottlesNeeded} × ${item.bottleSizeMl}ml`
                    : `${item.total} ${item.unit}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="no-print mx-auto flex w-full max-w-5xl flex-col gap-8 overflow-x-hidden">
        <header>
          <p className="flex items-baseline gap-2 font-semibold uppercase tracking-[0.22em] text-accent">
            <a
              href="https://www.getinvolved.com.au"
              target="_blank"
              rel="noreferrer"
              className="text-[13px] font-bold sm:text-sm"
            >
              Get Involved! Catering
            </a>
            <span className="text-[11px] sm:text-xs">with our</span>
          </p>
          <h1 className="font-display text-4xl text-ink">Order List</h1>
          <p className="mt-2 text-sm text-muted">
            Totals include a 10% buffer. Liquor is rounded to 700ml bottles.
          </p>
        </header>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {success ? <p className="text-sm text-muted">{success}</p> : null}
        {recalcError ? <p className="text-sm text-red-600">{recalcError}</p> : null}

        <div className="glass-panel rounded-[28px] px-8 py-6">
          <h2 className="font-display text-2xl text-accent">
            Selected cocktails
          </h2>
          <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 text-sm text-muted">
            <span>
              {totalDrinks > 0
                ? `Total drinks: ${totalDrinks}`
                : "Set quantities to generate totals."}
            </span>
            <span>
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
                  <span className="flex flex-col items-end leading-tight">
                    <span>{`Total guests: ${guests ?? "—"}`}</span>
                    {perGuestLabel !== null ? (
                      <span className="text-[12px] text-ink-muted">
                        {perGuestLabel} cocktails per guest
                      </span>
                    ) : null}
                  </span>
                );
              })()}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setEditingQuantities((v) => !v)}
            className="mt-2 w-fit appearance-none bg-transparent p-0 text-[11px] font-semibold text-accent underline underline-offset-2"
          >
            {editingQuantities ? "Done amending" : "Amend quantities"}
          </button>

          <div className="mt-5 grid gap-3">
            {(editingQuantities ? cocktailsEditable : cocktailsSummary).map((c) => {
              const displayName = normalizeCocktailDisplayName(c.recipeName);
              return (
                <div
                  key={c.recipeId}
                  className="flex flex-nowrap items-center justify-between gap-4 rounded-2xl border border-subtle bg-white/80 px-5 py-4"
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

                  <div className="shrink-0 text-right">
                    {editingQuantities ? (
                      <div className="flex flex-col items-end">
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
                          className="w-24 rounded-xl border border-soft bg-white/90 px-3 py-2 text-right text-[16px] text-ink"
                        />
                        <p className="mt-1 text-xs text-muted">Quantity</p>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm font-semibold text-ink tabular-nums">
                          {Number(
                            servingsByRecipeId[c.recipeId] ?? c.servings ?? 0,
                          ) || 0}
                        </p>
                        <p className="mt-1 text-xs text-muted">Quantity</p>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-6 flex flex-wrap gap-4">
            <button
              type="button"
              onClick={handleBack}
              className="gi-btn-primary px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] shadow-lg shadow-[#c47b4a]/30 hover:-translate-y-0.5"
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

          <h3 className="mt-10 text-xs font-semibold uppercase tracking-[0.25em] text-accent">
            Shopping list
          </h3>
          <ul className="mt-4 divide-y divide-[#c47b4a]/15 overflow-hidden rounded-2xl border border-subtle bg-white/70">
            {(orderList ?? []).map((item) => (
              <li
                key={item.ingredientId}
                className="flex items-start justify-between gap-6 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">
                    {item.name}
                  </p>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-accent">
                    {item.type}
                  </p>
                </div>
                <div className="shrink-0 text-right tabular-nums">
                  <p className="text-sm font-semibold text-ink">
                    {item.bottlesNeeded
                      ? `${item.bottlesNeeded} × ${item.bottleSizeMl}ml`
                      : `${item.total} ${item.unit}`}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <div
            ref={orderBartendersRef}
            className="mt-8 rounded-[28px] border border-subtle bg-white/70 p-6"
          >
            <h3 className="font-display text-xl text-ink">
              Book Bartenders for your Event
            </h3>
            <p className="mt-2 text-sm text-muted">
              Send this order list to Get Involved and we’ll follow up.
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
                Private edit link
              </p>
              <p className="mt-2 break-all text-sm text-ink">{editLink}</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
