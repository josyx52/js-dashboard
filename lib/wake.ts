// Palavra de ativacao: com a TV ligada, o Holiday so reage quando o chamas
// pelo nome — ou durante uma conversa ja em curso (resposta ha pouco tempo).
// Tolerante aos erros da transcricao ("holidei", "olidei", "hollyday"...).
const WAKE = /(?<!\p{L})(h?o+l+[iy]+d[ae]+[iy]+|h?o+l+[iy]+day|h?o+l+i+dei|holly ?day)(?!\p{L})/iu;

export const FOLLOW_UP_MS = 20_000;

export function mentionsHoliday(text: string): boolean {
  return WAKE.test(text);
}

// A frase e para o Holiday? Chamado pelo nome, ou ainda dentro da janela de
// conversa depois da ultima resposta dele.
export function addressedToHoliday(text: string, msSinceLastReply: number): boolean {
  return mentionsHoliday(text) || msSinceLastReply <= FOLLOW_UP_MS;
}
