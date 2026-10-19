import { cn } from "@/lib/cn";

// Contentor e cabecalho iguais em todas as paginas.
export function Page({ children, className, wide }: { children: React.ReactNode; className?: string; wide?: boolean }) {
  return <div className={cn("mx-auto w-full px-4 sm:px-8 py-5 sm:py-8 flex flex-col gap-6", wide ? "max-w-[1400px]" : "max-w-[1200px]", className)}>{children}</div>;
}

export function PageHeader(props: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; meta?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-end gap-x-6 gap-y-3">
      <div className="flex-1 min-w-[220px]">
        <h1 className="text-[22px] sm:text-[24px] font-semibold tracking-[-0.01em] text-fg">{props.title}</h1>
        {props.description && <p className="text-[13px] text-fg-2 mt-1 max-w-[640px] leading-relaxed">{props.description}</p>}
        {props.meta && <div className="mt-2">{props.meta}</div>}
      </div>
      {props.actions && <div className="flex flex-wrap items-center gap-2">{props.actions}</div>}
    </header>
  );
}

export function EmptyState(props: { icon?: React.ReactNode; title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center text-center px-6 py-10 gap-2", props.className)}>
      {props.icon && <div className="w-10 h-10 rounded-xl bg-line/[0.05] border border-line/[0.07] flex items-center justify-center text-fg-3 mb-1">{props.icon}</div>}
      <div className="text-[13.5px] font-medium text-fg">{props.title}</div>
      {props.description && <div className="text-[12.5px] text-fg-3 max-w-[380px] leading-relaxed">{props.description}</div>}
      {props.action && <div className="mt-2">{props.action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("rounded-lg bg-line/[0.05] animate-pulse", className)} />;
}

export function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <span className="text-[11.5px] font-medium text-fg-3 uppercase tracking-[0.06em]">{children}</span>
      {right && <span className="text-[11.5px] text-fg-3">{right}</span>}
    </div>
  );
}
