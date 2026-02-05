"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type EventRecord = {
  id: string;
  title: string | null;
  event_date: string | null;
  guest_count: number | null;
  notes: string | null;
  status: "draft" | "submitted" | "confirmed";
};

export default function RequestEditPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [event, setEvent] = useState<EventRecord | null>(null);
  const [title, setTitle] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [guestCount, setGuestCount] = useState(50);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadEvent = async () => {
    setLoading(true);
    setError(null);
    const response = await fetch(`/api/events?token=${token}`);
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Unable to load request.");
      setLoading(false);
      return;
    }

    setEvent(data as EventRecord);
    setTitle(data.title || "");
    setEventDate(data.event_date || "");
    setGuestCount(data.guest_count || 0);
    setNotes(data.notes || "");
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const response = await fetch("/api/events", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        title,
        eventDate,
        guestCount,
        notes,
        status: event?.status,
      }),
    });
    const data = await response.json();
    setSaving(false);

    if (!response.ok) {
      setError(data.error || "Unable to save request.");
      return;
    }

    await loadEvent();
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    const response = await fetch("/api/events", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        title,
        eventDate,
        guestCount,
        notes,
        status: "submitted",
      }),
    });
    const data = await response.json();
    setSaving(false);

    if (!response.ok) {
      setError(data.error || "Unable to submit request.");
      return;
    }

    router.push("/request");
  };

  useEffect(() => {
    loadEvent();
  }, []);

  return (
    <div className="min-h-screen hero-grid px-6 py-16">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#6a2e2a]">
            Edit request
          </p>
          <h1 className="font-display text-4xl text-[#151210]">
            {event?.title || "Cocktail request"}
          </h1>
          <p className="mt-2 text-sm text-[#4b3f3a]">
            Save your updates or finalize when you're ready to book bartenders.
          </p>
        </header>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        {loading ? (
          <p className="text-sm text-[#4b3f3a]">Loading request...</p>
        ) : (
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
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Event notes"
                className="min-h-[120px] rounded-2xl border border-[#c47b4a]/30 bg-white/80 px-4 py-3 text-sm md:col-span-2"
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-4">
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-full border border-[#6a2e2a]/30 bg-white/70 px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-[#6a2e2a] hover:-translate-y-0.5 disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving || event?.status === "submitted"}
                className="rounded-full bg-[#c47b4a] px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-white shadow-lg shadow-[#c47b4a]/30 hover:-translate-y-0.5 disabled:opacity-60"
              >
                {event?.status === "submitted" ? "Submitted" : "Book Bartenders"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
