"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function RequestPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [guestCount, setGuestCount] = useState(50);
  const [notes, setNotes] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    const response = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        eventDate,
        guestCount,
        notes,
        clientEmail,
      }),
    });

    const data = await response.json();
    setLoading(false);

    if (!response.ok) {
      setError(data.error || "Unable to create request.");
      return;
    }

    router.push(`/request/edit/${data.editToken}`);
  };

  return (
    <div className="min-h-screen hero-grid px-6 py-16">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#6a2e2a]">
            Request a cocktail party
          </p>
          <h1 className="font-display text-4xl text-[#151210]">
            Book bartenders without a login
          </h1>
          <p className="mt-2 text-sm text-[#4b3f3a]">
            Enter your details and you will receive a private edit link once email
            is enabled. For now we will keep the link on-screen.
          </p>
        </header>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <div className="glass-panel rounded-[28px] px-8 py-6">
          <h2 className="font-display text-2xl text-[#6a2e2a]">
            Event details
          </h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Event name"
              className="rounded-2xl border border-[#c47b4a]/30 bg-white/80 px-4 py-3 text-sm"
            />
            <input
              type="date"
              value={eventDate}
              onChange={(event) => setEventDate(event.target.value)}
              className="rounded-2xl border border-[#c47b4a]/30 bg-white/80 px-4 py-3 text-sm"
            />
            <input
              type="number"
              min={10}
              value={guestCount}
              onChange={(event) => setGuestCount(Number(event.target.value))}
              className="rounded-2xl border border-[#c47b4a]/30 bg-white/80 px-4 py-3 text-sm"
            />
            <input
              type="email"
              value={clientEmail}
              onChange={(event) => setClientEmail(event.target.value)}
              placeholder="Email for edit link"
              className="rounded-2xl border border-[#c47b4a]/30 bg-white/80 px-4 py-3 text-sm"
            />
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Event notes"
              className="min-h-[120px] rounded-2xl border border-[#c47b4a]/30 bg-white/80 px-4 py-3 text-sm md:col-span-2"
            />
          </div>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="mt-4 rounded-full bg-[#6a2e2a] px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-[#f8f1e7] shadow-lg shadow-[#c47b4a]/30 hover:-translate-y-0.5 disabled:opacity-60"
          >
            {loading ? "Saving..." : "Create Request"}
          </button>
        </div>
      </div>
    </div>
  );
}
