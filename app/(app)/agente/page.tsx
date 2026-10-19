"use client";
import HolidayChat from "@/components/HolidayChat";

// O Holiday e o agente inteiro: chat (texto ou voz), fotos de refeicoes
// (antiga calculadora) e GTD (que tarefas sao tuas e quais delegaste a ele).
export default function AgentePage() {
  return (
    <div className="flex flex-col h-[calc(100dvh-57px)] md:h-screen box-border p-3 sm:p-[28px_36px]">
      <HolidayChat />
    </div>
  );
}
