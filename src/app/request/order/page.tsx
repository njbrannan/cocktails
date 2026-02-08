"use client";

import { buildIngredientTotals, type IngredientTotal } from "@/lib/inventoryMath";
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
  const [notes, setNotes] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [phoneCountryIso2, setPhoneCountryIso2] = useState<keyof typeof countries>(
    "AU",
  );
  const [phoneLocal, setPhoneLocal] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editLink, setEditLink] = useState<string | null>(null);

  const normalizeIngredient = (value: Ingredient | Ingredient[] | null) => {
    if (!value) return null;
    return Array.isArray(value) ? value[0] ?? null : value;
  };

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

    const priorityIso2: Array<keyof typeof countries> = ["AU", "NL", "GB", "US"];
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

  const guestCount = useMemo(() => {
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
    // The request page will restore selection state from this stored order.
    router.push("/request?resume=1");
  };

  const handleOrderBartenders = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    setEditLink(null);

    try {
      if (!stored || cocktailsSummary.length === 0) {
        setError("No order list found. Go back and create your order list first.");
        return;
      }
      if (!isValidEmail(clientEmail)) {
        setError("Please enter a valid email address.");
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

      // Light phone validation (optional field)
      if (phoneLocal.trim()) {
        const parsed = parsePhoneNumberFromString(
          phoneLocal.trim(),
          phoneCountryIso2 as any,
        );
        if (!parsed || !parsed.isValid()) {
          setError(`Please enter a valid telephone number for ${selectedCountryName}.`);
          return;
        }
      }

      const response = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Cocktail booking request",
          eventDate,
          notes,
          clientEmail,
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
      if (!token) {
        setError("Request created, but no edit token was returned.");
        return;
      }

      const link = `${window.location.origin}/request/edit/${token}`;
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
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#6a2e2a]">
              Get Involved with our
            </p>
            <h1 className="font-display text-4xl text-[#151210]">Order list</h1>
            <p className="mt-2 text-sm text-[#4b3f3a]">
              No order list found yet. Go back to select cocktails and create one.
            </p>
          </header>

          <button
            type="button"
            onClick={() => router.push("/request")}
            className="w-fit rounded-full bg-[#6a2e2a] px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-[#f8f1e7] shadow-lg shadow-[#c47b4a]/30 hover:-translate-y-0.5"
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
          <h1 className="text-xl font-semibold">Order list</h1>
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

      <div className="no-print mx-auto flex w-full max-w-5xl flex-col gap-8">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#6a2e2a]">
            Get Involved with our
          </p>
          <h1 className="font-display text-4xl text-[#151210]">Order list</h1>
          <p className="mt-2 text-sm text-[#4b3f3a]">
            Totals include a 10% buffer. Liquor is rounded to 700ml bottles.
          </p>
        </header>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {success ? <p className="text-sm text-[#4b3f3a]">{success}</p> : null}
        {recalcError ? <p className="text-sm text-red-600">{recalcError}</p> : null}

        <div className="glass-panel rounded-[28px] px-8 py-6">
          <h2 className="font-display text-2xl text-[#6a2e2a]">
            Selected cocktails
          </h2>
          <p className="mt-2 text-sm text-[#4b3f3a]">
            {guestCount > 0
              ? `Total drinks: ${guestCount}`
              : "Set quantities to generate totals."}
          </p>
          <button
            type="button"
            onClick={() => setEditingQuantities((v) => !v)}
            className="mt-2 w-fit appearance-none bg-transparent p-0 text-[11px] font-semibold text-[#6a2e2a] underline underline-offset-2"
          >
            {editingQuantities ? "Done editing quantities" : "Edit quantities"}
          </button>

          <div className="mt-5 grid gap-3">
            {(editingQuantities ? cocktailsEditable : cocktailsSummary).map((c) => (
              <div
                key={c.recipeId}
                className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#c47b4a]/20 bg-white/80 px-5 py-4"
              >
                <div>
                  <p className="text-sm font-semibold text-[#151210]">
                    {c.recipeName}
                  </p>
                </div>
                <div className="text-right">
                  {editingQuantities ? (
                    <>
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
                        className="w-24 rounded-xl border border-[#c47b4a]/30 bg-white/90 px-3 py-2 text-right text-[16px] text-[#151210]"
                      />
                      <p className="mt-1 text-xs text-[#4b3f3a]">Quantity</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-semibold text-[#151210]">
                        {Number(servingsByRecipeId[c.recipeId] ?? c.servings ?? 0) ||
                          0}
                      </p>
                      <p className="mt-1 text-xs text-[#4b3f3a]">Quantity</p>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap gap-4">
            <button
              type="button"
              onClick={handleBack}
              className="rounded-full bg-[#6a2e2a] px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-[#f8f1e7] shadow-lg shadow-[#c47b4a]/30 hover:-translate-y-0.5"
            >
              Back to builder
            </button>
          </div>
        </div>

        <div className="glass-panel rounded-[28px] px-8 py-6">
          <h2 className="font-display text-2xl text-[#6a2e2a]">Order list</h2>

          <div className="mt-6 grid gap-3">
            {(orderList ?? []).map((item) => (
              <div
                key={item.ingredientId}
                className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#c47b4a]/20 bg-white/80 px-5 py-4"
              >
                <div>
                  <p className="text-sm font-semibold text-[#151210]">
                    {item.name}
                  </p>
                  <p className="text-xs uppercase tracking-[0.2em] text-[#6a2e2a]">
                    {item.type}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-[#151210]">
                    {item.total} {item.unit}
                  </p>
                  {item.bottlesNeeded ? (
                    <p className="text-xs text-[#4b3f3a]">
                      {item.bottlesNeeded} bottles @ {item.bottleSizeMl}ml
                    </p>
                  ) : (
                    <p className="text-xs text-[#4b3f3a]">Total</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-full border border-[#6a2e2a]/30 bg-white/70 px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-[#6a2e2a] hover:-translate-y-0.5"
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
              className="rounded-full bg-[#6a2e2a] px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-[#f8f1e7] shadow-lg shadow-[#c47b4a]/30 hover:-translate-y-0.5"
            >
              Send order list
            </button>
          </div>

          <div
            ref={orderBartendersRef}
            className="mt-8 rounded-[28px] border border-[#c47b4a]/20 bg-white/70 p-6"
          >
            <h3 className="font-display text-xl text-[#151210]">
              Book Bartenders for your Event
            </h3>
            <p className="mt-2 text-sm text-[#4b3f3a]">
              Send this order list to Get Involved and we’ll follow up.
            </p>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-[#6a2e2a]">
                Date of Event
                <input
                  type="date"
                  value={eventDate}
                  onChange={(event) => setEventDate(event.target.value)}
                  // iOS Safari zooms when inputs are < 16px font-size.
                  className="mt-2 w-full rounded-2xl border border-[#c47b4a]/30 bg-white/80 px-4 py-3 text-[16px]"
                />
              </label>
              <input
                type="email"
                value={clientEmail}
                onChange={(event) => setClientEmail(event.target.value)}
                placeholder="Your email"
                inputMode="email"
                autoComplete="email"
                // iOS Safari zooms when inputs are < 16px font-size.
                className="rounded-2xl border border-[#c47b4a]/30 bg-white/80 px-4 py-3 text-[16px]"
              />
              <div className="flex w-full max-w-full flex-nowrap gap-2">
                <select
                  value={phoneCountryIso2}
                  onChange={(event) =>
                    setPhoneCountryIso2(event.target.value as keyof typeof countries)
                  }
                  aria-label="Country code"
                  // Keep this compact so country + phone fits on one line on iPhone.
                  className="w-[76px] shrink-0 truncate rounded-2xl border border-[#c47b4a]/30 bg-white/80 px-2 py-3 text-center text-[16px]"
                >
                  <optgroup label="Priority">
                    {countryOptions.priority.map((c) => (
                      <option key={c.iso2} value={c.iso2}>
                        {c.labelCompact}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="All countries">
                    {countryOptions.rest.map((c) => (
                      <option key={c.iso2} value={c.iso2}>
                        {c.labelCompact} {c.name}
                      </option>
                    ))}
                  </optgroup>
                </select>
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={phoneLocal}
                  onChange={(event) => setPhoneLocal(event.target.value)}
                  placeholder="0412 345 678"
                  className="min-w-0 flex-1 rounded-2xl border border-[#c47b4a]/30 bg-white/80 px-4 py-3 text-[16px] placeholder:text-[#4b3f3a]/55 focus:placeholder-transparent"
                />
              </div>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Notes (venue, timing, dietary requests...)"
                // iOS Safari zooms when inputs are < 16px font-size.
                className="min-h-[120px] rounded-2xl border border-[#c47b4a]/30 bg-white/80 px-4 py-3 text-[16px] md:col-span-2"
              />
            </div>

            <button
              onClick={handleOrderBartenders}
              disabled={loading}
              className="mt-4 rounded-full bg-[#c47b4a] px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-white shadow-lg shadow-[#c47b4a]/30 hover:-translate-y-0.5 disabled:opacity-60"
            >
              {loading ? "Sending request..." : "Book Bartenders"}
            </button>
          </div>

          {editLink ? (
            <div className="mt-6 rounded-3xl border border-[#c47b4a]/20 bg-white/70 px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#6a2e2a]">
                Private edit link
              </p>
              <p className="mt-2 break-all text-sm text-[#151210]">{editLink}</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
