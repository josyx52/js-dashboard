"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

function LoginForm() {
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const next = params.get("next");
      window.location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
    } catch (e: any) {
      setError(e.message);
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="w-full max-w-[320px] flex flex-col gap-3">
      <div className="w-9 h-9 bg-accent rounded flex items-center justify-center font-mono font-extrabold text-[15px] text-bg">
        JS
      </div>
      <input
        type="password"
        autoFocus
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="palavra-passe"
        className="bg-bg border border-white/10 rounded px-3 py-2 text-[13px] font-mono outline-none focus:border-accent"
      />
      <button
        type="submit"
        disabled={loading || !password}
        className="px-3 py-2 bg-accent border-none rounded text-bg font-mono font-bold text-[11px] disabled:opacity-50"
      >
        {loading ? "…" : "ENTRAR"}
      </button>
      {error && <div className="font-mono text-[11.5px] text-red-400">{error}</div>}
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
