import { cn } from "@/lib/cn";
import { Card } from "@/components/ui";

// Indicador: rotulo, valor grande e uma linha de contexto.
export function StatTile(props: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "default" | "danger" | "warning" | "success";
  onClick?: () => void;
  active?: boolean;
}) {
  const tone = { default: "text-fg", danger: "text-danger", warning: "text-warning", success: "text-success" }[props.tone || "default"];
  const Comp: any = props.onClick ? "button" : "div";
  return (
    <Card className={cn("p-0 overflow-hidden transition-colors", props.onClick && "hover:border-line/15", props.active && "border-line/20 bg-surface-2")}>
      <Comp onClick={props.onClick} className="w-full text-left px-4 py-3.5 flex flex-col gap-1">
        <span className="text-[12px] font-medium text-fg-3">{props.label}</span>
        <span className={cn("text-[26px] font-semibold leading-none tracking-[-0.02em]", tone)}>{props.value}</span>
        {props.hint && <span className="text-[11.5px] text-fg-3 mt-0.5">{props.hint}</span>}
      </Comp>
    </Card>
  );
}
