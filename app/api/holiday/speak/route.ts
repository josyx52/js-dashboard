import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Voz do Holiday com a ElevenLabs (voz feminina, modelo multilingue).
// Sem ELEVENLABS_API_KEY devolve 501 e o browser usa a voz do sistema.
// ELEVENLABS_VOICE_ID / ELEVENLABS_MODEL permitem trocar voz e modelo.
const DEFAULT_VOICE = "EXAVITQu4vr4xnSDxMaL"; // "Sarah" — voz feminina pre-feita da ElevenLabs
const DEFAULT_MODEL = "eleven_multilingual_v2";

export async function POST(req: NextRequest) {
  try {
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) return NextResponse.json({ error: "ELEVENLABS_API_KEY nao configurado", fallback: true }, { status: 501 });

    const { text } = await req.json();
    const clean = String(text || "").replace(/[*_#`>]/g, "").trim().slice(0, 2500);
    if (!clean) return NextResponse.json({ error: "texto obrigatorio" }, { status: 400 });

    const voice = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE;
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({
        text: clean,
        model_id: process.env.ELEVENLABS_MODEL || DEFAULT_MODEL,
        voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true },
      }),
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      return NextResponse.json({ error: `ElevenLabs HTTP ${r.status}: ${detail.slice(0, 200)}`, fallback: true }, { status: 502 });
    }
    return new NextResponse(r.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e), fallback: true }, { status: 500 });
  }
}
