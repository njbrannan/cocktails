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

function MartiniMark(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
      className={props.className || "h-8 w-8"}
      fill="none"
    >
      <path
        d="M12 14h40c0 10-10 19-20 23-10-4-20-13-20-23Z"
        fill="#2f6f55"
      />
      <path d="M32 37v15" stroke="#2f6f55" strokeWidth="4" strokeLinecap="round" />
      <path d="M22 56h20" stroke="#2f6f55" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

function LeafCorner(props: { className?: string; flipX?: boolean }) {
  return (
    <svg
      viewBox="0 0 120 120"
      aria-hidden="true"
      className={props.className || "h-10 w-10"}
      style={props.flipX ? { transform: "scaleX(-1)" } : undefined}
      fill="none"
    >
      <path
        d="M18 102c28-4 44-18 54-42 5-12 7-25 9-42 18 18 30 40 28 62-2 20-18 34-36 36-19 3-40-5-55-14Z"
        fill="#2f6f55"
        opacity="0.22"
      />
      <path
        d="M20 102c22-18 36-36 46-62"
        stroke="#2f6f55"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.55"
      />
      <path
        d="M38 86c8-3 15-7 20-12M46 68c8-4 15-9 21-16"
        stroke="#0c2f5e"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.25"
      />
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
          border-radius: 10mm;
          /* Keep print-friendly: light paper tone with very subtle texture (low ink). */
          background:
            radial-gradient(10px 10px at 10% 20%, rgba(0, 0, 0, 0.028), transparent 62%),
            radial-gradient(10px 10px at 70% 35%, rgba(0, 0, 0, 0.022), transparent 62%),
            radial-gradient(10px 10px at 40% 80%, rgba(0, 0, 0, 0.020), transparent 62%),
            linear-gradient(180deg, #fbf5e6 0%, #f7efd9 100%);
          box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.10);
        }

        .menu-title {
          font-family: ui-serif, Georgia, Cambria, "Times New Roman", Times, serif;
          letter-spacing: 0.12em;
        }

        .menu-subtitle {
          letter-spacing: 0.22em;
        }

        .menu-hero {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8mm;
          align-items: end;
          margin-top: 8mm;
        }

        .menu-hero-img {
          width: 34mm;
          height: 34mm;
          object-fit: contain;
          filter: drop-shadow(0 8px 10px rgba(0, 0, 0, 0.10));
        }

        .menu-list {
          display: grid;
          grid-template-columns: 1fr;
          gap: 5mm;
          margin-top: 10mm;
        }

        .menu-item-name {
          font-family: ui-serif, Georgia, Cambria, "Times New Roman", Times, serif;
          color: #0c2f5e;
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
          -webkit-line-clamp: 1;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .menu-accent {
          color: #2f6f55;
        }

        .menu-ornament {
          position: absolute;
          inset: 0;
          pointer-events: none;
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
                <div className="menu-ornament">
                  <div className="absolute left-[8mm] top-[8mm] opacity-80">
                    <LeafCorner className="h-12 w-12" />
                  </div>
                  <div className="absolute bottom-[8mm] right-[8mm] opacity-80">
                    <LeafCorner className="h-12 w-12" flipX />
                  </div>
                </div>
                <header className="text-center">
                  <div className="flex items-center justify-center gap-4">
                    <span className="menu-title text-[40px] font-extrabold text-[#0c2f5e]">
                      COCKTAIL
                    </span>
                    <MartiniMark className="h-11 w-11" />
                    <span className="menu-title text-[40px] font-extrabold text-[#0c2f5e]">
                      MENU
                    </span>
                  </div>
                  <p className="menu-subtitle mt-3 text-[10px] font-semibold uppercase text-[#2f6f55]">
                    — Speciality drinks for your event —
                  </p>
                  <p className="mt-3 text-[16px] font-semibold text-black/80">
                    {payload.title}
                  </p>
                </header>

                <div className="menu-hero">
                  {cocktails.slice(0, 3).map((c) => {
                    const displayName = normalizeCocktailDisplayName(c.name);
                    const src = resolveCocktailImageSrc(null, displayName);
                    return (
                      <div key={`hero-${c.recipeId}`} className="grid place-items-center">
                        <img
                          src={src}
                          alt={displayName}
                          className="menu-hero-img"
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
                    );
                  })}
                </div>

                <div className="menu-list">
                  {cocktails.map((c) => {
                    const displayName = normalizeCocktailDisplayName(c.name);
                    return (
                      <article key={c.recipeId} className="min-w-0">
                        <div className="flex items-start gap-4">
                          <div className="mt-0.5 grid h-10 w-10 place-items-center">
                            <img
                              src={resolveCocktailImageSrc(null, displayName)}
                              alt=""
                              aria-hidden="true"
                              className="h-10 w-10 object-contain"
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
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-2">
                              <span className="menu-accent text-[18px] leading-none">•</span>
                              <h2 className="menu-item-name truncate text-[18px] font-bold">
                                {displayName}
                              </h2>
                            </div>
                            <p className="menu-card-desc mt-1 text-[12.5px] leading-snug text-black/65">
                              {c.description || " "}
                            </p>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>

                <p className="mt-6 text-center text-[12px] font-semibold italic text-[#2f6f55]/90">
                  * non-alcoholic options available *
                </p>
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
