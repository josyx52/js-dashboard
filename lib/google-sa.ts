// Conta de servico da Google (Service Account): a app entra com uma chave
// propria em vez de um refresh token — sem ecra de consentimento, sem
// verificacao da app e sem expirar. O calendario do utilizador e partilhado
// com o email da conta de servico ("Fazer alteracoes nos eventos").
// Secret: GOOGLE_SERVICE_ACCOUNT_JSON (o ficheiro JSON da chave, inteiro).

const SCOPE = "https://www.googleapis.com/auth/calendar";
let cache: { token: string; exp: number } | null = null;

function b64url(data: ArrayBuffer | string) {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToDer(pem: string) {
  const body = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

export function parseServiceAccount(raw: string | undefined): { client_email: string; private_key: string } | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw);
    return j.client_email && j.private_key ? { client_email: j.client_email, private_key: j.private_key } : null;
  } catch {
    return null;
  }
}

export async function serviceAccountToken(raw: string): Promise<{ token: string | null; error?: string }> {
  if (cache && cache.exp > Date.now() + 60_000) return { token: cache.token };
  const sa = parseServiceAccount(raw);
  if (!sa) return { token: null, error: "GOOGLE_SERVICE_ACCOUNT_JSON invalido (cola o ficheiro JSON da chave inteiro)" };
  try {
    const now = Math.floor(Date.now() / 1000);
    const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
    const key = await crypto.subtle.importKey("pkcs8", pemToDer(sa.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claims}`));
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${header}.${claims}.${b64url(sig)}` }),
    });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) return { token: null, error: `conta de servico: ${j.error_description || j.error || `HTTP ${r.status}`}` };
    cache = { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
    return { token: j.access_token };
  } catch (e: any) {
    return { token: null, error: `conta de servico: ${e?.message || e}` };
  }
}
