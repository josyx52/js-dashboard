"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/dashboard");
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={submit} className="bg-surface border border-border rounded-xl2 p-8 w-full max-w-sm flex flex-col gap-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-[10px] bg-accent flex items-center justify-center font-bold text-bg text-sm">JS</div>
          <span className="font-semibold">Sistema JS</span>
        </div>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="bg-white/[0.03] border border-border rounded-lg px-3 py-2 text-sm"
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="bg-white/[0.03] border border-border rounded-lg px-3 py-2 text-sm"
          required
        />
        {error && <div className="text-red-400 text-xs">{error}</div>}
        <button
          type="submit"
          disabled={loading}
          className="bg-white text-bg font-semibold rounded-lg py-2 text-sm disabled:opacity-50"
        >
          {loading ? "a entrar…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
