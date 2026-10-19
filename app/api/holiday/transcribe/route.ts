import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024;

// Voz -> texto com o Whisper da Groq (mesma GROQ_API_KEY). Recebe o audio
// gravado no browser (multipart, campo "audio").
export async function POST(req: NextRequest) {
  try {
    const key = process.env.GROQ_API_KEY;
    if (!key) return NextResponse.json({ error: "GROQ_API_KEY nao configurado" }, { status: 500 });

    const form = await req.formData();
    const audio = form.get("audio");
    if (!(audio instanceof Blob) || audio.size === 0) {
      return NextResponse.json({ error: "audio obrigatorio" }, { status: 400 });
    }
    if (audio.size > MAX_BYTES) return NextResponse.json({ error: "audio demasiado longo" }, { status: 400 });

    const type = audio.type || "audio/webm";
    const ext = type.includes("mp4") || type.includes("m4a") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
    const out = new FormData();
    out.append("file", audio, `voz.${ext}`);
    out.append("model", "whisper-large-v3-turbo");
    out.append("language", "pt");
    out.append("response_format", "json");

    const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: out,
    });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok) return NextResponse.json({ error: `Whisper HTTP ${r.status}: ${j?.error?.message || ""}` }, { status: 502 });
    return NextResponse.json({ ok: true, text: String(j.text || "").trim() });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
