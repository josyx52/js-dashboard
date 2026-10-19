import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Voz do Holiday com a ElevenLabs (voz feminina). GET para o <audio> do
// browser comecar a tocar enquanto o audio ainda chega (streaming) — menos
// espera numa conversa. Sem ELEVENLABS_API_KEY devolve 501 e o browser usa
// a voz do sistema. ELEVENLABS_VOICE_ID / ELEVENLABS_MODEL trocam voz e modelo.
const DEFAULT_VOICE = "EXAVITQu4vr4xnSDxMaL"; // "Sarah" — voz feminina pre-feita
const DEFAULT_MODEL = "eleven_multilingual_v2"; // mais natural
const FAST_MODEL = "eleven_flash_v2_5"; // menor latencia, usado no modo conversa

export async function GET(req: NextRequest) {
  try {
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) return NextResponse.json({ error: "ELEVENLABS_API_KEY nao configurado", fallback: true }, { status: 501 });

    const text = (req.nextUrl.searchParams.get("text") || "").replace(/[*_#`>]/g, "").trim().slice(0, 2000);
    if (!text) return NextResponse.json({ error: "texto obrigatorio" }, { status: 400 });
    const fast = req.nextUrl.searchParams.get("fast") === "1";

    const voice = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE;
    const model = fast ? FAST_MODEL : process.env.ELEVENLABS_MODEL || DEFAULT_MODEL;
    const r = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice}/stream?output_format=mp3_44100_128&optimize_streaming_latency=${fast ? 3 : 0}`,
      {
        method: "POST",
        headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
        body: JSON.stringify({
          text,
          model_id: model,
          language_code: model === FAST_MODEL ? "pt" : undefined,
          voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true },
        }),
      }
    );
    if (!r.ok || !r.body) {
      const detail = await r.text().catch(() => "");
      return NextResponse.json({ error: `ElevenLabs HTTP ${r.status}: ${detail.slice(0, 200)}`, fallback: true }, { status: 502 });
    }
    return new NextResponse(r.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e), fallback: true }, { status: 500 });
  }
}
