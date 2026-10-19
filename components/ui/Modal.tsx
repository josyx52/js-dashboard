"use client";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

// Dialogo acessivel: fecha com Esc e clique fora, foca o primeiro campo,
// devolve o foco ao elemento que o abriu, bloqueia o scroll do fundo.
export function Modal(props: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!props.open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && props.onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    setTimeout(() => panel.current?.querySelector<HTMLElement>("input,textarea,select,button")?.focus(), 30);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      prev?.focus?.();
    };
  }, [props.open]);

  if (!props.open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-[2px]" onMouseDown={props.onClose}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
        className={cn("w-full bg-surface border border-line/10 shadow-pop rounded-t-2xl sm:rounded-2xl animate-fade-up max-h-[92dvh] flex flex-col")}
        style={{ maxWidth: props.width || 480 }}
      >
        <div className="px-5 pt-5 pb-3">
          <h2 className="text-[15px] font-semibold">{props.title}</h2>
          {props.description && <p className="text-[12.5px] text-fg-3 mt-1">{props.description}</p>}
        </div>
        <div className="px-5 pb-4 overflow-y-auto">{props.children}</div>
        {props.footer && <div className="px-5 py-3.5 border-t border-line/[0.07] flex justify-end gap-2">{props.footer}</div>}
      </div>
    </div>
  );
}
