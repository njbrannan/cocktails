"use client";

import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Slot = {
  id: string;
  start_ts: string;
  end_ts: string;
  is_active: boolean;
};

function toLocalDateInputValue(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function toLocalTimeInputValue(d: Date) {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function buildIsoFromLocal(date: string, time: string) {
  // Interprets as local time, then converts to ISO (UTC).
  const dt = new Date(`${date}T${time}`);
  if (!Number.isFinite(dt.getTime())) return null;
  return dt.toISOString();
}

export default function AdminAvailabilityPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [error, setError] = useState<string | null>(null);

  const today = useMemo(() => new Date(), []);
  const [date, setDate] = useState(() => toLocalDateInputValue(today));
  const [startTime, setStartTime] = useState(() => "16:00");
  const [endTime, setEndTime] = useState(() => "20:00");

  const loadSlots = async () => {
    const { data, error: err } = await supabase
      .from("availability_slots")
      .select("id, start_ts, end_ts, is_active")
      .order("start_ts", { ascending: true })
      .limit(200);
    if (err) throw err;
    setSlots((data as any) || []);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await supabase.auth.getUser();
        const user = data?.user;
        if (!user) {
          if (!cancelled) router.push("/login");
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();
        if (profileError) throw profileError;
        if (!profile || profile.role !== "admin") {
          setIsAdmin(false);
          setError("You are not authorized to access this page.");
          return;
        }
        setIsAdmin(true);
        await loadSlots();
      } catch (e: any) {
        setError(e?.message || "Unable to load availability.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const addSlot = async () => {
    setError(null);
    const startIso = buildIsoFromLocal(date, startTime);
    const endIso = buildIsoFromLocal(date, endTime);
    if (!startIso || !endIso) {
      setError("Please enter a valid date and time range.");
      return;
    }
    if (new Date(endIso) <= new Date(startIso)) {
      setError("Finish time must be after start time.");
      return;
    }

    const { error: err } = await supabase.from("availability_slots").insert({
      start_ts: startIso,
      end_ts: endIso,
      is_active: true,
    });
    if (err) {
      setError(err.message);
      return;
    }
    await loadSlots();
  };

  const deleteSlot = async (id: string) => {
    setError(null);
    const { error: err } = await supabase
      .from("availability_slots")
      .delete()
      .eq("id", id);
    if (err) {
      setError(err.message);
      return;
    }
    await loadSlots();
  };

  const toggleActive = async (slot: Slot) => {
    setError(null);
    const { error: err } = await supabase
      .from("availability_slots")
      .update({ is_active: !slot.is_active })
      .eq("id", slot.id);
    if (err) {
      setError(err.message);
      return;
    }
    await loadSlots();
  };

  return (
    <div className="min-h-screen hero-grid px-6 py-16">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <header className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">
              Admin
            </p>
            <h1 className="font-display text-4xl text-ink">Availability</h1>
            <p className="mt-2 max-w-xl text-sm text-muted">
              Add available booking slots. Clients can only book within an available slot.
            </p>
          </div>
          <Link
            href="/admin"
            className="gi-btn-secondary px-6 py-3 text-xs font-semibold uppercase tracking-[0.25em] hover:-translate-y-0.5"
          >
            Back to Admin
          </Link>
        </header>

        {loading ? (
          <div className="glass-panel rounded-[28px] px-8 py-8 text-sm text-muted">
            Loading…
          </div>
        ) : null}

        {!loading && !isAdmin ? (
          <div className="glass-panel rounded-[28px] px-8 py-8">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        ) : null}

        {!loading && isAdmin ? (
          <>
            <div className="glass-panel rounded-[28px] px-8 py-8">
              <h2 className="font-display text-2xl text-accent">Add slot</h2>
              <div className="mt-6 grid gap-4 md:grid-cols-3">
                <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-accent">
                  Date
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="mt-2 h-[52px] w-full rounded-2xl border border-soft bg-white/80 px-4 py-3 text-[16px] tracking-normal text-ink"
                  />
                </label>
                <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-accent">
                  Start
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="mt-2 h-[52px] w-full rounded-2xl border border-soft bg-white/80 px-4 py-3 text-[16px] tracking-normal text-ink"
                  />
                </label>
                <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-accent">
                  Finish
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="mt-2 h-[52px] w-full rounded-2xl border border-soft bg-white/80 px-4 py-3 text-[16px] tracking-normal text-ink"
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={() => void addSlot()}
                className="gi-btn-primary mt-6 w-full px-6 py-3 text-xs font-semibold uppercase tracking-[0.25em] hover:-translate-y-0.5"
              >
                Add slot
              </button>
              {error ? (
                <p className="mt-4 text-sm font-medium text-red-700">{error}</p>
              ) : null}
            </div>

            <div className="glass-panel rounded-[28px] px-8 py-8">
              <h2 className="font-display text-2xl text-accent">Upcoming slots</h2>
              <p className="mt-2 text-sm text-muted">
                Tip: If you haven’t added any slots yet, the app will allow all bookings (so it doesn’t lock up on day one).
              </p>
              <div className="mt-6 grid gap-3">
                {slots.length ? (
                  slots.map((s) => {
                    const start = new Date(s.start_ts);
                    const end = new Date(s.end_ts);
                    const label = `${toLocalDateInputValue(start)} · ${toLocalTimeInputValue(start)}–${toLocalTimeInputValue(end)}`;
                    return (
                      <div
                        key={s.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-subtle bg-white/80 px-5 py-4"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-ink">
                            {label}
                          </p>
                          <p className="mt-1 text-xs uppercase tracking-[0.2em] text-accent">
                            {s.is_active ? "Active" : "Inactive"}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => void toggleActive(s)}
                            className="gi-btn-secondary px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em]"
                          >
                            {s.is_active ? "Disable" : "Enable"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteSlot(s.id)}
                            className="rounded-full border border-red-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-red-700 hover:-translate-y-0.5"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-sm text-muted">No slots yet.</p>
                )}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

