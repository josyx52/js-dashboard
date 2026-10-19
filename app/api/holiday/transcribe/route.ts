import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { setSetting } from "@/lib/settings";

export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024;

// Chave da ElevenLabs recusada (401/402/403): salta-a durante 10 min em vez de
// gastar um pedido falhado em cada frase da conversa.
let elevenDownUntil = 0;

class RateLimited extends Error {}

// Frases que os modelos de transcricao "inventam" em silencio/ruido.
const HALLUCINATIONS = /^(obrigad[oa][.!]?|legendas? pela comunidade.*|tchau[.!]?|\.+|…)$/i;

function fileName(type: string) {
  const ext = type.includes("mp4") || type.includes("m4a") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
  return `voz.${ext}`;
}

// 1º ElevenLabs Scribe
async function elevenLabs(audio: Blob): Promise<string> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("sem ELEVENLABS_API_KEY");
  if (Date.now() < elevenDownUntil) throw new Error("ElevenLabs em pausa (chave recusada ha pouco)");
  const form = new FormData();
  form.append("file", audio, fileName(audio.type));
  form.append("model_id", "scribe_v1");
  form.append("language_code", "por");
  form.append("tag_audio_events", "false");
  const r = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": key },
    body: form,
  });
  const j: any = await r.json().catch(() => ({}));
  if ([401, 402, 403].includes(r.status)) elevenDownUntil = Date.now() + 10 * 60_000;
  if (!r.ok) throw new Error(`ElevenLabs HTTP ${r.status}${r.status === 401 ? " (chave invalida)" : ""}`);
  return String(j.text || "").trim();
}

// 2º Whisper da Groq (reserva quando a ElevenLabs falha ou nao esta configurada)
async function whisper(audio: Blob): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("sem GROQ_API_KEY");
  const form = new FormData();
  form.append("file", audio, fileName(audio.type));
  form.append("model", "whisper-large-v3-turbo");
  form.append("language", "pt");
  form.append("response_format", "json");
  const post = () => fetch("https://api.groq.com/openai/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form });
  let r = await post();
  if (r.status === 429) {
    // Limite por minuto do plano gratuito: espera o que a Groq pede (ate 3 s) e tenta uma vez.
    const wait = Math.min(3, Number(r.headers.get("retry-after")) || 2);
    await new Promise((res) => setTimeout(res, wait * 1000));
    r = await post();
  }
  const j: any = await r.json().catch(() => ({}));
  if (r.status === 429) throw new RateLimited(`Whisper: limite de pedidos da Groq (${String(j?.error?.message || "").slice(0, 100)})`);
  if (!r.ok) throw new Error(`Whisper HTTP ${r.status}: ${String(j?.error?.message || "").slice(0, 120)}`);
  return String(j.text || "").trim();
}

// Voz -> texto. Recebe o audio gravado no browser (multipart, campo "audio").
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const audio = form.get("audio");
    if (!(audio instanceof Blob) || audio.size === 0) {
      return NextResponse.json({ error: "audio obrigatorio" }, { status: 400 });
    }
    if (audio.size > MAX_BYTES) return NextResponse.json({ error: "audio demasiado longo" }, { status: 400 });

    const errors: string[] = [];
    let limited = false;
    for (const [provider, fn] of [
      ["elevenlabs", elevenLabs],
      ["whisper", whisper],
    ] as const) {
      try {
        let text = await fn(audio);
        if (HALLUCINATIONS.test(text)) text = "";
        return NextResponse.json({ ok: true, text, provider });
      } catch (e: any) {
        if (e instanceof RateLimited) limited = true;
        errors.push(`${provider}: ${e?.message || e}`);
      }
    }
    const error = "transcricao falhou — " + errors.join(" · ");
    // Fica registado para diagnostico (Integracoes / suporte), sem o audio.
    await setSetting(supabaseServer(), "voice_last_error", { at: new Date().toISOString(), error, bytes: audio.size, type: audio.type }).catch(() => {});
    return NextResponse.json({ error, code: limited ? "rate_limit" : "failed" }, { status: limited ? 429 : 502 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
