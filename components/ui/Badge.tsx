import { cn } from "@/lib/cn";

type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info" | "violet";
const TONE: Record<Tone, string> = {
  neutral: "bg-line/[0.06] text-fg-2 border-line/10",
  accent: "bg-accent/10 text-accent border-accent/25",
  success: "bg-success/10 text-success border-success/25",
  warning: "bg-warning/10 text-warning border-warning/25",
  danger: "bg-danger/10 text-danger border-danger/25",
  info: "bg-info/10 text-info border-info/25",
  violet: "bg-violet/10 text-violet border-violet/25",
};

export function Badge({ tone = "neutral", className, children, dot }: { tone?: Tone; className?: string; children: React.ReactNode; dot?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 h-5 px-2 rounded-md border text-[11px] font-medium whitespace-nowrap", TONE[tone], className)}>
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

// Marca de cor de uma entidade (pilar, tipo) ao lado de texto neutro.
export function ColorDot({ color, className }: { color: string; className?: string }) {
  return <span className={cn("inline-block w-2 h-2 rounded-[3px] flex-none", className)} style={{ background: color }} />;
}

export function StatusDot({ tone, pulse }: { tone: "success" | "warning" | "danger" | "neutral"; pulse?: boolean }) {
  const c = { success: "bg-success", warning: "bg-warning", danger: "bg-danger", neutral: "bg-fg-3" }[tone];
  return (
    <span className="relative inline-flex w-2 h-2 flex-none">
      {pulse && <span className={cn("absolute inset-0 rounded-full opacity-60 animate-ping", c)} />}
      <span className={cn("relative w-2 h-2 rounded-full", c)} />
    </span>
  );
}
