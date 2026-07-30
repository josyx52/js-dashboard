export default function PillarCard(props: {
  label: string;
  color: string;
  today: number;
  overdue: number;
}) {
  return (
    <div className="bg-surface border border-border rounded-md p-4 flex flex-col gap-1 min-w-[140px]">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-[1px]" style={{ background: props.color }} />
        <span className="text-[12px] text-muted font-medium">{props.label}</span>
      </div>
      <div className="text-2xl font-bold mt-1">{props.today}</div>
      <div className="text-[11px] text-muted font-mono">
        hoje{props.overdue > 0 ? ` · ${props.overdue} atrasada(s)` : ""}
      </div>
    </div>
  );
}
