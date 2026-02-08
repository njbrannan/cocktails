"use client";

import type { IngredientTotal } from "@/lib/inventoryMath";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type StoredCocktail = {
  recipeId: string;
  recipeName: string;
  servings: number;
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

export default function RequestOrderPage() {
  const router = useRouter();
  const [stored, setStored] = useState<StoredOrder | null>(null);

  const [eventDate, setEventDate] = useState("");
  const [notes, setNotes] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editLink, setEditLink] = useState<string | null>(null);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });

    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as StoredOrder;
      if (parsed?.version !== 1) return;
      setStored(parsed);
    } catch {
      // Ignore parse errors; user can go back and recreate.
    }
  }, []);

  const cocktailsSummary = useMemo(() => {
    const list = stored?.cocktails ?? [];
    const filtered = list.filter((c) => Number(c.servings) > 0);
    return [...filtered].sort((a, b) => a.recipeName.localeCompare(b.recipeName));
  }, [stored]);

  const guestCount = useMemo(() => {
    return cocktailsSummary.reduce((sum, c) => sum + (Number(c.servings) || 0), 0);
  }, [cocktailsSummary]);

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
      if (!clientEmail) {
        setError("Please enter your email.");
        return;
      }

      const response = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Cocktail booking request",
          eventDate,
          notes,
          clientEmail,
          clientPhone,
          submit: true,
          cocktails: cocktailsSummary.map((c) => ({
            recipeId: c.recipeId,
            recipeName: c.recipeName,
            servings: c.servings,
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
              Book bartenders
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
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#6a2e2a]">
            Book bartenders
          </p>
          <h1 className="font-display text-4xl text-[#151210]">Order list</h1>
          <p className="mt-2 text-sm text-[#4b3f3a]">
            Totals include a 10% buffer. Liquor is rounded to 700ml bottles.
          </p>
        </header>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {success ? <p className="text-sm text-[#4b3f3a]">{success}</p> : null}

        <div className="glass-panel rounded-[28px] px-8 py-6">
          <h2 className="font-display text-2xl text-[#6a2e2a]">
            Selected cocktails
          </h2>
          <p className="mt-2 text-sm text-[#4b3f3a]">
            {guestCount > 0 ? `Total drinks: ${guestCount}` : "No quantities set yet."}
          </p>

          <div className="mt-5 grid gap-3">
            {cocktailsSummary.map((c) => (
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
                  <p className="text-sm font-semibold text-[#151210]">
                    {c.servings}
                  </p>
                  <p className="text-xs text-[#4b3f3a]">Quantity</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap gap-4">
            <button
              type="button"
              onClick={handleBack}
              className="rounded-full border border-[#6a2e2a]/30 bg-white/70 px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-[#6a2e2a] hover:-translate-y-0.5"
            >
              Back to quantities
            </button>
          </div>
        </div>

        <div className="glass-panel rounded-[28px] px-8 py-6">
          <h2 className="font-display text-2xl text-[#6a2e2a]">Order list</h2>

          <div className="mt-6 grid gap-3">
            {(stored.orderList ?? []).map((item) => (
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

          <div className="mt-8 rounded-[28px] border border-[#c47b4a]/20 bg-white/70 p-6">
            <h3 className="font-display text-xl text-[#151210]">
              Order bartenders
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
                  className="mt-2 w-full rounded-2xl border border-[#c47b4a]/30 bg-white/80 px-4 py-3 text-sm"
                />
              </label>
              <input
                type="email"
                value={clientEmail}
                onChange={(event) => setClientEmail(event.target.value)}
                placeholder="Your email"
                className="rounded-2xl border border-[#c47b4a]/30 bg-white/80 px-4 py-3 text-sm"
              />
              <input
                type="tel"
                value={clientPhone}
                onChange={(event) => setClientPhone(event.target.value)}
                placeholder="Telephone number"
                className="rounded-2xl border border-[#c47b4a]/30 bg-white/80 px-4 py-3 text-sm"
              />
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Notes (venue, timing, dietary requests...)"
                className="min-h-[120px] rounded-2xl border border-[#c47b4a]/30 bg-white/80 px-4 py-3 text-sm md:col-span-2"
              />
            </div>

            <button
              onClick={handleOrderBartenders}
              disabled={loading}
              className="mt-4 rounded-full bg-[#c47b4a] px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-white shadow-lg shadow-[#c47b4a]/30 hover:-translate-y-0.5 disabled:opacity-60"
            >
              {loading ? "Sending request..." : "Order Bartenders"}
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
