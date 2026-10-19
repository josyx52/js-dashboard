"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { speak } from "@/lib/speech";
import { IconPlay, IconStop } from "@/components/icons";
import { Badge, Button, Card, CardHeader, EmptyState, Segmented, Skeleton, useToast } from "@/components/ui";

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

// Escolher a voz do Holiday entre vozes femininas em portugues da ElevenLabs.
export default function VoicePicker() {
  const toast = useToast();
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
    try {
      const d = await api<{ current: Current }>("/api/holiday/voices", {
        body: { public_owner_id: v.public_owner_id, voice_id: v.voice_id, name: v.name },
      });
      setCurrent(d.current);
      toast.success("Voz alterada", v.name);
    } catch (e: any) {
      toast.error("Não foi possível mudar a voz", e.message);
    } finally {
      setBusy(null);
    }
  }

  async function setQuality(q: "natural" | "rapida") {
    try {
      const d = await api<{ current: Current }>("/api/holiday/voices", { body: { quality: q } });
      setCurrent(d.current);
    } catch (e: any) {
      toast.error("Não foi possível mudar a qualidade", e.message);
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Voz do Holiday"
        description="ElevenLabs · vozes femininas em português. Se a ElevenLabs falhar, usa a voz do browser."
        actions={
          <Button size="sm" icon={<IconPlay className="w-3.5 h-3.5" />} onClick={() => speak("Olá Josuel, sou o Holiday. Como posso ajudar hoje?")}>
            Ouvir a atual
          </Button>
        }
      />
      <div className="px-5 pb-5 flex flex-col gap-4">
        {current ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[12.5px] text-fg-2">
              Em uso: <span className="text-fg font-medium">{current.name}</span>
            </span>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-[12px] text-fg-3 hidden sm:inline">{current.quality === "natural" ? "Mais humana, um pouco mais lenta" : "Responde mais depressa"}</span>
              <Segmented<"natural" | "rapida">
                size="sm"
                value={current.quality}
                onChange={setQuality}
                options={[
                  { value: "natural", label: "Natural" },
                  { value: "rapida", label: "Rápida" },
                ]}
              />
            </div>
          </div>
        ) : (
          voices === null && <Skeleton className="h-7 w-64" />
        )}

        {error && <div className="text-[12.5px] text-danger rounded-lg border border-danger/25 bg-danger/[0.06] px-3 py-2">{error}</div>}

        {voices === null && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[58px]" />
            ))}
          </div>
        )}
        {voices && voices.length === 0 && !error && <EmptyState title="Sem vozes disponíveis" description="Confirma a chave da ElevenLabs." className="py-6" />}
        {voices && voices.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {voices.map((v) => {
              const selected = current?.name === v.name;
              const isPlaying = playing === v.voice_id;
              return (
                <div
                  key={v.voice_id}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors",
                    selected ? "border-success/35 bg-success/[0.05]" : "border-line/[0.07] bg-surface-2/50 hover:border-line/15"
                  )}
                >
                  <button
                    onClick={() => preview(v)}
                    disabled={!v.preview_url}
                    aria-label={isPlaying ? `Parar amostra de ${v.name}` : `Ouvir amostra de ${v.name}`}
                    className={cn(
                      "w-8 h-8 rounded-full flex-none flex items-center justify-center border transition-colors disabled:opacity-40",
                      isPlaying ? "bg-accent border-accent text-white" : "border-line/15 text-fg-2 hover:text-fg hover:border-line/25"
                    )}
                  >
                    {isPlaying ? <IconStop className="w-3.5 h-3.5" /> : <IconPlay className="w-3.5 h-3.5" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium truncate">{v.name}</div>
                    <div className="text-[11.5px] text-fg-3 truncate">{[v.accent, v.age, v.use_case].filter(Boolean).join(" · ") || "português"}</div>
                  </div>
                  {selected ? (
                    <Badge tone="success">Em uso</Badge>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => choose(v)} loading={busy === v.voice_id}>
                      Usar
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}
