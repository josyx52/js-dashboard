import { speak, stopSpeaking, unlockAudio } from "@/lib/speech";

// Conversa por voz continua com o Holiday, sem botoes por frase:
// o microfone fica aberto, um detetor de voz (volume do microfone face ao
// ruido de fundo) percebe quando comecas e acabas de falar, envia a frase,
// fala a resposta e volta a ouvir. Se falares enquanto ele fala, ele cala-se
// e ouve-te (barge-in), como numa conversa entre pessoas.

export type ConvState = "off" | "starting" | "listening" | "hearing" | "thinking" | "speaking";

export interface ConversationHandlers {
  onState: (s: ConvState) => void;
  // Recebe o que disseste, devolve a resposta a falar (ou null).
  onUtterance: (text: string) => Promise<string | null>;
  onError: (msg: string) => void;
}

const TICK_MS = 50;
const START_MS = 200; // voz continua para considerar que comecaste a falar
const END_SILENCE_MS = 850; // pausa que fecha a frase (mais curta = respostas mais rapidas)
const MIN_VOICE_MS = 500; // menos que isto e ruido (tosse, clique, palavra solta da TV)
const MIN_VOICED_RATIO = 0.4; // a frase tem de ser maioritariamente voz perto do microfone
const MAX_UTTERANCE_MS = 30000;
const IDLE_RESTART_MS = 20000; // reinicia a gravacao em silencio (nao acumular)
const BARGE_MS = 300; // voz por cima do Holiday para o interromper
const BARGE_FACTOR = 2.2; // mais exigente enquanto ele fala (eco da coluna)

function pickMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((m) => MediaRecorder.isTypeSupported(m));
}

export function conversationSupported(): boolean {
  return typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && !!pickMime() && !!window.AudioContext;
}

export class Conversation {
  private state: ConvState = "off";
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private buf: Float32Array<ArrayBuffer> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private floor = 0.01;
  private calibrating = 0;
  private voiceMs = 0;
  private silenceMs = 0;
  private uttMs = 0;
  private idleMs = 0;
  private bargeMs = 0;
  private generation = 0; // invalida respostas de frases interrompidas
  private muted = false;

  constructor(private h: ConversationHandlers) {}

  private set(s: ConvState) {
    this.state = s;
    this.h.onState(s);
  }

  // Tem de ser chamado num clique (permissoes de microfone e audio no iPhone).
  async start() {
    if (this.state !== "off") return;
    this.set("starting");
    unlockAudio();
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (e: any) {
      this.set("off");
      this.h.onError("Microfone: " + (e?.message || "sem permissão"));
      return;
    }
    this.ctx = new AudioContext();
    await this.ctx.resume().catch(() => {});
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    src.connect(this.analyser);
    this.buf = new Float32Array(new ArrayBuffer(this.analyser.fftSize * 4));
    this.calibrating = 600;
    this.floor = 0.01;
    this.listen();
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  // Silenciar: o microfone deixa de ser ouvido (o Holiday pode acabar de
  // falar), sem fechar a conversa. A frase que estava a ser dita e descartada.
  setMuted(m: boolean) {
    this.muted = m;
    if (this.stream) this.stream.getAudioTracks().forEach((t) => (t.enabled = !m));
    if (m && (this.state === "listening" || this.state === "hearing")) {
      this.generation++;
      this.listen();
    }
  }

  isMuted() {
    return this.muted;
  }

  stop() {
    this.generation++;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.stopRecorder(true);
    stopSpeaking();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.set("off");
  }

  private rms(): number {
    if (!this.analyser || !this.buf) return 0;
    this.analyser.getFloatTimeDomainData(this.buf);
    let sum = 0;
    for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i];
    return Math.sqrt(sum / this.buf.length);
  }

  // Exigente de proposito: so a tua voz, perto do microfone, passa. TV e
  // conversas ao fundo ficam abaixo (e o Holiday ainda filtra o que passar).
  private threshold() {
    return Math.max(0.02, this.floor * 3.2);
  }

