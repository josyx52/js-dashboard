"use client";
import HolidayChat from "@/components/HolidayChat";

// O Holiday e o agente inteiro: chat (texto ou voz), fotos de refeicoes
// (antiga calculadora) e GTD (que tarefas sao tuas e quais delegaste a ele).
// Ocupa o ecra todo: no telemovel desconta o cabecalho (52px) e o espaco que
// o <main> reserva para a barra de baixo (72px), para o compositor ficar
// sempre visivel por cima da navegacao.
export default function AgentePage() {
  return (
    <div className="flex flex-col h-[calc(100dvh-52px-72px)] md:h-screen md:p-6 lg:px-8">
      <HolidayChat />
    </div>
  );
}
