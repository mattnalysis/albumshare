"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

export default function LoginPage() {
  const supabase = createSupabaseBrowserClient();

  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  }

  return (
    <main className="p-6 max-w-md mx-auto">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <button
        onClick={signInWithGoogle}
        className="mt-6 w-full border rounded-xl p-3"
      >
        Continue with Google
      </button>
    </main>
  );
}
