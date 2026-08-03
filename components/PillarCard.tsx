export default function PillarCard(props: {
  label: string;
  color: string;
  today: number;
  overdue: number;
}) {
  return (
    <div style={{ border: "1px solid rgba(255,255,255,0.08)", background: "#14161B", borderRadius: 6, padding: 14, display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 8, height: 8, background: props.color, borderRadius: 1 }} />
        <span style={{ font: "600 11px 'JetBrains Mono',monospace", letterSpacing: "0.05em", color: "rgba(244,244,242,0.5)" }}>
          {props.label.toUpperCase()}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span style={{ font: "700 28px 'JetBrains Mono',monospace" }}>{props.today}</span>
        <span style={{ font: "500 12px Inter,sans-serif", color: "rgba(244,244,242,0.4)" }}>hoje</span>
      </div>
      <div style={{ font: "500 11px 'JetBrains Mono',monospace", color: props.overdue > 0 ? "#F54E00" : "rgba(244,244,242,0.3)" }}>
        {props.overdue} atrasada(s)
      </div>
    </div>
  );
}
