"use client";
import { usePathname, useRouter } from "next/navigation";
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
  const router = useRouter();
  return (
    <div className="w-[224px] flex-none border-r border-white/[0.08] p-[20px_14px] flex flex-col gap-[26px]">
      <div className="flex items-center gap-2.5 px-1.5 py-1">
        <div className="w-7 h-7 flex-none bg-accent rounded flex items-center justify-center font-mono font-extrabold text-[13px] text-bg">
          JS
        </div>
      </div>

      <div className="flex flex-col gap-0.5">
        <div className="font-mono font-semibold text-[10px] tracking-[0.08em] text-white/35 px-2.5 mb-1.5">
          VISÃO GERAL
        </div>
        {NAV.map((item) => {
          const active = pathname?.startsWith(item.href);
          return (
            <div
              key={item.href}
              onClick={() => router.push(item.href)}
              className={
                "flex items-center gap-2.5 px-2.5 py-[9px] rounded cursor-pointer font-sans font-semibold text-[13px] transition-colors " +
                (active ? "bg-white/[0.06] text-white" : "text-white/60 hover:bg-white/[0.04]")
              }
            >
              {item.label}
            </div>
          );
        })}
      </div>

      <div className="mt-auto p-2.5 border border-white/[0.08] rounded flex flex-col gap-1.5">
        <div className="font-mono font-semibold text-[10px] tracking-[0.06em] text-white/35">PILARES</div>
        {PILLARS.map((p) => (
          <div key={p.key} className="flex items-center gap-2 font-sans font-medium text-[12px] text-white/70">
            <div className="w-[7px] h-[7px] rounded-[1px] flex-none" style={{ background: p.color }} />
            {p.label}
          </div>
        ))}
      </div>
    </div>
  );
}
