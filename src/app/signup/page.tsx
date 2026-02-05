"use client";

import { AuthCard } from "@/components/AuthCard";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignup = async () => {
    setLoading(true);
    setError(null);
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    });
    setLoading(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    router.push("/dashboard");
  };

  return (
    <div className="min-h-screen hero-grid px-6 py-16">
      <div className="mx-auto w-full max-w-md">
        <Link
          href="/"
          className="mb-8 inline-flex text-xs font-semibold uppercase tracking-[0.3em] text-[#6a2e2a]"
        >
          Back to home
        </Link>
        <AuthCard
          title="Create your account"
          subtitle="Start planning your cocktail party with Get Involved."
          footerText="Already have an account?"
          footerLink="/login"
          footerLabel="Log in"
        >
          <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-[#6a2e2a]">
            Full Name
            <input
              type="text"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Your name"
              className="mt-2 w-full rounded-2xl border border-[#c47b4a]/30 bg-white/80 px-4 py-3 text-sm"
            />
          </label>
          <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-[#6a2e2a]">
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@email.com"
              className="mt-2 w-full rounded-2xl border border-[#c47b4a]/30 bg-white/80 px-4 py-3 text-sm"
            />
          </label>
          <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-[#6a2e2a]">
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Create a password"
              className="mt-2 w-full rounded-2xl border border-[#c47b4a]/30 bg-white/80 px-4 py-3 text-sm"
            />
          </label>
          {error ? <p className="text-xs text-red-600">{error}</p> : null}
          <button
            onClick={handleSignup}
            disabled={loading}
            className="w-full rounded-full bg-[#6a2e2a] px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-[#f8f1e7] shadow-lg shadow-[#c47b4a]/30 hover:-translate-y-0.5 disabled:opacity-60"
          >
            {loading ? "Creating..." : "Create Account"}
          </button>
        </AuthCard>
      </div>
    </div>
  );
}
