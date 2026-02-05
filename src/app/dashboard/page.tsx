"use client";

import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const statusColors: Record<string, string> = {
  draft: "bg-white/80 text-[#6a2e2a]",
  submitted: "bg-[#c47b4a]/20 text-[#6a2e2a]",
  confirmed: "bg-[#6a2e2a] text-[#f8f1e7]",
};

type EventItem = {
  id: string;
  title: string | null;
  event_date: string | null;
  guest_count: number | null;
  status: "draft" | "submitted" | "confirmed";
};

export default function DashboardPage() {
  const router = useRouter();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [guestCount, setGuestCount] = useState(50);
  const [eventDate, setEventDate] = useState("");
  const [userId, setUserId] = useState<string | null>(null);

  const loadEvents = async () => {
    setLoading(true);
    setError(null);
    const { data, error: fetchError } = await supabase
      .from("events")
      .select("id, title, event_date, guest_count, status")
      .order("created_at", { ascending: false });

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setEvents((data as EventItem[]) || []);
    }
    setLoading(false);
  };

  const handleCreate = async () => {
    setError(null);
    if (!userId) {
      setError("You must be logged in to create a request.");
      return;
    }
    const { error: insertError } = await supabase.from("events").insert({
      client_id: userId,
      title: title || "New Cocktail Event",
      guest_count: guestCount,
      event_date: eventDate || null,
      status: "draft",
    });

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setTitle("");
    setEventDate("");
    await loadEvents();
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  useEffect(() => {
    const fetchSession = async () => {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        setError(sessionError.message);
        return;
      }
      if (!data.session?.user) {
        setUserId(null);
        return;
      }
      setUserId(data.session.user.id);
      loadEvents();
    };

    fetchSession();

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!session?.user) {
          setUserId(null);
          setEvents([]);
          return;
        }
        setUserId(session.user.id);
        loadEvents();
      },
    );

    return () => {
      subscription.subscription.unsubscribe();
    };
  }, []);

  return (
    <div className="min-h-screen hero-grid px-6 py-16">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <header className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#6a2e2a]">
              Client portal
            </p>
            <h1 className="font-display text-4xl text-[#151210]">
              Your cocktail requests
            </h1>
          </div>
          <button
            onClick={handleLogout}
            className="rounded-full border border-[#6a2e2a]/30 bg-white/70 px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-[#6a2e2a] hover:-translate-y-0.5"
          >
            Log out
          </button>
        </header>

        <div className="glass-panel rounded-[28px] px-8 py-6">
          <h2 className="font-display text-2xl text-[#6a2e2a]">
            Start a new request
          </h2>
          {!userId ? (
            <p className="mt-3 text-sm text-[#4b3f3a]">
              Please{" "}
              <Link href="/login" className="font-semibold text-[#6a2e2a]">
                log in
              </Link>{" "}
              to create a request.
            </p>
          ) : null}
          <div className="mt-4 grid gap-4 md:grid-cols-3">
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
          </div>
          <button
            onClick={handleCreate}
            disabled={!userId}
            className="mt-4 rounded-full bg-[#6a2e2a] px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-[#f8f1e7] shadow-lg shadow-[#c47b4a]/30 hover:-translate-y-0.5"
          >
            Create Draft
          </button>
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <div className="grid gap-6">
          {loading ? (
            <p className="text-sm text-[#4b3f3a]">Loading requests...</p>
          ) : !userId ? (
            <div className="glass-panel rounded-[28px] px-8 py-6 text-sm text-[#4b3f3a]">
              Log in to view and manage your requests.
            </div>
          ) : events.length === 0 ? (
            <div className="glass-panel rounded-[28px] px-8 py-6 text-sm text-[#4b3f3a]">
              No requests yet. Start with the form above.
            </div>
          ) : (
            events.map((request) => (
              <div
                key={request.id}
                className="glass-panel flex flex-col gap-6 rounded-[28px] px-8 py-6 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <h2 className="font-display text-2xl text-[#6a2e2a]">
                    {request.title || "Untitled Event"}
                  </h2>
                  <p className="mt-2 text-sm text-[#4b3f3a]">
                    {request.event_date || "Date TBD"} · {request.guest_count || 0} guests
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <span
                    className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] ${
                      statusColors[request.status]
                    }`}
                  >
                    {request.status}
                  </span>
                  <Link
                    href={`/dashboard/${request.id}`}
                    className="rounded-full border border-[#6a2e2a]/30 bg-white/80 px-5 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#6a2e2a] hover:-translate-y-0.5"
                  >
                    Edit Request
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
