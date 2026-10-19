// Fala do Holiday no browser.
// 1º ElevenLabs via /api/holiday/speak (GET em streaming: comeca a tocar
//    enquanto o audio ainda chega). 2º voz feminina pt do sistema.
// Um so elemento <audio> reutilizado: no iPhone so pode tocar sem novo
// toque no ecra se tiver sido "desbloqueado" dentro de um gesto (unlockAudio).

const FEMALE_HINTS = /joana|catarina|raquel|fernanda|francisca|luciana|helena|ines|inês|maria|female|feminina|mulher/i;
// WAV mono 8 kHz com 0,1 s de silencio, gerado aqui (sem ficheiros).
function silentWav(): string {
  const samples = 800;
  const buf = new ArrayBuffer(44 + samples);
  const v = new DataView(buf);
  const str = (o: number, t: string) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + samples, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, 8000, true);
  v.setUint32(28, 8000, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true);
  str(36, "data");
  v.setUint32(40, samples, true);
  for (let i = 0; i < samples; i++) v.setUint8(44 + i, 128); // 8-bit: 128 = silencio
  let bin = "";
  new Uint8Array(buf).forEach((b) => (bin += String.fromCharCode(b)));
  return "data:audio/wav;base64," + btoa(bin);
}

let audioEl: HTMLAudioElement | null = null;
let elevenAvailable = true; // false depois de um 501 (sem chave)
let cancelCurrent: (() => void) | null = null;

function audio(): HTMLAudioElement {
  if (!audioEl) {
    audioEl = new Audio();
    audioEl.preload = "auto";
  }
  return audioEl;
}

// Chamar dentro de um clique (ex: ao ligar o modo conversa).
export function unlockAudio() {
  const a = audio();
  a.src = silentWav();
  a.play().catch(() => {});
  if ("speechSynthesis" in window) {
    window.speechSynthesis.getVoices();
    const u = new SpeechSynthesisUtterance("");
    u.volume = 0;
    window.speechSynthesis.speak(u);
  }
}

export function stopSpeaking() {
  cancelCurrent?.();
  cancelCurrent = null;
}

function femaleVoice(): SpeechSynthesisVoice | null {
  const pt = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("pt"));
  return (
    pt.find((v) => v.lang === "pt-PT" && FEMALE_HINTS.test(v.name)) ||
    pt.find((v) => FEMALE_HINTS.test(v.name)) ||
    pt.find((v) => v.lang === "pt-PT") ||
    pt[0] ||
    null
  );
}

function browserSpeak(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window)) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    const v = femaleVoice();
    u.voice = v;
    u.lang = v?.lang || "pt-PT";
    u.rate = 1.03;
    u.pitch = v && FEMALE_HINTS.test(v.name) ? 1 : 1.15; // sem voz feminina, aproxima
    u.onend = () => resolve();
    u.onerror = () => resolve();
    cancelCurrent = () => {
      window.speechSynthesis.cancel();
      resolve();
    };
    window.speechSynthesis.speak(u);
  });
}

function elevenSpeak(text: string, fast: boolean): Promise<"ok" | "fallback"> {
  return new Promise((resolve) => {
    const a = audio();
    let settled = false;
    const done = (r: "ok" | "fallback") => {
      if (settled) return;
      settled = true;
      a.onended = a.onerror = null;
      resolve(r);
    };
    a.onended = () => done("ok");
    a.onerror = () => {
      // Sem chave (501) ou ElevenLabs em baixo: confirma o motivo e cai para o browser.
      fetch(`/api/holiday/speak?text=x`)
        .then((r) => {
          if (r.status === 501) elevenAvailable = false;
        })
        .catch(() => {});
      done("fallback");
    };
    cancelCurrent = () => {
      a.pause();
      done("ok");
    };
    a.src = `/api/holiday/speak?${fast ? "fast=1&" : ""}text=${encodeURIComponent(text.slice(0, 1800))}`;
    a.play().catch(() => done("fallback"));
  });
}

// Fala e resolve quando acaba (ou quando e interrompida com stopSpeaking).
export async function speak(text: string, opts: { fast?: boolean } = {}): Promise<void> {
  stopSpeaking();
  const clean = text.replace(/[*_#`>]/g, "").trim();
  if (!clean) return;
  if (elevenAvailable && (await elevenSpeak(clean, !!opts.fast)) === "ok") return;
  await browserSpeak(clean);
}
