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

function ScissorsIcon(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={props.className || "h-4 w-4"}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 4l7.5 7.5" />
      <path d="M4 20l7.5-7.5" />
      <path d="M12 12l8 8" />
      <path d="M12 12l8-8" />
      <circle cx="5.5" cy="6" r="2.2" />
      <circle cx="5.5" cy="18" r="2.2" />
    </svg>
  );
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
    // 6 cocktails per A5 panel. Two A5 panels per A4 sheet (cut in half).
    const panels = chunk(list, 6);
    return chunk(panels, 2);
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
          size: A4 portrait;
          margin: 0;
        }
        @media print {
          .menu-controls {
            display: none !important;
          }
          html,
          body {
            background: #fff !important;
          }
        }

        .menu-sheet {
          width: 210mm;
          height: 297mm;
          break-after: page;
          page-break-after: always;
        }
        .menu-sheet:last-of-type {
          break-after: auto;
          page-break-after: auto;
        }

        /* Each half of A4 is an A5 landscape (210mm × 148.5mm). */
        .menu-panel {
          position: relative;
          width: 210mm;
          height: 148.5mm;
          overflow: hidden;
        }

        /* We render the menu "portrait A5" (148mm × 210mm) rotated 90deg so it prints sideways on each half. */
        .menu-panel-inner {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 148mm;
          height: 210mm;
          transform: translate(-50%, -50%) rotate(90deg);
          transform-origin: center;
          padding: 10mm;
          box-sizing: border-box;
        }

        .menu-cut {
          position: relative;
          width: 210mm;
          height: 0;
          border-top: 1px dashed rgba(0, 0, 0, 0.35);
        }
        .menu-cut-label {
          position: absolute;
          left: 50%;
          top: 0;
          transform: translate(-50%, -50%);
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 2px 10px;
          background: #fff;
          color: rgba(0, 0, 0, 0.7);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .menu-card-desc {
          display: -webkit-box;
          -webkit-line-clamp: 2;
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

      {pages.map((panels, sheetIndex) => (
        <section key={`sheet-${sheetIndex}`} className="menu-sheet">
          {panels.map((cocktails, panelIndex) => (
            <div key={`panel-${sheetIndex}-${panelIndex}`} className="menu-panel">
              <div className="menu-panel-inner">
                <header className="pb-4">
                  <h1 className="text-[28px] font-semibold leading-tight text-black">
                    {payload.title}
                  </h1>
                  <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-black/60">
                    Cocktail menu
                  </p>
                </header>

                <div className="grid grid-cols-1 gap-3">
                  {cocktails.map((c) => {
                    const displayName = normalizeCocktailDisplayName(c.name);
                    const src = resolveCocktailImageSrc(null, displayName);
                    return (
                      <article key={c.recipeId} className="flex items-start gap-3">
                        <div className="shrink-0">
                          <div className="h-[44px] w-[44px] overflow-hidden rounded-xl bg-transparent p-0">
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
                        <div className="min-w-0">
                          <h2 className="truncate text-[13px] font-semibold leading-snug text-black">
                            {displayName}
                          </h2>
                          <p className="menu-card-desc mt-1 text-[11px] leading-snug text-black/65">
                            {c.description || " "}
                          </p>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}

          {/* Cut line between top and bottom panels */}
          <div className="menu-cut">
            <div className="menu-cut-label">
              <ScissorsIcon className="h-4 w-4" />
              Cut here
              <ScissorsIcon className="h-4 w-4" />
            </div>
          </div>

          {/* Ensure there are always 2 panels per sheet (blank bottom if needed) */}
          {panels.length < 2 ? (
            <div className="menu-panel">
              <div className="menu-panel-inner" />
            </div>
          ) : null}
        </section>
      ))}
    </div>
  );
}
