"use client";

import {
  COCKTAIL_PLACEHOLDER_IMAGE,
  normalizeCocktailDisplayName,
  resolveCocktailImageSrc,
  resolveSvgFallbackForImageSrc,
} from "@/lib/cocktailImages";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type PrintMenuPayload = {
  v: 1;
  title: string;
  cocktails: Array<{
    recipeId: string;
    name: string;
    description: string | null;
  }>;
};

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export default function PrintCocktailMenuPage() {
  const router = useRouter();
  const [payload, setPayload] = useState<PrintMenuPayload | null>(null);

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem("get-involved:print-menu:v1");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.v === 1 && Array.isArray(parsed.cocktails)) {
        setPayload(parsed);
      }
    } catch {
      // ignore
    }
  }, []);

  const pages = useMemo(() => {
    const list = payload?.cocktails ?? [];
    return chunk(list, 4);
  }, [payload]);

  // Auto-print once content is loaded.
  useEffect(() => {
    if (!payload) return;
    const t = window.setTimeout(() => {
      try {
        window.print();
      } catch {
        // ignore
      }
    }, 300);
    return () => window.clearTimeout(t);
  }, [payload]);

  if (!payload) {
    return (
      <div className="min-h-screen bg-white px-6 py-16">
        <div className="mx-auto w-full max-w-xl">
          <h1 className="text-2xl font-semibold text-black">Cocktail Menu</h1>
          <p className="mt-2 text-sm text-black/70">
            No menu payload found. Go back to your order list and tap “Print Cocktail Menu”.
          </p>
          <button
            type="button"
            onClick={() => router.push("/request/order")}
            className="mt-6 rounded-full bg-black px-6 py-3 text-sm font-semibold text-white"
          >
            Back to order list
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="menu-root min-h-screen bg-white">
      <style jsx global>{`
        @page {
          size: A5 portrait;
          margin: 12mm;
        }
        @media print {
          .menu-controls {
            display: none !important;
          }
          .menu-page {
            break-after: page;
            page-break-after: always;
          }
          .menu-page:last-of-type {
            break-after: auto;
            page-break-after: auto;
          }
        }
        .menu-card-desc {
          display: -webkit-box;
          -webkit-line-clamp: 4;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>

      <div className="menu-controls mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-6 py-6">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-full border border-black/15 bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-black/5"
        >
          Back
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-full bg-black px-5 py-2 text-sm font-semibold text-white"
        >
          Print
        </button>
      </div>

      {pages.map((cocktails, pageIndex) => (
        <section
          key={`page-${pageIndex}`}
          className="menu-page mx-auto w-full max-w-3xl px-6 pb-10"
        >
          <header className="pb-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-black/70">
              {payload.title}
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-black">
              Cocktail Menu
            </h1>
          </header>

          <div className="grid grid-cols-2 gap-4">
            {cocktails.map((c) => {
              const displayName = normalizeCocktailDisplayName(c.name);
              const src = resolveCocktailImageSrc(null, displayName);
              return (
                <article
                  key={c.recipeId}
                  className="rounded-2xl border border-black/10 bg-white p-4"
                >
                  <div className="flex items-center justify-center">
                    <div className="h-28 w-28 overflow-hidden rounded-2xl border border-black/10 bg-white p-2">
                      <img
                        src={src}
                        alt={displayName}
                        className="h-full w-full object-contain"
                        onError={(event) => {
                          const img = event.currentTarget;
                          const stage = Number(img.dataset.fallbackStage || "0") || 0;
                          if (stage >= 3) {
                            img.src = COCKTAIL_PLACEHOLDER_IMAGE;
                            return;
                          }
                          const current = img.getAttribute("src") || "";
                          if (stage === 0) {
                            img.dataset.fallbackStage = "1";
                            img.src = resolveSvgFallbackForImageSrc(current);
                            return;
                          }
                          img.dataset.fallbackStage = String(stage + 1);
                          img.src = COCKTAIL_PLACEHOLDER_IMAGE;
                        }}
                      />
                    </div>
                  </div>
                  <h2 className="mt-3 text-base font-semibold text-black">
                    {displayName}
                  </h2>
                  <p className="menu-card-desc mt-1 text-[12px] leading-relaxed text-black/70">
                    {c.description || " "}
                  </p>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

