import Image from "next/image";
import Link from "next/link";

const features = [
  {
    title: "Client-facing booking",
    description:
      "Clients can build their party menu, edit their request, and finalize with a single tap.",
  },
  {
    title: "Admin recipe control",
    description:
      "Manage cocktails, inventory, and serving assumptions from a clean admin workspace.",
  },
  {
    title: "Smart inventory math",
    description:
      "Auto totals ingredients, adds a 10% buffer, and rounds liquor to 700ml bottles.",
  },
];

const steps = [
  {
    title: "Create the menu",
    detail: "Pick cocktails, set servings, and personalize the experience.",
  },
  {
    title: "Confirm the event",
    detail: "Finalize the request and we handle staffing and inventory.",
  },
  {
    title: "Toast the night",
    detail: "Your bartenders arrive ready with everything on the list.",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen hero-grid">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-6 py-16 sm:px-10">
        <section className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="space-y-6 animate-float-up">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#c47b4a]/30 bg-white/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-[#6a2e2a] shadow-sm">
              On-location cocktail experiences
            </span>
            <h1 className="font-display text-4xl leading-tight text-[#151210] sm:text-5xl">
              Cocktail parties orchestrated with precision and style.
            </h1>
            <p className="max-w-xl text-base leading-7 text-[#4b3f3a] sm:text-lg">
              Get Involved blends client-facing booking with inventory intelligence. Build
              custom menus, keep recipes organized, and auto-calc everything needed for an
              unforgettable event.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link
                href="/request"
                className="rounded-full bg-[#6a2e2a] px-6 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-[#f8f1e7] shadow-lg shadow-[#c47b4a]/30 hover:-translate-y-0.5"
              >
                Book Bartenders
              </Link>
              <Link
                href="/dashboard"
                className="rounded-full border border-[#6a2e2a]/30 bg-white/70 px-6 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-[#6a2e2a] hover:-translate-y-0.5"
              >
                Preview Menu Builder
              </Link>
            </div>
            <div className="flex flex-wrap gap-6 text-sm text-[#4b3f3a]">
              <span className="inline-flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#c47b4a]"></span>
                Client login + editable requests
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#c47b4a]"></span>
                Admin recipe + inventory control
              </span>
            </div>
          </div>
          <div className="glass-panel relative overflow-hidden rounded-[32px] p-8">
            <div className="absolute inset-0 bg-gradient-to-br from-white/70 via-[#f8f1e7]/40 to-[#f2d9b1]/80 shimmer" />
            <div className="relative z-10 flex flex-col items-center gap-8 text-center">
              <Image
                src="/get-involved-logo.svg"
                alt="Get Involved - Cocktail Party Planner logo"
                width={520}
                height={180}
                priority
              />
              <div className="frosted-border rounded-3xl bg-white/70 px-6 py-4">
                <p className="text-sm uppercase tracking-[0.3em] text-[#6a2e2a]">
                  Upcoming event snapshot
                </p>
                <p className="mt-3 text-3xl font-semibold text-[#151210]">
                  120 guests • 6 cocktails
                </p>
                <p className="mt-2 text-sm text-[#4b3f3a]">
                  Inventory auto-packed with 10% buffer and 700ml bottle rounding.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 sm:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="glass-panel rounded-3xl px-6 py-8"
            >
              <h3 className="font-display text-2xl text-[#6a2e2a]">
                {feature.title}
              </h3>
              <p className="mt-3 text-sm leading-6 text-[#4b3f3a]">
                {feature.description}
              </p>
            </div>
          ))}
        </section>

        <section className="glass-panel rounded-[36px] px-8 py-10">
          <div className="flex flex-col gap-10 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-xl">
              <h2 className="font-display text-3xl text-[#151210]">
                From request to delivery in three steps.
              </h2>
              <p className="mt-3 text-sm leading-6 text-[#4b3f3a]">
                Clients can edit their request until they press Book Bartenders. After
                submission, you receive the full ingredient and staffing list.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {steps.map((step, index) => (
                <div
                  key={step.title}
                  className="rounded-3xl border border-white/60 bg-white/70 px-4 py-5"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#c47b4a]">
                    Step {index + 1}
                  </p>
                  <h3 className="mt-2 font-display text-lg text-[#6a2e2a]">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-xs text-[#4b3f3a]">{step.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div className="rounded-[36px] bg-[#6a2e2a] px-8 py-10 text-[#f8f1e7] shadow-lg shadow-[#6a2e2a]/30">
            <h3 className="font-display text-3xl">Admin Inventory Suite</h3>
            <p className="mt-3 text-sm leading-6 text-[#f8f1e7]/80">
              Manage recipes, inventory and staffing requirements in one place. Export
              shopping lists or send them directly to suppliers.
            </p>
            <div className="mt-6 space-y-3 text-sm">
              <p>• Ingredient totals with 10% safety buffer</p>
              <p>• Liquor bottle rounding to 700ml</p>
              <p>• Mixers & juices in total ml</p>
            </div>
          </div>
          <div className="glass-panel rounded-[32px] px-8 py-10">
            <h3 className="font-display text-2xl text-[#151210]">
              Ready to preview the build?
            </h3>
            <p className="mt-3 text-sm leading-6 text-[#4b3f3a]">
              We will connect Supabase for secure client logins, add admin-only recipe
              management, and wire automatic email notifications for every finalized
              request.
            </p>
            <div className="mt-6 flex flex-wrap gap-4">
              <Link
                href="/dashboard"
                className="rounded-full bg-[#c47b4a] px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-white shadow-lg shadow-[#c47b4a]/30 hover:-translate-y-0.5"
              >
                View Client Portal
              </Link>
              <Link
                href="/admin"
                className="rounded-full border border-[#c47b4a]/30 bg-white/70 px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-[#6a2e2a] hover:-translate-y-0.5"
              >
                View Admin
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
