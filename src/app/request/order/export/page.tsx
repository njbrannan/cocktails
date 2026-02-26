"use client";

import { useEffect, useMemo, useState } from "react";

type ExportItem = {
  url: string;
  count: number;
  sku?: string | null;
  desiredValue?: string | null;
};

function base64UrlToBase64(s: string) {
  s = (s || "").replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4;
  if (pad === 2) s += "==";
  else if (pad === 3) s += "=";
  return s;
}

function decodeItemsParam(itemsParam: string) {
  const b64 = base64UrlToBase64(itemsParam);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const json = new TextDecoder().decode(bytes);
  return JSON.parse(json);
}

function base64UrlEncodeUtf8(input: string) {
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

  const payload = rows
    .filter((r) => r && r.url && r.count > 0)
    .map((r) => {
      let url = String(r.url || "").trim();
      try {
        const parsed = new URL(url, originNormalized);
        const parsedHost = parsed.hostname.replace(/^www\./i, "").toLowerCase();
        if (parsedHost === originHost) url = `${parsed.pathname}${parsed.search}`;
      } catch {}
      return { url, count: r.count, sku: r.sku || null };
    });

  const encoded = base64UrlEncodeUtf8(JSON.stringify({ v: 1, items: payload }));
  return `${originNormalized}/cart-import?items=${encoded}`;
}

function Spinner() {
  return (
    <div
      aria-hidden="true"
      className="h-11 w-11 animate-spin rounded-full border-4 border-black/10 border-t-black/50"
    />
  );
}

export default function GetInvolvedCartExportPage() {
  const [status, setStatus] = useState("Preparing your cart…");
  const [error, setError] = useState<string | null>(null);

  const itemsParam = useMemo(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("items") || "";
  }, []);

  useEffect(() => {
    const run = async () => {
      if (!itemsParam) {
        setError("No items were provided.");
        return;
      }

      let payload: any = null;
      try {
        payload = decodeItemsParam(itemsParam);
      } catch {
        setError("Couldn’t read the order payload. Please re-open the export link.");
        return;
      }

      const items: ExportItem[] = Array.isArray(payload?.items) ? payload.items : [];
      if (!items.length) {
        setError("No items in payload.");
        return;
      }

      setStatus("Validating items…");

      const response = await fetch("/api/getinvolved/variant-skus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((it) => ({
            url: it.url,
            desiredValue: it.desiredValue || null,
            providedSku: it.sku || null,
          })),
        }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setError(data?.error || `Couldn’t prepare cart export (HTTP ${response.status}).`);
        return;
      }

      const resolved = items.map((it, idx) => ({
        url: it.url,
        count: Number(it.count) || 0,
        sku: data?.items?.[idx]?.sku ?? null,
      }));

      // Merge duplicates to reduce add-to-cart requests and lower the chance of 429 rate limits.
      const mergedMap = new Map<string, { url: string; count: number; sku?: string | null }>();
      for (const it of resolved) {
        if (!it.url || it.count <= 0) continue;
        const key = `${it.url}||${it.sku || ""}`;
        const existing = mergedMap.get(key);
        if (existing) existing.count += it.count;
        else mergedMap.set(key, { ...it });
      }
      const merged = Array.from(mergedMap.values());

      const totalItems = merged.reduce((sum, it) => sum + (Number(it.count) || 0), 0);
      if (totalItems > 500) {
        setError(
          "This order is too large to auto-fill into the Get Involved cart (Squarespace cart limit is 500 total items). Reduce quantities or offer larger pack sizes for kits/glassware.",
        );
        return;
      }

      setStatus("Sending items to Get Involved cart…");

      const importUrl = buildGetInvolvedCartImportUrl(merged);
      window.location.assign(importUrl);
    };

    run().catch((e: any) => {
      setError(e?.message || "Couldn’t prepare cart export.");
    });
  }, [itemsParam]);

  return (
    <div className="min-h-screen hero-grid px-6 py-16">
      <div className="mx-auto w-full max-w-xl">
        <div className="glass-panel rounded-[28px] px-8 py-10 text-center">
          <div className="mx-auto grid w-fit place-items-center">
            <Spinner />
          </div>
          <h1 className="mt-6 font-display text-3xl text-ink">
            Involved Events
          </h1>
          <p className="mt-2 text-sm text-muted">
            {error ? "Couldn’t auto-fill cart. Please add items manually." : status}
          </p>
          {error ? (
            <p className="mt-4 text-sm font-medium text-red-700">{error}</p>
          ) : null}
          <p className="mt-6 text-[12px] leading-relaxed text-ink-muted">
            Keep this tab open &mdash; we’ll redirect you to your cart automatically.
          </p>
        </div>
      </div>
    </div>
  );
}

