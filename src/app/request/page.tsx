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
  const [success, setSuccess] = useState<string | null>(null);
  const [editLink, setEditLink] = useState<string | null>(null);

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    setEditLink(null);

    try {
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

      let data: any = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }

      if (!response.ok) {
        setError(data?.error || `Unable to create request (HTTP ${response.status}).`);
        return;
      }

      const token = data?.editToken as string | undefined;
      if (!token) {
        setError("Request created, but no edit token was returned.");
        return;
      }

      const link = `${window.location.origin}/request/edit/${token}`;
      setEditLink(link);
      setSuccess("Request created. Use the private link below to edit any time.");
    } catch (err: any) {
      setError(err?.message || "Network error while creating request.");
    } finally {
      setLoading(false);
    }
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
        {success ? <p className="text-sm text-[#4b3f3a]">{success}</p> : null}

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
            {loading ? "Sending request..." : "Create Request"}
          </button>

          {editLink ? (
            <div className="mt-6 rounded-3xl border border-[#c47b4a]/20 bg-white/70 px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#6a2e2a]">
                Private edit link
              </p>
              <p className="mt-2 break-all text-sm text-[#151210]">{editLink}</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  onClick={async () => {
                    await navigator.clipboard.writeText(editLink);
                    setSuccess("Link copied. You're all set.");
                  }}
                  className="rounded-full border border-[#6a2e2a]/30 bg-white/80 px-5 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#6a2e2a] hover:-translate-y-0.5"
                >
                  Copy Link
                </button>
                <button
                  onClick={() => router.push(editLink.replace(window.location.origin, ""))}
                  className="rounded-full bg-[#c47b4a] px-5 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white shadow-lg shadow-[#c47b4a]/30 hover:-translate-y-0.5"
                >
                  Edit Request
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
