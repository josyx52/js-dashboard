// Pedido explicito = consentimento. Se ele proprio pediu, na mensagem, para o
// lembrar/agendar, criar o evento no Google Calendar nao precisa de cartao de
// aprovacao (como faria uma pessoa). O resto de risco alto continua a pedir.
const ASKS_CALENDAR = /(lembr[ae]|lembrete|avis[ae]-?me|agend[ae]|marc[ae]|p[oõ]e na agenda|no calend[aá]rio|na agenda|evento)/i;

export function explicitlyAsked(type: string, message: string): boolean {
  if (type === "schedule_event") return ASKS_CALENDAR.test(message);
  return false;
}
