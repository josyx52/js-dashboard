"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import {
  IconDashboard,
  IconNutricao,
  IconPlug,
  IconAgendar,
  IconAgente,
  IconAutomacao,
  IconMore,
  IconLogout,
} from "@/components/icons";

type Item = { href: string; label: string; Icon: (p: { className?: string }) => React.ReactElement };

const GROUPS: { label: string; items: Item[] }[] = [
  {
    label: "Principal",
    items: [
      { href: "/dashboard", label: "Dashboard", Icon: IconDashboard },
      { href: "/agente", label: "Holiday", Icon: IconAgente },
      { href: "/automacoes", label: "Automações", Icon: IconAutomacao },
    ],
  },
  {
    label: "Vida",
    items: [
      { href: "/nutricao", label: "Nutrição", Icon: IconNutricao },
      { href: "/agendar", label: "Agenda", Icon: IconAgendar },
    ],
  },
  { label: "Sistema", items: [{ href: "/integracoes", label: "Integrações", Icon: IconPlug }] },
];
const ALL = GROUPS.flatMap((g) => g.items);
// No telemovel: 4 atalhos + "Mais" com o resto.
const MOBILE_MAIN = ["/dashboard", "/agente", "/automacoes", "/nutricao"];

async function logout() {
  await fetch("/api/auth/login", { method: "DELETE" }).catch(() => {});
  window.location.href = "/login";
}

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-7 h-7 rounded-lg bg-accent text-white flex items-center justify-center text-[12px] font-bold tracking-tight">JS</div>
      <div className="leading-tight">
        <div className="text-[13px] font-semibold text-fg">Sistema JS</div>
        <div className="text-[11px] text-fg-3">6 pilares</div>
      </div>
    </div>
  );
}

export default function Sidebar() {
  const pathname = usePathname() || "";
  const [more, setMore] = useState(false);
  const isActive = (href: string) => pathname.startsWith(href);

  return (
    <>
      {/* Computador */}
      <aside className="hidden md:flex w-[232px] flex-none flex-col border-r border-line/[0.07] bg-bg h-screen sticky top-0">
        <div className="px-4 pt-5 pb-6">
          <Logo />
        </div>
        <nav className="flex-1 px-2.5 flex flex-col gap-5 overflow-y-auto" aria-label="Navegação">
          {GROUPS.map((g) => (
            <div key={g.label}>
              <div className="px-2.5 mb-1.5 text-[11px] font-medium text-fg-3">{g.label}</div>
              <div className="flex flex-col gap-0.5">
                {g.items.map(({ href, label, Icon }) => {
                  const active = isActive(href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group flex items-center gap-2.5 h-8 px-2.5 rounded-lg text-[13px] font-medium no-underline hover:no-underline transition-colors",
                        active ? "bg-line/[0.07] text-fg" : "text-fg-2 hover:text-fg hover:bg-line/[0.04]"
                      )}
                    >
                      <Icon className={cn("w-4 h-4 flex-none", active ? "text-accent" : "text-fg-3 group-hover:text-fg-2")} />
                      {label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="p-2.5 border-t border-line/[0.07]">
          <button
            onClick={logout}
            className="w-full flex items-center gap-2.5 h-8 px-2.5 rounded-lg text-[13px] font-medium text-fg-3 hover:text-fg hover:bg-line/[0.04] transition-colors"
          >
            <IconLogout className="w-4 h-4" />
            Sair
          </button>
        </div>
      </aside>

      {/* Telemovel: cabecalho */}
      <header className="md:hidden sticky top-0 z-30 h-[52px] flex items-center px-4 border-b border-line/[0.07] bg-bg/90 backdrop-blur">
        <Logo />
      </header>

      {/* Telemovel: barra de navegacao em baixo */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 h-[62px] pb-[env(safe-area-inset-bottom)] border-t border-line/[0.08] bg-bg/95 backdrop-blur flex"
        aria-label="Navegação"
      >
        {ALL.filter((i) => MOBILE_MAIN.includes(i.href)).map(({ href, label, Icon }) => {
          const active = isActive(href);
          return (
            <Link key={href} href={href} className={cn("flex-1 flex flex-col items-center justify-center gap-1 no-underline hover:no-underline", active ? "text-fg" : "text-fg-3")}>
              <Icon className={cn("w-5 h-5", active && "text-accent")} />
              <span className="text-[10.5px] font-medium">{label}</span>
            </Link>
          );
        })}
        <button onClick={() => setMore(true)} className={cn("flex-1 flex flex-col items-center justify-center gap-1", more ? "text-fg" : "text-fg-3")}>
          <IconMore className="w-5 h-5" />
          <span className="text-[10.5px] font-medium">Mais</span>
        </button>
      </nav>

      {more && (
        <div className="md:hidden fixed inset-0 z-50 bg-black/60" onClick={() => setMore(false)}>
          <div className="absolute bottom-0 inset-x-0 bg-surface border-t border-line/10 rounded-t-2xl p-3 pb-[calc(12px+env(safe-area-inset-bottom))] animate-fade-up" onClick={(e) => e.stopPropagation()}>
            <div className="w-10 h-1 rounded-full bg-line/15 mx-auto mb-3" />
            {ALL.filter((i) => !MOBILE_MAIN.includes(i.href)).map(({ href, label, Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMore(false)}
                className="flex items-center gap-3 h-12 px-3 rounded-xl text-[14px] font-medium text-fg no-underline hover:no-underline hover:bg-line/[0.05]"
              >
                <Icon className="w-5 h-5 text-fg-2" />
                {label}
              </Link>
            ))}
            <button onClick={logout} className="w-full flex items-center gap-3 h-12 px-3 rounded-xl text-[14px] font-medium text-fg-2 hover:bg-line/[0.05]">
              <IconLogout className="w-5 h-5" />
              Sair
            </button>
          </div>
        </div>
      )}
    </>
  );
}
