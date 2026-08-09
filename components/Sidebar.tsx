"use client";
import { usePathname, useRouter } from "next/navigation";
import { PILLARS } from "@/lib/types";
import { IconDashboard, IconNutricao, IconPlug, IconAgendar, IconAgente } from "@/components/icons";

const NAV = [
  { href: "/dashboard", label: "Dashboard", Icon: IconDashboard },
  { href: "/nutricao", label: "Nutrição", Icon: IconNutricao },
  { href: "/integracoes", label: "Integrações", Icon: IconPlug },
  { href: "/agendar", label: "Agendar", Icon: IconAgendar },
  { href: "/agente", label: "Agente", Icon: IconAgente },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  return (
    <div className="w-full md:w-[224px] flex-none border-b md:border-b-0 md:border-r border-white/[0.08] p-[10px_12px] md:p-[20px_14px] flex flex-row md:flex-col gap-2 md:gap-[26px] items-center md:items-stretch overflow-x-auto md:overflow-visible">
      <div className="flex items-center gap-2.5 px-1.5 py-1 flex-none">
        <div className="w-7 h-7 flex-none bg-accent rounded flex items-center justify-center font-mono font-extrabold text-[13px] text-bg">
          JS
        </div>
      </div>

      <div className="hidden md:block font-mono font-semibold text-[10px] tracking-[0.08em] text-white/35 px-2.5 mb-[-8px]">
        VISÃO GERAL
      </div>
      <div className="flex flex-row md:flex-col gap-0.5 flex-none">
        {NAV.map((item) => {
          const active = pathname?.startsWith(item.href);
          return (
            <div
              key={item.href}
              onClick={() => router.push(item.href)}
              className={
                "flex items-center gap-2.5 px-2.5 py-[9px] rounded cursor-pointer font-sans font-semibold text-[13px] transition-colors whitespace-nowrap flex-none " +
                (active ? "bg-white/[0.06] text-accent" : "text-white/60 hover:bg-white/[0.04]")
              }
            >
              <item.Icon className="w-4 h-4 flex-none" />
              <span className="hidden sm:inline md:inline">{item.label}</span>
            </div>
          );
        })}
      </div>

      <div className="hidden md:flex mt-auto p-2.5 border border-white/[0.08] rounded flex-col gap-1.5">
        <div className="font-mono font-semibold text-[10px] tracking-[0.06em] text-white/35">PILARES</div>
        {PILLARS.map((p) => (
          <div key={p.key} className="flex items-center gap-2 font-sans font-medium text-[12px] text-white/70">
            <div style={{ width: 7, height: 7, borderRadius: 1, background: p.color, flexShrink: 0 }} />
            {p.label}
          </div>
        ))}
      </div>
    </div>
  );
}
