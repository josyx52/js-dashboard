"use client";
import { forwardRef } from "react";
import { cn } from "@/lib/cn";

const base =
  "bg-surface-2 border border-line/10 rounded-lg text-[13px] text-fg placeholder:text-fg-3 outline-none transition-colors " +
  "hover:border-line/15 focus:border-accent/60 focus:ring-2 focus:ring-accent/15";

// Largura total salvo se a pagina der outra (cn nao resolve conflitos do Tailwind).
const width = (c?: string) => (c && /(^|\s)!?w-/.test(c) ? "" : "w-full");

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(base, width(className), "h-9 px-3", className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...rest },
  ref
) {
  return <textarea ref={ref} className={cn(base, width(className), "px-3 py-2 resize-none leading-relaxed", className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...rest },
  ref
) {
  return (
    <select ref={ref} className={cn(base, width(className), "h-9 pl-3 pr-8 appearance-none bg-no-repeat cursor-pointer", className)} style={{ backgroundImage: CHEVRON, backgroundPosition: "right 10px center" }} {...rest}>
      {children}
    </select>
  );
});

const CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23a1a1a6' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")";

export function Label({ children, hint }: { children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between mb-1.5">
      <span className="text-[12px] font-medium text-fg-2">{children}</span>
      {hint && <span className="text-[11.5px] text-fg-3">{hint}</span>}
    </div>
  );
}

// Grupo de opcoes exclusivas (filtros, tipos). Acessivel: role=radiogroup.
export function Segmented<T extends string>(props: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode; color?: string }[];
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div role="radiogroup" className={cn("inline-flex p-0.5 rounded-lg bg-surface-2 border border-line/[0.08] gap-0.5 overflow-x-auto max-w-full", props.className)}>
      {props.options.map((o) => {
        const active = o.value === props.value;
        return (
          <button type="button"
            key={o.value}
            role="radio"
            aria-checked={active}
            onClick={() => props.onChange(o.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors",
              props.size === "sm" ? "h-7 px-2.5 text-[12px]" : "h-8 px-3 text-[12.5px]",
              active ? "bg-surface-3 text-fg shadow-[0_1px_2px_rgb(0_0_0/0.4)]" : "text-fg-3 hover:text-fg-2"
            )}
          >
            {o.color && <span className="w-1.5 h-1.5 rounded-full" style={{ background: o.color }} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
