import Link from "next/link";

export default function AdminHome() {
  return (
    <div className="min-h-screen hero-grid px-6 py-16">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-10">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#6a2e2a]">
            Admin workspace
          </p>
          <h1 className="font-display text-4xl text-[#151210]">
            Event control center
          </h1>
          <p className="mt-3 max-w-xl text-sm text-[#4b3f3a]">
            Manage recipes, inventory, and client requests from one elegant workspace.
          </p>
        </header>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="glass-panel rounded-[28px] px-8 py-8">
            <h2 className="font-display text-2xl text-[#6a2e2a]">Recipes</h2>
            <p className="mt-2 text-sm text-[#4b3f3a]">
              Edit cocktails, ingredients, and serving assumptions.
            </p>
            <Link
              href="/admin/recipes"
              className="mt-6 inline-flex rounded-full bg-[#6a2e2a] px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-[#f8f1e7] shadow-lg shadow-[#c47b4a]/30 hover:-translate-y-0.5"
            >
              Manage Recipes
            </Link>
          </div>
          <div className="glass-panel rounded-[28px] px-8 py-8">
            <h2 className="font-display text-2xl text-[#6a2e2a]">
              Inventory
            </h2>
            <p className="mt-2 text-sm text-[#4b3f3a]">
              Review upcoming event totals and export purchase lists.
            </p>
            <Link
              href="/admin/inventory"
              className="mt-6 inline-flex rounded-full bg-[#c47b4a] px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-white shadow-lg shadow-[#c47b4a]/30 hover:-translate-y-0.5"
            >
              View Inventory
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
