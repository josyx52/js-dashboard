// Sessao assinada com HMAC-SHA256 usando APP_PASSWORD como chave — sem
// tabela de sessoes nem Supabase Auth. Mudar a APP_PASSWORD invalida todas
// as sessoes. Usa so Web Crypto, para correr igual no middleware, nas rotas
// e no handler `scheduled` do Worker.

export const SESSION_COOKIE = "jsd_session";
export const SESSION_DAYS = 30;

const enc = new TextEncoder();

function toBase64Url(buf: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  return toBase64Url(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
}

// Comparacao em tempo constante — evita revelar o valor por timing.
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSessionToken(secret: string): Promise<string> {
  const exp = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  return `${exp}.${await hmac(secret, `session:${exp}`)}`;
}

export async function verifySessionToken(secret: string, token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const [expStr, sig] = token.split(".");
  const exp = Number(expStr);
  if (!exp || !sig || exp < Date.now()) return false;
  return safeEqual(sig, await hmac(secret, `session:${exp}`));
}

// Chave usada pelo cron (handler `scheduled` em worker.ts) para chamar
// /api/sync sem cookie. Derivada da APP_PASSWORD para nao exigir outro secret.
export function cronKey(secret: string): Promise<string> {
  return hmac(secret, "cron-sync");
}
