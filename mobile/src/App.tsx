import { useEffect, useMemo, useRef, useState } from "react";
import recipesSeed from "./seed/recipes.json";
import type { Recipe, RecipesPayload } from "./types";
import { normalizeCocktailDisplayName, resolveCocktailImageSrc } from "./lib/cocktailImages";
import { buildIngredientTotals, type IngredientTotal } from "./lib/inventoryMath";
import {
  loadCachedRecipes,
  loadDrafts,
  removeDraft,
  saveCachedRecipes,
  saveDraft,
  type Draft,
} from "./lib/offlineStore";
import { countries } from "countries-list";
import { parsePhoneNumberFromString } from "libphonenumber-js";

function isEditableTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = (el.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if ((el as any).isContentEditable) return true;
  let cur: HTMLElement | null = el;
  for (let i = 0; i < 4 && cur; i++) {
    const t = (cur.tagName || "").toLowerCase();
    if (t === "input" || t === "textarea" || t === "select") return true;
    if ((cur as any).isContentEditable) return true;
    cur = cur.parentElement;
  }
  return false;
}

function edgeSwipeThresholdPx() {
  return 28;
}

function parseNonNegativeInt(raw: string) {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isSafeInteger(n)) return null;
  return n;
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

const API_BASE =
  (import.meta as any).env?.VITE_API_BASE_URL || "https://events.getinvolved.com.au";

type Occasion = "relaxed" | "cocktail" | "wedding" | "big-night" | "custom";

const typePriority: Record<string, number> = {
  liquor: 0,
  mixer: 1,
  juice: 2,
  syrup: 3,
  garnish: 4,
  ice: 5,
  glassware: 6,
};

function flagEmoji(iso2: string) {
  const upper = iso2.toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return "";
  const points = [...upper].map((c) => 127397 + c.charCodeAt(0));
  return String.fromCodePoint(...points);
}

