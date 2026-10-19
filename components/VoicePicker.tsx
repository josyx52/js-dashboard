"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { speak } from "@/lib/speech";

interface Voice {
  public_owner_id: string;
  voice_id: string;
  name: string;
  accent: string | null;
  age: string | null;
  use_case: string | null;
  description: string;
  preview_url: string | null;
}
interface Current {
  voice_id: string;
  name: string;
  quality: "natural" | "rapida";
}

const mono = (w: number, size: number) => `${w} ${size}px 'JetBrains Mono',monospace`;
const btn = (color: string, filled = false): React.CSSProperties => ({
  font: mono(700, 10), color: filled ? "#0B0C10" : color, background: filled ? color : "transparent",
  border: `1px solid ${filled ? color : "rgba(255,255,255,0.14)"}`, borderRadius: 3, padding: "6px 10px", cursor: "pointer", whiteSpace: "nowrap",
});

// Escolher a voz do Holiday entre vozes femininas em portugues da ElevenLabs.
export default function VoicePicker() {
  const [current, setCurrent] = useState<Current | null>(null);
  const [voices, setVoices] = useState<Voice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  async function load() {
    try {
      const d = await api<{ current: Current; voices: Voice[]; error?: string }>("/api/holiday/voices");
      setCurrent(d.current);
      setVoices(d.voices);
      if (d.error) setError(d.error);
    } catch (e: any) {
      setError(e.message);
      setVoices([]);
    }
  }

  useEffect(() => {
    load();
    return () => audioRef.current?.pause();
  }, []);

  function preview(v: Voice) {
    audioRef.current?.pause();
    if (playing === v.voice_id || !v.preview_url) {
      setPlaying(null);
      return;
    }
    const a = new Audio(v.preview_url);
    a.onended = () => setPlaying(null);
    audioRef.current = a;
    a.play().catch(() => setPlaying(null));
    setPlaying(v.voice_id);
  }

  async function choose(v: Voice) {
    setBusy(v.voice_id);
    setError(null);
    try {
      const d = await api<{ current: Current }>("/api/holiday/voices", {
        body: { public_owner_id: v.public_owner_id, voice_id: v.voice_id, name: v.name },
      });
      setCurrent(d.current);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function setQuality(q: "natural" | "rapida") {
    try {
      const d = await api<{ current: Current }>("/api/holiday/voices", { body: { quality: q } });
      setCurrent(d.current);
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <div style={{ border: "1px solid rgba(255,255,255,0.08)", background: "#14161B", borderRadius: 6, padding: 18 }} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span style={{ font: "700 15px Inter,sans-serif" }}>Voz do Holiday</span>
        <span style={{ font: mono(600, 10), color: "rgba(244,244,242,0.45)" }}>ElevenLabs · vozes femininas em português</span>
        <button onClick={() => speak("Olá Josuel, sou o Holiday. Como posso ajudar hoje?")} style={{ ...btn("#F54E00"), marginLeft: "auto" }}>
          OUVIR A VOZ ATUAL
        </button>
      </div>
      {current && (
        <div className="flex flex-wrap items-center gap-3" style={{ font: "500 12.5px Inter,sans-serif", color: "rgba(244,244,242,0.7)" }}>
          <span>
            Atual: <b style={{ color: "#F4F4F2" }}>{current.name}</b>
          </span>
          <span className="flex gap-1.5 ml-auto">
            <button onClick={() => setQuality("natural")} style={btn("#3DDC84", current.quality === "natural")} title="Mais humana; meio segundo mais de espera">
              NATURAL
            </button>
            <button onClick={() => setQuality("rapida")} style={btn("#E8B93F", current.quality === "rapida")} title="Responde mais depressa; menos natural">
              RÁPIDA
            </button>
          </span>
        </div>
      )}
      {error && <div style={{ font: mono(500, 11), color: "#FF8A8A" }}>{error}</div>}
      {voices === null && <div style={{ font: "500 12px Inter,sans-serif", color: "rgba(244,244,242,0.4)" }}>a carregar vozes…</div>}
      {voices && voices.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {voices.map((v) => {
            const selected = current?.name === v.name;
            return (
              <div key={v.voice_id} className="flex items-center gap-3" style={{ padding: "10px 12px", borderRadius: 6, background: selected ? "rgba(61,220,132,0.06)" : "rgba(255,255,255,0.025)", border: `1px solid ${selected ? "rgba(61,220,132,0.35)" : "rgba(255,255,255,0.05)"}` }}>
                <button
                  onClick={() => preview(v)}
                  disabled={!v.preview_url}
                  title="Ouvir amostra"
                  style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0, border: "1px solid rgba(255,255,255,0.14)", background: playing === v.voice_id ? "#F54E00" : "transparent", color: playing === v.voice_id ? "#0B0C10" : "#F4F4F2", cursor: "pointer", font: mono(700, 11) }}
                >
                  {playing === v.voice_id ? "■" : "▶"}
                </button>
                <div className="flex-1 min-w-0">
                  <div style={{ font: "600 12.5px Inter,sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.name}</div>
                  <div style={{ font: mono(500, 10), color: "rgba(244,244,242,0.45)" }}>
                    {[v.accent, v.age, v.use_case].filter(Boolean).join(" · ") || "português"}
                  </div>
                </div>
                <button onClick={() => choose(v)} disabled={busy === v.voice_id || selected} style={btn("#3DDC84", selected)}>
                  {selected ? "EM USO" : busy === v.voice_id ? "…" : "USAR"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
