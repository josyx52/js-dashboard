"use client";
import { createContext, useCallback, useContext, useState } from "react";
import { cn } from "@/lib/cn";

type Tone = "success" | "error" | "info";
interface ToastItem {
  id: number;
  tone: Tone;
  title: string;
  description?: string;
}

const Ctx = createContext<(t: Omit<ToastItem, "id">) => void>(() => {});

// Notificacoes discretas no canto: sucesso, erro e informacao. Substituem
// as mensagens de erro soltas no meio das paginas.
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((t: Omit<ToastItem, "id">) => {
    const id = Date.now() + Math.random();
    setItems((p) => [...p.slice(-3), { ...t, id }]);
    setTimeout(() => setItems((p) => p.filter((x) => x.id !== id)), t.tone === "error" ? 7000 : 3500);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="fixed z-[60] bottom-20 md:bottom-5 right-4 left-4 md:left-auto flex flex-col gap-2 items-end pointer-events-none" aria-live="polite">
        {items.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto w-full md:w-[360px] rounded-xl border bg-surface shadow-pop px-4 py-3 animate-fade-up flex gap-3",
              t.tone === "error" ? "border-danger/30" : t.tone === "success" ? "border-success/25" : "border-line/10"
            )}
          >
            <span className={cn("mt-1 w-2 h-2 rounded-full flex-none", t.tone === "error" ? "bg-danger" : t.tone === "success" ? "bg-success" : "bg-info")} />
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-fg">{t.title}</div>
              {t.description && <div className="text-[12px] text-fg-2 mt-0.5 break-words">{t.description}</div>}
            </div>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const push = useContext(Ctx);
  return {
    success: (title: string, description?: string) => push({ tone: "success", title, description }),
    error: (title: string, description?: string) => push({ tone: "error", title, description }),
    info: (title: string, description?: string) => push({ tone: "info", title, description }),
  };
}
