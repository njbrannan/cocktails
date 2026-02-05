"use client";

import { supabase } from "@/lib/supabaseClient";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type EventRecord = {
  id: string;
  title: string | null;
  event_date: string | null;
  guest_count: number | null;
  notes: string | null;
  status: "draft" | "submitted" | "confirmed";
};

type Recipe = {
  id: string;
  name: string;
  description: string | null;
};

type EventRecipe = {
  id: string;
  servings: number;
  recipes: Recipe | null;
};

export default function EventBuilderPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.id as string;

  const [event, setEvent] = useState<EventRecord | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [eventRecipes, setEventRecipes] = useState<EventRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [guestCount, setGuestCount] = useState(50);
  const [notes, setNotes] = useState("");

  const canSubmit = useMemo(() => event?.status === "draft", [event?.status]);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    const [
      { data: eventData, error: eventError },
      { data: recipeData, error: recipeError },
      { data: eventRecipeData, error: eventRecipeError },
    ] = await Promise.all([
      supabase
        .from("events")
        .select("id, title, event_date, guest_count, notes, status")
        .eq("id", eventId)
        .single(),
      supabase.from("recipes").select("id, name, description").eq("is_active", true),
      supabase
        .from("event_recipes")
        .select("id, servings, recipes(id, name, description)")
        .eq("event_id", eventId),
    ]);

    if (eventError) {
      setError(eventError.message);
    }
    if (recipeError) {
      setError(recipeError.message);
    }
    if (eventRecipeError) {
      setError(eventRecipeError.message);
    }

    if (eventData) {
      const data = eventData as EventRecord;
      setEvent(data);
      setTitle(data.title || "");
      setEventDate(data.event_date || "");
      setGuestCount(data.guest_count || 0);
      setNotes(data.notes || "");
    }

    setRecipes((recipeData as Recipe[]) || []);
    setEventRecipes((eventRecipeData as EventRecipe[]) || []);
    setLoading(false);
  };

  const handleSaveEvent = async () => {
    if (!event) {
      return;
    }
    setSaving(true);
    setError(null);
    const { error: updateError } = await supabase
      .from("events")
      .update({
        title,
        event_date: eventDate || null,
        guest_count: guestCount,
        notes: notes || null,
      })
      .eq("id", event.id);

    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }

    await loadData();
  };

  const handleRecipeToggle = async (recipeId: string) => {
    if (!event) {
      return;
    }
    const existing = eventRecipes.find((item) => item.recipes?.id === recipeId);
    if (existing) {
      const { error: deleteError } = await supabase
        .from("event_recipes")
        .delete()
        .eq("id", existing.id);
      if (deleteError) {
        setError(deleteError.message);
        return;
      }
    } else {
      const { error: insertError } = await supabase.from("event_recipes").insert({
        event_id: event.id,
        recipe_id: recipeId,
        servings: 0,
      });
      if (insertError) {
        setError(insertError.message);
        return;
      }
    }

    await loadData();
  };

  const handleServingsChange = async (eventRecipeId: string, servings: number) => {
    const { error: updateError } = await supabase
      .from("event_recipes")
      .update({ servings })
      .eq("id", eventRecipeId);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    await loadData();
  };

  const handleSubmit = async () => {
    if (!event || event.status !== "draft") {
      return;
    }
    setSaving(true);
    setError(null);
    const { error: updateError } = await supabase
      .from("events")
      .update({ status: "submitted" })
      .eq("id", event.id);

    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }

    await loadData();
    router.push("/dashboard");
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div className="min-h-screen hero-grid px-6 py-16">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <header className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#6a2e2a]">
              Event builder
            </p>
            <h1 className="font-display text-4xl text-[#151210]">
              {event?.title || "Cocktail event"}
            </h1>
          </div>
          <button
            onClick={() => router.push("/dashboard")}
            className="rounded-full border border-[#6a2e2a]/30 bg-white/70 px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-[#6a2e2a] hover:-translate-y-0.5"
          >
            Back to dashboard
          </button>
        </header>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        {loading ? (
          <p className="text-sm text-[#4b3f3a]">Loading event...</p>
        ) : (
          <>
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
              <button
                onClick={handleSaveEvent}
                disabled={saving}
                className="mt-4 rounded-full bg-[#6a2e2a] px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-[#f8f1e7] shadow-lg shadow-[#c47b4a]/30 hover:-translate-y-0.5 disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save Details"}
              </button>
            </div>

            <div className="glass-panel rounded-[28px] px-8 py-6">
              <h2 className="font-display text-2xl text-[#6a2e2a]">
                Select cocktails
              </h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {recipes.map((recipe) => {
                  const isSelected = eventRecipes.some(
                    (item) => item.recipes?.id === recipe.id,
                  );
                  return (
                    <button
                      key={recipe.id}
                      onClick={() => handleRecipeToggle(recipe.id)}
                      className={`rounded-3xl border px-5 py-4 text-left ${
                        isSelected
                          ? "border-[#6a2e2a] bg-[#6a2e2a] text-[#f8f1e7]"
                          : "border-[#c47b4a]/30 bg-white/80 text-[#4b3f3a]"
                      }`}
                    >
                      <h3 className="font-display text-lg">{recipe.name}</h3>
                      <p className="mt-2 text-xs opacity-80">
                        {recipe.description || "Cocktail recipe"}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="glass-panel rounded-[28px] px-8 py-6">
              <h2 className="font-display text-2xl text-[#6a2e2a]">
                Set servings
              </h2>
              {eventRecipes.length === 0 ? (
                <p className="mt-3 text-sm text-[#4b3f3a]">
                  Select at least one cocktail to set servings.
                </p>
              ) : (
                <div className="mt-4 grid gap-4">
                  {eventRecipes.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#c47b4a]/20 bg-white/80 px-5 py-4"
                    >
                      <div>
                        <p className="text-sm font-semibold text-[#151210]">
                          {item.recipes?.name || "Cocktail"}
                        </p>
                      </div>
                      <input
                        type="number"
                        min={0}
                        value={item.servings}
                        onChange={(event) =>
                          handleServingsChange(
                            item.id,
                            Number(event.target.value),
                          )
                        }
                        className="w-28 rounded-2xl border border-[#c47b4a]/30 bg-white px-4 py-2 text-sm"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="glass-panel rounded-[28px] px-8 py-6">
              <h2 className="font-display text-2xl text-[#6a2e2a]">
                Ready to finalize?
              </h2>
              <p className="mt-2 text-sm text-[#4b3f3a]">
                Clients can edit until they press Book Bartenders. We will then
                lock the request for review.
              </p>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit || saving}
                className="mt-4 rounded-full bg-[#c47b4a] px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-white shadow-lg shadow-[#c47b4a]/30 hover:-translate-y-0.5 disabled:opacity-60"
              >
                {event?.status === "submitted" ? "Submitted" : "Book Bartenders"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