  // Nova gravacao a correr (comeca antes de falares, para nao cortar o inicio).
  private listen() {
    this.stopRecorder(true);
    if (!this.stream) return;
    const mime = pickMime();
    this.chunks = [];
    const rec = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined);
    rec.ondataavailable = (ev) => {
      if (ev.data.size > 0) this.chunks.push(ev.data);
    };
    rec.start(250);
    this.recorder = rec;
    this.voiceMs = this.silenceMs = this.uttMs = this.idleMs = this.bargeMs = 0;
    this.set("listening");
  }

  private stopRecorder(discard: boolean): Promise<Blob | null> {
    const rec = this.recorder;
    this.recorder = null;
    if (!rec || rec.state === "inactive") return Promise.resolve(null);
    return new Promise((resolve) => {
      rec.onstop = () => resolve(discard ? null : new Blob(this.chunks, { type: rec.mimeType || "audio/webm" }));
      rec.stop();
    });
  }

  private tick() {
    if (this.muted) return;
    const level = this.rms();

    if (this.calibrating > 0) {
      this.calibrating -= TICK_MS;
      this.floor = this.floor * 0.8 + level * 0.2;
      return;
    }
    const thr = this.threshold();

    switch (this.state) {
      case "listening": {
        if (level > thr) {
          this.voiceMs += TICK_MS;
          if (this.voiceMs >= START_MS) {
            this.set("hearing");
            this.silenceMs = 0;
            this.uttMs = this.voiceMs;
          }
        } else {
          this.voiceMs = 0;
          this.floor = this.floor * 0.97 + level * 0.03; // acompanha o ruido de fundo
          this.idleMs += TICK_MS;
          if (this.idleMs >= IDLE_RESTART_MS) this.listen();
        }
        break;
      }
      case "hearing": {
        this.uttMs += TICK_MS;
        if (level > thr) {
          this.voiceMs += TICK_MS;
          this.silenceMs = 0;
        } else {
          this.silenceMs += TICK_MS;
        }
        if (this.silenceMs >= END_SILENCE_MS || this.uttMs >= MAX_UTTERANCE_MS) {
          const ratio = this.voiceMs / Math.max(1, this.uttMs - this.silenceMs);
          if (this.voiceMs >= MIN_VOICE_MS && ratio >= MIN_VOICED_RATIO) this.finishUtterance();
          else this.listen();
        }
        break;
      }
      case "speaking": {
        if (level > thr * BARGE_FACTOR) {
          this.bargeMs += TICK_MS;
          if (this.bargeMs >= BARGE_MS) {
            // Interrompeste: ele cala-se e passa a ouvir-te ja.
            this.generation++;
            stopSpeaking();
            this.listen();
            this.set("hearing");
            this.voiceMs = this.uttMs = this.bargeMs;
          }
        } else {
          this.bargeMs = 0;
        }
        break;
      }
    }
  }

  // A frase ainda conta? (nao foi interrompida nem a conversa terminada)
  private alive(gen: number): boolean {
    return gen === this.generation && this.state !== "off";
  }

  private async finishUtterance() {
    const gen = ++this.generation;
    this.set("thinking");
    const blob = await this.stopRecorder(false);
    if (!this.alive(gen)) return;
    try {
      if (!blob || blob.size < 1500) return this.listen();

      const form = new FormData();
      form.append("audio", blob, "voz");
      const post = () => fetch("/api/holiday/transcribe", { method: "POST", body: form });
      // Rede movel instavel: uma nova tentativa antes de desistir.
      let res = await post().catch(() => null);
      if (!res || res.status >= 500) {
        await new Promise((r) => setTimeout(r, 1000));
        res = await post();
      }
      if (res.status === 401) {
        window.location.href = "/login?next=/agente";
        return;
      }
      const d = await res.json();
      if (!this.alive(gen)) return;
      if (d.error) throw new Error(d.error);
      const text = String(d.text || "").trim();
      if (text.length < 2) return this.listen();

      const reply = await this.h.onUtterance(text);
      if (!this.alive(gen)) return;
      if (reply) {
        // Grava ja durante a fala, para apanhar uma interrupcao desde o inicio.
        this.listen();
        this.set("speaking");
        await speak(reply, { fast: true });
        if (!this.alive(gen)) return;
      }
      this.listen();
    } catch {
      // Falhou mesmo: diz-lo como uma pessoa e continuar a ouvir.
      if (!this.alive(gen)) return;
      this.listen();
      this.set("speaking");
      await speak("Desculpa, não percebi. Podes repetir?", { fast: true });
      if (this.alive(gen)) this.listen();
    }
  }
}
