"use client";

import { useEffect, useMemo, useState } from "react";

type PrintPayload = {
  version: 1;
  createdAt?: string;
  eventName?: string;
  eventDate?: string;
  guests?: number | null;
  cocktails?: Array<{ name: string; servings: number }>;
  shopping?: Array<{ name: string; type: string; right: string }>;
};

function base64UrlDecode(input: string) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4 ? "=".repeat(4 - (normalized.length % 4)) : "";
  const b64 = normalized + pad;
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function safeParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export default function PrintPage() {
  const [payload, setPayload] = useState<PrintPayload | null>(null);

  useEffect(() => {
    const hash = String(window.location.hash || "").replace(/^#/, "").trim();
    if (!hash) return;
    const decoded = base64UrlDecode(hash);
    const parsed = safeParse<PrintPayload>(decoded);
    if (!parsed || parsed.version !== 1) return;
    setPayload(parsed);
  }, []);

  const cocktails = useMemo(() => {
    return (payload?.cocktails ?? [])
      .filter((c) => c && c.name && Number(c.servings) > 0)
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [payload]);

  const shopping = useMemo(() => {
    return (payload?.shopping ?? [])
      .filter((i) => i && i.name)
      .slice();
  }, [payload]);

  const totalDrinks = useMemo(() => {
    return cocktails.reduce((sum, c) => sum + (Number(c.servings) || 0), 0);
  }, [cocktails]);

  return (
    <div className="min-h-screen bg-white px-6 py-10 text-black print:px-0 print:py-0">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
        }
      `}</style>

      <div className="mx-auto w-full max-w-3xl">
        <div className="no-print mb-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-full border border-black/15 bg-black px-5 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-white"
          >
            Print
          </button>
          <p className="text-xs text-black/60">
            On iPhone: Share → Print
          </p>
        </div>

        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-black/70">
          Brought to you by GET INVOLVED! Catering - The Connoisseurs of Cocktail Catering
        </p>
        <h1 className="mt-2 text-2xl font-semibold">Order List</h1>
        <p className="mt-1 text-sm text-black/70">
          Totals include a 10% buffer. Items are rounded up to pack sizes where provided (for example, 700ml bottles).
        </p>

        {payload?.eventName ? (
          <p className="mt-4 text-sm">
            <span className="font-semibold">Event:</span> {payload.eventName}
          </p>
        ) : null}
        {payload?.eventDate ? (
          <p className="mt-1 text-sm">
            <span className="font-semibold">Date:</span> {payload.eventDate}
          </p>
        ) : null}
        {typeof payload?.guests === "number" ? (
          <p className="mt-1 text-sm">
            <span className="font-semibold">Guests:</span> {payload.guests}
          </p>
        ) : null}

        <h2 className="mt-8 text-sm font-semibold uppercase tracking-[0.2em] text-black/80">
          Cocktails
        </h2>
        <ul className="mt-2 space-y-1 text-sm">
          {cocktails.length ? (
            cocktails.map((c) => (
              <li key={c.name} className="flex items-baseline justify-between gap-6 border-b border-black/10 py-2">
                <span className="font-medium">{c.name}</span>
                <span className="tabular-nums font-semibold">{c.servings}</span>
              </li>
            ))
          ) : (
            <li className="text-black/60">(No cocktails provided)</li>
          )}
        </ul>

        <h2 className="mt-8 text-sm font-semibold uppercase tracking-[0.2em] text-black/80">
          Shopping list
        </h2>
        <ul className="mt-2 space-y-1 text-sm">
          {shopping.length ? (
            shopping.map((i) => (
              <li
                key={`${i.type}:${i.name}`}
                className="flex items-baseline justify-between gap-6 border-b border-black/10 py-2"
              >
                <span>
                  <span className="font-medium">{i.name}</span>{" "}
                  <span className="text-black/60">({i.type})</span>
                </span>
                <span className="tabular-nums font-semibold">{i.right}</span>
              </li>
            ))
          ) : (
            <li className="text-black/60">(No items provided)</li>
          )}
        </ul>

        <p className="mt-8 text-xs text-black/60">
          Total drinks: {totalDrinks}
        </p>
      </div>
    </div>
  );
}
