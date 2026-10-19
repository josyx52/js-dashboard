import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024;

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
  if (!r.ok) throw new Error(`ElevenLabs HTTP ${r.status}`);
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
  const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  const j: any = await r.json().catch(() => ({}));
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
    for (const [provider, fn] of [
      ["elevenlabs", elevenLabs],
      ["whisper", whisper],
    ] as const) {
      try {
        let text = await fn(audio);
        if (HALLUCINATIONS.test(text)) text = "";
        return NextResponse.json({ ok: true, text, provider });
      } catch (e: any) {
        errors.push(`${provider}: ${e?.message || e}`);
      }
    }
    return NextResponse.json({ error: "transcricao falhou — " + errors.join(" · ") }, { status: 502 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
