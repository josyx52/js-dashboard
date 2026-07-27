"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

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
        <div className="w-8 h-8 rounded-[10px] bg-accent flex items-center justify-center font-mono font-extrabold text-bg text-sm">
          JS
        </div>
        <span className="font-semibold text-sm">JS</span>
      </div>
      <div className="text-[10px] font-mono tracking-wider text-muted px-2.5 mb-1.5">
        VISÃO GERAL
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
    </aside>
  );
}
