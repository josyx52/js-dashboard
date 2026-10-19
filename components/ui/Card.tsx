import { cn } from "@/lib/cn";

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("bg-surface border border-line/[0.07] rounded-card", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader(props: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start gap-3 px-5 pt-4 pb-3", props.className)}>
      <div className="flex-1 min-w-0">
        <h3 className="text-[13.5px] font-semibold text-fg leading-tight">{props.title}</h3>
        {props.description && <p className="text-[12.5px] text-fg-3 mt-1 leading-snug">{props.description}</p>}
      </div>
      {props.actions && <div className="flex items-center gap-2 flex-none">{props.actions}</div>}
    </div>
  );
}
