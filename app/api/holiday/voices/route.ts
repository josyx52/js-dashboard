import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { DEFAULT_VOICE, getSetting, setSetting, type VoiceSetting } from "@/lib/settings";

export const runtime = "nodejs";

// Vozes femininas em portugues da biblioteca partilhada da ElevenLabs, e a voz atual.
export async function GET(req: NextRequest) {
  try {
    const sb = supabaseServer();
    const current = { ...DEFAULT_VOICE, ...((await getSetting<VoiceSetting>(sb, "tts_voice")) || {}) };
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) return NextResponse.json({ ok: true, current, voices: [], error: "ELEVENLABS_API_KEY não configurado" });

    const accent = req.nextUrl.searchParams.get("accent") || "";
    const url = new URL("https://api.elevenlabs.io/v1/shared-voices");
    url.searchParams.set("page_size", "24");
    url.searchParams.set("gender", "female");
    url.searchParams.set("language", "pt");
    url.searchParams.set("sort", "trending");
    if (accent) url.searchParams.set("accent", accent);
    const r = await fetch(url, { headers: { "xi-api-key": key } });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok) return NextResponse.json({ ok: true, current, voices: [], error: `ElevenLabs HTTP ${r.status}` });

    const voices = (j.voices || []).map((v: any) => ({
      public_owner_id: v.public_owner_id,
      voice_id: v.voice_id,
      name: v.name,
      accent: v.accent || null,
      age: v.age || null,
      use_case: v.use_case || null,
      description: String(v.description || "").slice(0, 160),
      preview_url: v.preview_url || null,
    }));
    // Sotaque de Portugal primeiro.
    voices.sort((a: any, b: any) => Number(/portug|europe|lisb/i.test(b.accent || "")) - Number(/portug|europe|lisb/i.test(a.accent || "")));
    return NextResponse.json({ ok: true, current, voices });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}

// Escolher voz: { public_owner_id, voice_id, name } (adiciona a tua biblioteca)
// ou so trocar qualidade: { quality: "natural" | "rapida" }.
export async function POST(req: NextRequest) {
  try {
    const sb = supabaseServer();
    const body = await req.json();
    const current = { ...DEFAULT_VOICE, ...((await getSetting<VoiceSetting>(sb, "tts_voice")) || {}) };

    if (body.quality && !body.voice_id) {
      const next = { ...current, quality: body.quality === "rapida" ? "rapida" : "natural" } as VoiceSetting;
      await setSetting(sb, "tts_voice", next);
      return NextResponse.json({ ok: true, current: next });
    }

    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) return NextResponse.json({ error: "ELEVENLABS_API_KEY não configurado" }, { status: 400 });
    const { public_owner_id, voice_id, name } = body;
    if (!public_owner_id || !voice_id) return NextResponse.json({ error: "voz invalida" }, { status: 400 });

    // Vozes partilhadas tem de estar na tua biblioteca para poderem falar.
    const r = await fetch(`https://api.elevenlabs.io/v1/voices/add/${public_owner_id}/${voice_id}`, {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ new_name: `Holiday — ${String(name || "voz").slice(0, 40)}` }),
    });
    const j: any = await r.json().catch(() => ({}));
    // Ja estava na biblioteca: usa o id original.
    const libraryId = r.ok ? j.voice_id : /already|exists/i.test(JSON.stringify(j)) ? voice_id : null;
    if (!libraryId) return NextResponse.json({ error: `ElevenLabs: ${j?.detail?.message || j?.detail || r.status}` }, { status: 502 });

    const next: VoiceSetting = { voice_id: libraryId, name: String(name || "voz"), quality: current.quality };
    await setSetting(sb, "tts_voice", next);
    return NextResponse.json({ ok: true, current: next });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
