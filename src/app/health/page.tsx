import Link from "next/link";

export default function HealthPage() {
  return (
    <div className="min-h-screen hero-grid px-6 py-16">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#6a2e2a]">
          Health Check
        </p>
        <h1 className="font-display text-4xl text-[#151210]">All systems go</h1>
        <p className="text-sm text-[#4b3f3a]">
          If you can see this page, the app and routing are working.
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <Link
            href="/"
            className="rounded-full bg-[#6a2e2a] px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-[#f8f1e7] shadow-lg shadow-[#c47b4a]/30 hover:-translate-y-0.5"
          >
            Back Home
          </Link>
          <Link
            href="/dashboard"
            className="rounded-full border border-[#6a2e2a]/30 bg-white/70 px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-[#6a2e2a] hover:-translate-y-0.5"
          >
            Client Portal
          </Link>
        </div>
      </div>
    </div>
  );
}
