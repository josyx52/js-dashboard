// Rede de seguranca da honestidade: o modelo as vezes diz "ja marquei" quando
// a acao (de risco alto) ainda so esta PROPOSTA, a espera de aprovacao.
// Se a resposta afirma que fez e ha propostas por aprovar, troca-a por uma
// frase verdadeira e deterministica.

// \b nao funciona com acentos: fronteiras de palavra com classes Unicode.
const CLAIMS_DONE =
  /(?<!\p{L})(marquei|conclu[ií]|j[aá] (?:est[aá]|ficou|fiz|tratei|marquei|conclu[ií])|tratei|criei|agendei|reagendei|apaguei|feito|pronto)(?!\p{L})/iu;

export function claimsDone(text: string): boolean {
  return CLAIMS_DONE.test(text);
}

export function honestReply(summaries: string[], voice: boolean): string {
  const n = summaries.length;
  if (voice) {
    const what = n === 1 ? summaries[0].replace(/^[^:]+:\s*/, "") : `${n} coisas`;
    return n === 1
      ? `Preparei isto para aprovares: ${what}. Queres que avance?`
      : `Preparei ${what} para aprovares. Queres que avance com todas?`;
  }
  return `Ainda não fiz nada disto — preparei ${n === 1 ? "esta ação" : `estas ${n} ações`} e precisam da tua aprovação:\n` + summaries.map((s) => `- ${s}`).join("\n");
}
