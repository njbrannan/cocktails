import Link from "next/link";
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/request");
  return (
    <div className="min-h-screen hero-grid">
      <main className="mx-auto flex min-h-screen w-full max-w-6xl items-center px-6 py-16 sm:px-10">
        <div className="glass-panel w-full rounded-[36px] px-10 py-12 text-center">
          <h1 className="font-display text-4xl text-[#151210] sm:text-5xl">
            Cocktail Party Planner
          </h1>
          <p className="mt-4 text-sm text-[#4b3f3a] sm:text-base">
            Redirecting you to the booking page...
          </p>
          <div className="mt-8 flex justify-center">
            <Link
              href="/request"
              className="rounded-full bg-[#6a2e2a] px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-[#f8f1e7] shadow-lg shadow-[#c47b4a]/30 hover:-translate-y-0.5"
            >
              Go to Booking
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
