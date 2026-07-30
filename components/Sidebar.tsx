"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PILLARS } from "@/lib/types";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/nutricao", label: "Nutrição" },
  { href: "/integracoes", label: "Integrações" },
  { href: "/agendar", label: "Agendar" },
  { href: "/agente", label: "Agente" },
];

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-[220px] shrink-0 border-r border-border p-4 flex flex-col gap-1">
      <div className="flex items-center gap-2 px-2 mb-6">
        <div className="w-8 h-8 rounded bg-accent flex items-center justify-center font-mono font-bold text-bg text-sm">
          JS
        </div>
        <span className="font-semibold text-sm">JS</span>
      </div>
      <div className="text-[10px] font-mono font-semibold tracking-wider text-faint px-2.5 mb-1.5 uppercase">
        Visão geral
      </div>
      {NAV.map((item) => {
        const active = pathname?.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              "flex items-center gap-2.5 px-2.5 py-2 rounded text-[13px] font-medium transition-colors " +
              (active ? "bg-white/[0.06] text-white" : "text-muted hover:bg-white/[0.03] hover:text-white")
            }
          >
            {item.label}
          </Link>
        );
      })}

      <div className="mt-auto p-2.5 border border-border rounded flex flex-col gap-1.5">
        <div className="text-[10px] font-mono font-semibold tracking-wider text-faint">PILARES</div>
        {PILLARS.map((p) => (
          <div key={p.key} className="flex items-center gap-2 text-[12px] font-medium text-white/70">
            <div className="w-1.5 h-1.5 rounded-[1px]" style={{ background: p.color }} />
            {p.label}
          </div>
        ))}
      </div>
    </aside>
  );
}
