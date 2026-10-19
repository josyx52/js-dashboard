"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Input, Label } from "@/components/ui";

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
    <div className="w-full max-w-[380px] animate-fade-up">
      <div className="flex flex-col items-center text-center mb-6">
        <div className="w-11 h-11 rounded-xl bg-accent flex items-center justify-center text-white font-bold text-[15px] tracking-tight shadow-[0_8px_24px_-6px_rgb(var(--accent)/0.55)]">
          JS
        </div>
        <h1 className="mt-4 text-[20px] font-semibold tracking-[-0.01em]">Sistema JS</h1>
        <p className="text-[13px] text-fg-3 mt-1">Entra para continuar</p>
      </div>
      <form onSubmit={submit} className="bg-surface border border-line/[0.07] rounded-2xl shadow-pop p-6 flex flex-col gap-4">
        <div>
          <Label>Palavra-passe</Label>
          <Input
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (error) setError(null);
            }}
            placeholder="••••••••"
            aria-invalid={!!error}
            aria-describedby={error ? "login-error" : undefined}
            className={error ? "border-danger/60 focus:border-danger/70 focus:ring-danger/15" : undefined}
          />
          {error && (
            <p id="login-error" role="alert" className="text-[12px] text-danger mt-1.5">
              {error}
            </p>
          )}
        </div>
        <Button type="submit" variant="primary" loading={loading} disabled={loading || !password} className="w-full justify-center">
          Entrar
        </Button>
      </form>
      <p className="text-center text-[11.5px] text-fg-3 mt-5">Sessão válida durante 30 dias neste dispositivo.</p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-bg bg-[radial-gradient(ellipse_at_top,rgb(var(--accent)/0.08),transparent_60%)]">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
