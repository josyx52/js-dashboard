export default function PillarCard(props: {
  label: string;
  color: string;
  today: number;
  overdue: number;
}) {
  return (
    <div className="border border-white/[0.08] bg-surface rounded-md p-[14px] flex flex-col gap-2 min-w-0">
      <div className="flex items-center gap-2">
        <div className="w-[7px] h-[7px] rounded-[1px] flex-none" style={{ background: props.color }} />
        <span className="font-mono font-semibold text-[11px] tracking-[0.05em] text-white/50 uppercase">
          {props.label}
        </span>
      </div>
      <div className="flex items-baseline gap-2.5">
        <span className="font-mono font-bold text-[28px] leading-none">{props.today}</span>
        <span className="font-sans font-medium text-[12px] text-white/40">hoje</span>
      </div>
      <div
        className="font-mono font-medium text-[11px]"
        style={{ color: props.overdue > 0 ? "#F54E00" : "rgba(244,244,242,0.3)" }}
      >
        {props.overdue} atrasada(s)
      </div>
    </div>
  );
}