function normalizeIngredient<T>(value: T | T[] | null) {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function drinksPerGuestForOccasion(value: Occasion): 2 | 3 | 4 | null {
  switch (value) {
    case "relaxed":
      return 2;
    case "cocktail":
      return 3;
    case "wedding":
      return 3;
    case "big-night":
      return 4;
    case "custom":
      return null;
    default:
      return 2;
  }
}

export default function App() {
  const bookingRef = useRef<HTMLDivElement | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [step, setStep] = useState<"select" | "quantity" | "order">("select");
  const stepIndex = step === "select" ? 0 : step === "quantity" ? 1 : 2;

  const [selectedRecipeIds, setSelectedRecipeIds] = useState<Set<string>>(() => new Set());
  const [servingsByRecipeId, setServingsByRecipeId] = useState<Record<string, string>>({});
  const [hasManualQuantities, setHasManualQuantities] = useState(false);

  const [occasion, setOccasion] = useState<Occasion>("relaxed");
  const [customOccasionName, setCustomOccasionName] = useState("");
  const [guestCountInput, setGuestCountInput] = useState("");
  const [drinksPerGuestInput, setDrinksPerGuestInput] = useState("2");

  const guestCount = useMemo(() => {
    const n = parseNonNegativeInt(guestCountInput);
    return n && n > 0 ? n : null;
  }, [guestCountInput]);

  const drinksPerGuest = useMemo(() => {
    const n = parseNonNegativeInt(drinksPerGuestInput);
    return n && n > 0 ? n : 2;
  }, [drinksPerGuestInput]);

  const [orderList, setOrderList] = useState<IngredientTotal[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);

  const [eventDate, setEventDate] = useState("");
  const [eventName, setEventName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [phoneCountryIso2, setPhoneCountryIso2] = useState<keyof typeof countries>("AU");
  const [phoneLocal, setPhoneLocal] = useState("");
  const [notes, setNotes] = useState("");

  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [guestError, setGuestError] = useState<string | null>(null);

  const minDate = useMemo(() => todayIsoDate(), []);

  // Seed + cached recipes immediately; refresh from API when online.
  useEffect(() => {
    const cached = loadCachedRecipes();
    const seed = (recipesSeed as unknown as RecipesPayload).recipes ?? [];
    const initial = cached?.recipes?.length ? cached.recipes : seed;
    setRecipes([...initial].sort((a, b) => a.name.localeCompare(b.name)));
    setDrafts(loadDrafts());

    const refresh = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/recipes`, { cache: "no-store" });
        if (!res.ok) return;
        const payload = (await res.json()) as RecipesPayload;
        if (!payload?.recipes?.length) return;
        saveCachedRecipes(payload);
        setRecipes([...payload.recipes].sort((a, b) => a.name.localeCompare(b.name)));
      } catch {
        // Ignore.
      }
    };

    if (typeof navigator !== "undefined" && navigator.onLine) refresh();
  }, []);

  const selectedRecipes = useMemo(() => {
    return recipes.filter((r) => selectedRecipeIds.has(r.id));
  }, [recipes, selectedRecipeIds]);

  // Edge-swipe navigation:
  // - swipe right from the left edge: previous step
  // - swipe left from the right edge: next step (when available)
  useEffect(() => {
    const start: {
      x: number;
      y: number;
      t: number;
      zone: "left" | "right" | null;
      active: boolean;
    } = { x: 0, y: 0, t: 0, zone: null, active: false };

    const onTouchStart = (e: TouchEvent) => {
      if (!e.touches || e.touches.length !== 1) return;
      if (isEditableTarget(e.target)) return;

      const touch = e.touches[0]!;
      const x = touch.clientX;
      const y = touch.clientY;
      const w = window.innerWidth || 0;
      const edge = edgeSwipeThresholdPx();
      const zone = x <= edge ? "left" : w > 0 && x >= w - edge ? "right" : null;
      start.x = x;
      start.y = y;
      start.t = Date.now();
      start.zone = zone;
      start.active = Boolean(zone);
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!start.active || !start.zone) return;
      start.active = false;
      if (!e.changedTouches || e.changedTouches.length !== 1) return;

      const touch = e.changedTouches[0]!;
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      const dt = Math.max(1, Date.now() - start.t);

      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      const velocity = absX / dt;
      const passes =
        absX >= 90 && absX >= absY * 1.6 && (velocity >= 0.35 || absX >= 140);
      if (!passes) return;

      if (start.zone === "left" && dx > 0) {
        if (step === "quantity") setStep("select");
        else if (step === "order") setStep("quantity");
        return;
      }

      if (start.zone === "right" && dx < 0) {
        if (step === "select" && selectedRecipeIds.size > 0) {
          setStep("quantity");
          return;
        }
        if (step === "quantity") {
          const hasAny = selectedRecipes.some((r) => {
            const n = parseNonNegativeInt(servingsByRecipeId[r.id] ?? "0");
            return (n ?? 0) > 0;
          });
          if (hasAny) setStep("order");
        }
      }
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [step, selectedRecipeIds, selectedRecipes, servingsByRecipeId]);

  const totalDrinks = useMemo(() => {
    let sum = 0;
    for (const r of selectedRecipes) {
      const n = parseNonNegativeInt(servingsByRecipeId[r.id] ?? "0");
      if (n !== null) sum += n;
    }
    return sum;
  }, [selectedRecipes, servingsByRecipeId]);

  // When entering quantity step: set suggested defaults unless user already typed.
  useEffect(() => {
    if (step !== "quantity") return;
    if (hasManualQuantities) return;
    if (!guestCount) return;
    if (selectedRecipes.length === 0) return;

    const total = guestCount * drinksPerGuest;
    const per = Math.ceil(total / selectedRecipes.length);
    const next: Record<string, string> = { ...servingsByRecipeId };
    for (const r of selectedRecipes) next[r.id] = String(per);
    setServingsByRecipeId(next);
  }, [step, guestCount, drinksPerGuest, selectedRecipes, hasManualQuantities]);

  // Compute order list when moving to order step.
  useEffect(() => {
    if (step !== "order") return;

    const items: Array<{
      ingredientId: string;
      name: string;
      type: any;
      amountPerServing: number;
      servings: number;
      unit?: string | null;
      bottleSizeMl?: number | null;
    }> = [];

    for (const recipe of selectedRecipes) {
      const servings = parseNonNegativeInt(servingsByRecipeId[recipe.id] ?? "0") ?? 0;
      if (servings <= 0) continue;

      for (const ri of recipe.recipe_ingredients ?? []) {
        const ing = normalizeIngredient(ri.ingredients);
        if (!ing) continue;
        items.push({
          ingredientId: ing.id,
          name: ing.name,
          type: ing.type,
          amountPerServing: Number(ri.ml_per_serving) || 0,
          servings,
          unit: ing.unit,
          bottleSizeMl: ing.bottle_size_ml,
        });
      }
    }

    const totals = buildIngredientTotals(items).sort((a, b) => {
      const typeA = typePriority[a.type] ?? 99;
      const typeB = typePriority[b.type] ?? 99;
      if (typeA !== typeB) return typeA - typeB;
      if (a.total !== b.total) return b.total - a.total;
      return a.name.localeCompare(b.name);
    });

    setOrderList(totals);
  }, [step, selectedRecipes, servingsByRecipeId]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, [step]);

  const toggleRecipe = (id: string) => {
    setSelectedRecipeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        const copy = { ...servingsByRecipeId };
        delete copy[id];
        setServingsByRecipeId(copy);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const validateEmail = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return "Email is required.";
    // basic check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return "Please enter a valid email address.";
    return null;
  };

  const combinedPhone = useMemo(() => {
    const iso2 = String(phoneCountryIso2 || "AU").toUpperCase();
    const parsed = parsePhoneNumberFromString(phoneLocal, iso2 as any);
    return parsed?.isValid() ? parsed.number : null;
  }, [phoneCountryIso2, phoneLocal]);

  const validatePhone = () => {
    if (!phoneLocal.trim()) return "Telephone number is required.";
    if (!combinedPhone) return "Please enter a valid telephone number for the selected country.";
    return null;
  };

  const validateGuestCount = () => {
    const n = parseNonNegativeInt(guestCountInput);
    if (!n || n <= 0) return "Please enter the number of guests.";
    return null;
  };

  const handleProceedToQuantity = () => {
    setError(null);
    if (selectedRecipeIds.size === 0) {
      setError("Select at least one cocktail to continue.");
      return;
    }
    setStep("quantity");
  };

  const handleProceedToOrder = () => {
    setError(null);
    // Make sure we have at least one positive quantity
    const hasAny = selectedRecipes.some((r) => {
      const n = parseNonNegativeInt(servingsByRecipeId[r.id] ?? "0");
      return (n ?? 0) > 0;
    });
    if (!hasAny) {
      setError("Enter a quantity for at least one selected cocktail.");
      return;
    }
    setStep("order");
  };

  const handleSend = async () => {
    setSending(true);
    setSuccess(null);
    setError(null);
    setEmailError(null);
    setPhoneError(null);
    setGuestError(null);

    try {
      if (eventDate && eventDate < minDate) {
        setError("Date of Event must be today or in the future.");
        return;
      }

      const guestsMessage = validateGuestCount();
      if (guestsMessage) {
        setGuestError(guestsMessage);
        setError("Please fix the highlighted fields.");
        return;
      }

      const emailMessage = validateEmail(clientEmail);
      if (emailMessage) {
        setEmailError(emailMessage);
        setError("Please fix the highlighted fields.");
        return;
      }

      const phoneMessage = validatePhone();
      if (phoneMessage) {
        setPhoneError(phoneMessage);
        setError("Please fix the highlighted fields.");
        return;
      }

      const cocktails = selectedRecipes
        .map((r) => {
          const n = parseNonNegativeInt(servingsByRecipeId[r.id] ?? "0") ?? 0;
          return {
            recipeId: r.id,
            recipeName: normalizeCocktailDisplayName(r.name),
            servings: n,
          };
        })
        .filter((c) => c.servings > 0);

      const payload = {
        title: eventName.trim() ? eventName.trim() : "Cocktail booking request",
        eventDate,
        notes: notes.trim(),
        clientEmail: clientEmail.trim(),
        guestCount: Number(guestCountInput),
        clientPhone: combinedPhone!,
        submit: true as const,
        cocktails,
      };

      if (typeof navigator !== "undefined" && !navigator.onLine) {
        saveDraft(payload);
        setDrafts(loadDrafts());
        setSuccess(
          "You’re offline. We saved your booking request on this device. When you’re back online, send it from Saved drafts.",
        );
        return;
      }

      const res = await fetch(`${API_BASE}/api/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || `Unable to send request (HTTP ${res.status}).`);
        return;
      }

      const emailConfigured = Boolean(data?.email?.configured);
      const adminOk = Boolean(data?.email?.admin?.ok);
      const clientOk = Boolean(data?.email?.client?.ok);
      const adminErr = String(data?.email?.admin?.error || "").trim();
      const clientErr = String(data?.email?.client?.error || "").trim();

      if (!emailConfigured) {
        setSuccess(
          "Request submitted. Email sending is not configured yet, but your request has been saved.",
        );
      } else if (adminOk && clientOk) {
        setSuccess("Request submitted. Confirmation email sent.");
      } else if (adminOk && !clientOk) {
        setSuccess(
          `Request submitted. We couldn’t send the confirmation email (${clientErr || "email failed"}).`,
        );
      } else if (!adminOk && clientOk) {
        setSuccess(
          `Request submitted. (Admin notification email failed: ${adminErr || "email failed"}, but client confirmation was sent.)`,
        );
      } else {
        setSuccess(
          `Request submitted. Emails failed to send (${adminErr || clientErr || "email failed"}).`,
        );
      }
    } catch (e: any) {
      setError(e?.message || "Something went wrong.");
    } finally {
      setSending(false);
    }
  };

  const sendDraft = async (draft: Draft) => {
    setSending(true);
    setSuccess(null);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft.payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || `Unable to send request (HTTP ${res.status}).`);
        return;
      }
      removeDraft(draft.id);
      setDrafts(loadDrafts());
      setSuccess("Saved draft sent successfully.");
    } catch (e: any) {
      setError(e?.message || "Unable to send draft.");
    } finally {
      setSending(false);
    }
  };

  const handlePrintOrderList = () => {
    try {
      if (typeof window === "undefined" || typeof window.print !== "function") {
        setError("Printing isn’t available on this device.");
        return;
      }
      window.print();
    } catch {
      setError("Unable to print on this device.");
    }
  };

  const occasionLabel = (value: Occasion) => {
    switch (value) {
      case "relaxed":
        return "Relaxed get together";
      case "cocktail":
        return "Cocktail party";
      case "wedding":
        return "Wedding / formal event";
      case "big-night":
        return "Big night";
      case "custom":
        return "Custom";
      default:
        return "Relaxed get together";
    }
  };

  const suggestedLine = useMemo(() => {
    const per = drinksPerGuestForOccasion(occasion);
    if (per) return `Suggested starting point: ${per} cocktails total per guest`;
    return "You choose how many cocktails total per guest!";
  }, [occasion]);

  // If occasion isn't custom, lock drinks-per-guest to preset.
  useEffect(() => {
    const per = drinksPerGuestForOccasion(occasion);
    if (per) setDrinksPerGuestInput(String(per));
  }, [occasion]);

  const priorityCountries: Array<keyof typeof countries> = [
    "AU",
    "NZ",
    "JP",
    "GB",
    "US",
    "NL",
    "CH",
  ];
  const allCountries = Object.keys(countries) as Array<keyof typeof countries>;
  const phoneCountryOptions = [
    ...priorityCountries,
    ...allCountries.filter((c) => !priorityCountries.includes(c)),
  ];

  const pageProps = (index: number) => ({
    "aria-hidden": stepIndex !== index,
    style: { pointerEvents: stepIndex === index ? ("auto" as const) : ("none" as const) },
  });

  return (
    <div className="shell">
      <div className="container">
        <div className="header">
          <div className="brandLine">
            <a className="brandLink" href="https://www.getinvolved.com.au" target="_blank" rel="noreferrer">
              Get Involved! Catering
            </a>
            <span className="brandSmall">with our</span>
          </div>
        </div>

        <h1 className="title">Cocktail Party Planner</h1>

        {step !== "order" ? (
          <>
            {error ? <div className="toast">{error}</div> : null}
            {success ? <div className="toast">{success}</div> : null}
          </>
        ) : null}

        <div className="pagerOuter">
          <div className="pager" style={{ transform: `translateX(-${stepIndex * 100}%)` }}>
            <div className="page" {...pageProps(0)}>
              <div className="card">
                <div className="muted">Select cocktails (tap to add).</div>
                <div style={{ height: 10 }} />
                <div className="grid">
                  {recipes.map((r) => {
                    const selected = selectedRecipeIds.has(r.id);
                    const img = resolveCocktailImageSrc((r as any).image_url ?? null, r.name);
                    return (
                      <div
                        key={r.id}
                        className={`tile ${selected ? "tileSelected" : ""}`}
                        onClick={() => toggleRecipe(r.id)}
                        role="button"
                        aria-label={`Toggle ${r.name}`}
                      >
                        <div className="tileTop">
                          <div className="tileName">{normalizeCocktailDisplayName(r.name)}</div>
                          <div className={`pill ${selected ? "pillSelected" : ""}`}>
                            {selected ? "Selected" : "Tap"}
                          </div>
                        </div>
                        <div className="tileImgWrap">
                          <img className="tileImg" src={img} alt={r.name} loading="lazy" />
                        </div>
                        <div className="tapHint">{selected ? "Tap to remove" : "Tap to add"}</div>
                      </div>
                    );
                  })}
                </div>
                <div className="actions">
                  <button className="btn btnPrimary" onClick={handleProceedToQuantity}>
                    Set Quantities
                  </button>
                </div>
              </div>
            </div>

            <div className="page" {...pageProps(1)}>
              <div className="card">
                <div className="muted">Set the quantity for each selected cocktail.</div>

                <label className="label">Occasion</label>
                <select
                  className="select"
                  value={occasion}
                  onChange={(e) => {
                    setOccasion(e.target.value as Occasion);
                  }}
                >
                  <option value="relaxed">{occasionLabel("relaxed")}</option>
                  <option value="cocktail">{occasionLabel("cocktail")}</option>
                  <option value="wedding">{occasionLabel("wedding")}</option>
                  <option value="big-night">{occasionLabel("big-night")}</option>
                  <option value="custom">{occasionLabel("custom")}</option>
                </select>

                {occasion === "custom" ? (
                  <>
                    <label className="label">Custom occasion</label>
                    <input
                      className="input"
                      value={customOccasionName}
                      onChange={(e) => setCustomOccasionName(e.target.value)}
                      placeholder="e.g. Office party"
                      inputMode="text"
                    />
                    <label className="label">Cocktails total per guest</label>
                    <input
                      className="input"
                      value={drinksPerGuestInput}
                      onChange={(e) => setDrinksPerGuestInput(e.target.value)}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="2"
                    />
                  </>
                ) : null}

                <label className="label">Number of guests</label>
                <input
                  className="input"
                  value={guestCountInput}
                  onChange={(e) => setGuestCountInput(e.target.value)}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="25"
                />

                <div style={{ height: 10 }} />
                <div className="muted">{suggestedLine.replace("total", "total")}</div>

                <ul className="list">
                  {selectedRecipes.map((r) => {
                    const img = resolveCocktailImageSrc((r as any).image_url ?? null, r.name);
                    const value = servingsByRecipeId[r.id] ?? "";
                    const perGuest =
                      guestCount && parseNonNegativeInt(value) !== null
                        ? (Number(value) / guestCount).toFixed(2)
                        : null;
                    return (
                      <li key={r.id} className="listItem" style={{ borderTopStyle: "solid" }}>
                        <div className="listLeft">
                          <div className="row">
                            <img src={img} alt="" style={{ width: 26, height: 26, objectFit: "contain" }} />
                            <div className="listName">{normalizeCocktailDisplayName(r.name)}</div>
                          </div>
                          <div className="listMeta">{perGuest ? `${perGuest} per guest` : " "}</div>
                        </div>
                        <div style={{ width: 120 }}>
                          <input
                            className="input"
                            value={value}
                            onChange={(e) => {
                              setHasManualQuantities(true);
                              setServingsByRecipeId((prev) => ({ ...prev, [r.id]: e.target.value }));
                            }}
                            inputMode="numeric"
                            pattern="[0-9]*"
                            placeholder="0"
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>

                <div className="actions">
                  <button className="btn" onClick={() => setStep("select")}>
                    Back
                  </button>
                  <div style={{ flex: 1 }} />
                  <div style={{ textAlign: "right" }}>
                    <div className="muted">Number of guests: {guestCount ?? "-"}</div>
                    <div className="muted">Number of drinks: {totalDrinks}</div>
                  </div>
                  <button className="btn btnPrimary" onClick={handleProceedToOrder} style={{ marginTop: 10 }}>
                    Create Order List
                  </button>
                </div>
              </div>
            </div>

            <div className="page" {...pageProps(2)}>
              <div className="printOnly">
                <div className="card">
                  <div className="muted">
                    Brought to you by GET INVOLVED! Catering - The Connoisseurs of Cocktail Catering
                  </div>
                  <div style={{ height: 10 }} />
                  <div className="listName">Order List</div>
                  <div className="muted">Totals include a 10% buffer. Liquor is rounded to 700ml bottles.</div>

                  <div style={{ height: 14 }} />
                  <div className="summaryLine">
                    <div>
                      <div className="summaryK">Total drinks</div>
                      <div className="summaryV">{totalDrinks}</div>
                    </div>
                    <div>
                      <div className="summaryK">Total guests</div>
                      <div className="summaryV">{guestCount ?? "-"}</div>
                    </div>
                  </div>

                  <div style={{ height: 14 }} />
                  <div className="summaryK">Cocktails</div>
                  <ul className="list">
                    {selectedRecipes
                      .map((r) => ({
                        name: normalizeCocktailDisplayName(r.name),
                        servings: parseNonNegativeInt(servingsByRecipeId[r.id] ?? "0") ?? 0,
                      }))
                      .filter((c) => c.servings > 0)
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((c) => (
                        <li key={c.name} className="listItem">
                          <div className="listLeft">
                            <div className="listName">{c.name}</div>
                          </div>
                          <div className="listRight">{c.servings}</div>
                        </li>
                      ))}
                  </ul>

                  <div style={{ height: 14 }} />
                  <div className="summaryK">Shopping list</div>
                  <ul className="list">
                    {orderList.map((t) => (
                      <li key={t.ingredientId} className="listItem">
                        <div className="listLeft">
                          <div className="listName">{t.name}</div>
                          <div className="listMeta">{t.type}</div>
                        </div>
                        <div className="listRight">
                          {t.type === "liquor"
                            ? `${t.bottlesNeeded ?? 0} × ${t.bottleSizeMl ?? 700}ml`
                            : `${t.total} ${t.unit}`}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="noPrint">
                <div className="card">
                  <div className="muted">Order list (includes 10% buffer).</div>

                  <div className="summaryLine">
                    <div>
                      <div className="summaryK">Total drinks</div>
                      <div className="summaryV">{totalDrinks}</div>
                    </div>
                    <div>
                      <div className="summaryK">Total guests</div>
                      <div className="summaryV">{guestCount ?? "-"}</div>
                      <div className="muted">
                        {guestCount && drinksPerGuest ? `${drinksPerGuest} cocktails total per guest` : ""}
                      </div>
                    </div>
                  </div>

                  <div className="buttonRow">
                    <button className="btn" type="button" onClick={handlePrintOrderList}>
                      Print order list
                    </button>
                    <button
                      className="btn btnPrimary"
                      type="button"
                      onClick={() =>
                        bookingRef.current?.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        })
                      }
                    >
                      Book Bartenders
                    </button>
                  </div>

                  <ul className="list">
                    {orderList.map((t) => {
                      const right =
                        t.type === "liquor"
                          ? `${t.bottlesNeeded ?? 0} × ${t.bottleSizeMl ?? 700}ml`
                          : `${t.total} ${t.unit}`;
                      const meta =
                        t.type === "liquor" ? `${Math.ceil(t.total)} ml total` : `${t.type}`;
                      return (
                        <li key={t.ingredientId} className="listItem">
                          <div className="listLeft">
                            <div className="listName">{t.name}</div>
                            <div className="listMeta">{meta}</div>
                          </div>
                          <div className="listRight">{right}</div>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                <div ref={bookingRef} className="card bookHeader">
                  <h2 className="bookTitle">Book Bartenders for your Event</h2>
                  {success ? <div className="toast">{success}</div> : null}
                  {error ? <div className="toast">{error}</div> : null}

                  <label className="label">Date of Event</label>
                  <input
                    className="input"
                    type="date"
                    value={eventDate}
                    min={minDate}
                    onChange={(e) => setEventDate(e.target.value)}
                  />

                  <label className="label">Event name</label>
                  <input
                    className="input"
                    value={eventName}
                    onChange={(e) => setEventName(e.target.value)}
                    placeholder="Cocktail party"
                    inputMode="text"
                  />

                  <label className="label">Email</label>
                  <input
                    className={`input ${emailError ? "inputError" : ""}`}
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    placeholder="you@example.com"
                    inputMode="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                  />
                  {emailError ? <div className="errorText">{emailError}</div> : null}

                  <label className="label">Telephone</label>
                  <div className="row">
                    <select
                      className="select"
                      value={phoneCountryIso2}
                      onChange={(e) => setPhoneCountryIso2(e.target.value as any)}
                      style={{ width: 120, flex: "0 0 auto" }}
                    >
                      {phoneCountryOptions.map((iso2) => (
                        <option key={iso2} value={iso2}>
                          {flagEmoji(iso2)} {iso2}
                        </option>
                      ))}
                    </select>
                    <input
                      className={`input ${phoneError ? "inputError" : ""}`}
                      value={phoneLocal}
                      onChange={(e) => setPhoneLocal(e.target.value)}
                      placeholder="0412 345 678"
                      inputMode="tel"
                      autoCorrect="off"
                    />
                  </div>
                  {phoneError ? <div className="errorText">{phoneError}</div> : null}

                  <label className="label">Number of guests</label>
                  <input
                    className={`input ${guestError ? "inputError" : ""}`}
                    value={guestCountInput}
                    onChange={(e) => setGuestCountInput(e.target.value)}
                    inputMode="numeric"
                    pattern="[0-9]*"
                  />
                  {guestError ? <div className="errorText">{guestError}</div> : null}

                  <label className="label">Message</label>
                  <textarea
                    className="textarea"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={
                      "What’s the special occasion?\nEvent schedule?\nSpecial/signature cocktail requests?\nAllergies?"
                    }
                  />

                  <div className="actions">
                    <button className="btn" onClick={() => setStep("quantity")}>
                      Edit quantities
                    </button>
                    <button className="btn btnPrimary" onClick={handleSend} disabled={sending}>
                      {sending ? "Sending..." : "Book Bartenders"}
                    </button>
                  </div>

                  {drafts.length ? (
                    <>
                      <div style={{ height: 16 }} />
                      <div className="muted">Saved drafts</div>
                      <ul className="list">
                        {drafts.map((d) => (
                          <li key={d.id} className="listItem">
                            <div className="listLeft">
                              <div className="listName">{d.payload.title}</div>
                              <div className="listMeta">{new Date(d.createdAt).toLocaleString()}</div>
                            </div>
                            <div className="row" style={{ justifyContent: "flex-end" }}>
                              <button className="btn btnInlineLink" onClick={() => sendDraft(d)} disabled={sending}>
                                Send
                              </button>
                              <button
                                className="btn btnInlineLink"
                                onClick={() => {
                                  removeDraft(d.id);
                                  setDrafts(loadDrafts());
                                }}
                                disabled={sending}
                              >
                                Delete
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
