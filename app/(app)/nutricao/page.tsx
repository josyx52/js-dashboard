"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { calcBMR } from "@/lib/bmr";
import { compressImageToBase64 } from "@/lib/image";

interface NutritionLog {
  id: string;
  created_at: string;
  label: string;
  kcal: number;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  type: "in" | "out";
  source: string;
}

interface BodyEntry {
  id: string;
  date: string;
  weight_kg: number | null;
  body_fat_pct: number | null;
  lean_mass_kg: number | null;
}

interface Profile {
  height_cm: number | null;
  age: number | null;
  sex: "m" | "f" | null;
  goal: "perder" | "manter" | "ganhar" | null;
}

// Meta de defice/superavit calorico recomendada por objetivo (percentagem
// sobre as calorias gastas). Negativo = superavit (comer mais que gasta).
const GOAL_TARGET_PCT: Record<string, number> = { perder: 15, manter: 0, ganhar: -15 };
const GOAL_LABEL: Record<string, string> = { perder: "Perder peso", manter: "Manter", ganhar: "Ganhar massa" };

const SOURCE_COLORS: Record<string, string> = { foto: "#F54E00", manual: "#36CFC9", treino: "#8B7CF6" };

function dayRange(dateStr: string) {
  const start = new Date(dateStr + "T00:00:00");
  const end = new Date(dateStr + "T23:59:59.999");
  return { start: start.toISOString(), end: end.toISOString() };
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function NutricaoPage() {
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [logs, setLogs] = useState<NutritionLog[] | null>(null);
  const [weekLogs, setWeekLogs] = useState<NutritionLog[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const [bodyHistory, setBodyHistory] = useState<BodyEntry[] | null>(null);
  const [steps, setSteps] = useState<number | null | undefined>(undefined);
  const [weight, setWeight] = useState("");
  const [bodyFat, setBodyFat] = useState("");
  const [leanMass, setLeanMass] = useState("");
  const [savingBody, setSavingBody] = useState(false);
  const [showBodyForm, setShowBodyForm] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [heightInput, setHeightInput] = useState("");
  const [ageInput, setAgeInput] = useState("");
  const [sexInput, setSexInput] = useState<"m" | "f">("m");
  const [goalInput, setGoalInput] = useState<"perder" | "manter" | "ganhar">("manter");
  const [savingProfile, setSavingProfile] = useState(false);

  const [label, setLabel] = useState("");
  const [kcal, setKcal] = useState("");
  const [type, setType] = useState<"in" | "out">("in");
  const [saving, setSaving] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    load();
  }, [selectedDate]);

  async function load() {
    fetch("/api/steps")
      .then((r) => r.json())
      .then((d) => {
        setSteps(d.steps ?? null);
        if (d.google_health_error) setError("Google Health: " + d.google_health_error);
      })
      .catch(() => setSteps(null));
    const { start, end } = dayRange(selectedDate);
    const { data, error } = await supabase
      .from("nutrition_logs")
      .select("*")
      .gte("created_at", start)
      .lte("created_at", end)
      .order("created_at", { ascending: false });
    if (error) setError(error.message);
    else setLogs(data as NutritionLog[]);

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 6);
    weekAgo.setHours(0, 0, 0, 0);
    const { data: wk } = await supabase
      .from("nutrition_logs")
      .select("*")
      .gte("created_at", weekAgo.toISOString());
    setWeekLogs((wk as NutritionLog[]) || []);

    const { data: body } = await supabase
      .from("body_composition")
      .select("*")
      .order("date", { ascending: false })
      .limit(1);
    setBodyHistory((body as BodyEntry[]) || []);

    const { data: prof } = await supabase
      .from("user_profile")
      .select("height_cm, age, sex, goal")
      .eq("id", "00000000-0000-0000-0000-000000000001")
      .maybeSingle();
    setProfile((prof as Profile) || { height_cm: null, age: null, sex: null, goal: null });
    if (prof?.goal) setGoalInput(prof.goal);
    if (prof?.height_cm) setHeightInput(String(prof.height_cm));
    if (prof?.age) setAgeInput(String(prof.age));
    if (prof?.sex) setSexInput(prof.sex);
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!heightInput || !ageInput) return;
    setSavingProfile(true);
    const { error } = await supabase.from("user_profile").upsert({
      id: "00000000-0000-0000-0000-000000000001",
      height_cm: parseFloat(heightInput),
      age: parseInt(ageInput, 10),
      sex: sexInput,
      goal: goalInput,
      updated_at: new Date().toISOString(),
    });
    setSavingProfile(false);
    if (error) setError(error.message);
    else {
      setShowProfileForm(false);
      await load();
    }
  }

  async function saveBody(e: React.FormEvent) {
    e.preventDefault();
    if (!weight && !bodyFat && !leanMass) return;
    setSavingBody(true);
    const today = new Date().toISOString().slice(0, 10);
    const res = await fetch("/api/nutrition/body", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: today,
        weight_kg: weight ? parseFloat(weight) : null,
        body_fat_pct: bodyFat ? parseFloat(bodyFat) : null,
        lean_mass_kg: leanMass ? parseFloat(leanMass) : null,
      }),
    });
    const data = await res.json();
    setSavingBody(false);
    if (data.error) setError(data.error);
    else {
      setWeight("");
      setBodyFat("");
      setLeanMass("");
      setShowBodyForm(false);
      await load();
    }
  }

  async function addManual(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim() || !kcal) return;
    setSaving(true);
    const { error } = await supabase.from("nutrition_logs").insert({
      label,
      kcal: parseFloat(kcal),
      type,
      source: "manual",
    });
    setSaving(false);
    if (error) setError(error.message);
    else {
      setLabel("");
      setKcal("");
      await load();
    }
  }

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAnalyzing(true);
    setError(null);
    try {
      const base64 = await compressImageToBase64(file);
      const res = await fetch("/api/nutrition/photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64 }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (selectedDate !== todayIso()) setSelectedDate(todayIso());
      else await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAnalyzing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const body = bodyHistory?.[0];
  const bmr =
    body?.weight_kg && profile?.height_cm && profile?.age && profile?.sex
      ? calcBMR(body.weight_kg, profile.height_cm, profile.age, profile.sex)
      : null;

  // Calorias gastas a andar (NEAT) — estimativa padrao: ~0.0005 kcal por
  // passo por kg de peso corporal (ex: 70kg * 10.000 passos ~ 350 kcal).
  const stepsKcal = steps && body?.weight_kg ? Math.round(steps * body.weight_kg * 0.0005) : 0;

  const caloriesIn = (logs || []).filter((l) => l.type === "in").reduce((s, l) => s + Number(l.kcal), 0);
  const outLogs = (logs || []).filter((l) => l.type === "out");
  const treinoKcal = outLogs.reduce((s, l) => s + Number(l.kcal), 0);
  const caloriesOut = (bmr !== null ? bmr : 0) + stepsKcal + treinoKcal;
  const hasRealDeficitData = (bmr !== null || outLogs.length > 0 || stepsKcal > 0) && caloriesIn >= 0 && caloriesOut > 0;
  const deficitKcal = caloriesOut - caloriesIn;
  const deficitPct = hasRealDeficitData ? Math.round((deficitKcal / caloriesOut) * 100) : null;
  const isDeficit = deficitKcal >= 0;
  const goalOnTrack: boolean | null = (() => {
    if (deficitPct === null || !profile?.goal) return null;
    if (profile.goal === "perder") return deficitPct >= GOAL_TARGET_PCT.perder;
    if (profile.goal === "ganhar") return deficitPct <= GOAL_TARGET_PCT.ganhar;
    return Math.abs(deficitPct) <= 10; // manter: tolerancia de 10 pontos
  })();
  const mealCount = (logs || []).filter((l) => l.type === "in").length;
  const inLogs = (logs || []).filter((l) => l.type === "in");
  const totalProtein = inLogs.reduce((s, l) => s + Number(l.protein_g || 0), 0);
  const totalCarbs = inLogs.reduce((s, l) => s + Number(l.carbs_g || 0), 0);
  const totalFat = inLogs.reduce((s, l) => s + Number(l.fat_g || 0), 0);
  const hasMacroData = inLogs.some((l) => l.protein_g !== null);

  const days: { label: string; in: number; out: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const dayLogs = (weekLogs || []).filter((l) => l.created_at.slice(0, 10) === key);
    days.push({
      label: i === 0 ? "HOJE" : d.toLocaleDateString("pt-PT", { weekday: "short" }).slice(0, 3).toUpperCase(),
      in: i === 0 ? caloriesIn : dayLogs.filter((l) => l.type === "in").reduce((s, l) => s + Number(l.kcal), 0),
      out: dayLogs.filter((l) => l.type === "out").reduce((s, l) => s + Number(l.kcal), 0),
    });
  }
  const maxCal = Math.max(1, ...days.flatMap((d) => [d.in, d.out]));

  const StatCard = (p: { title: string; value: string; sub: string; color?: string; border?: string }) => (
    <div style={{ border: `1px solid ${p.border || "rgba(255,255,255,0.08)"}`, background: "#14161B", borderRadius: 6, padding: "16px 18px" }}>
      <div style={{ font: "600 11px 'JetBrains Mono',monospace", letterSpacing: "0.05em", color: "rgba(244,244,242,0.4)" }}>{p.title}</div>
      <div style={{ font: "700 26px 'JetBrains Mono',monospace", marginTop: 8, color: p.color || "#F4F4F2" }}>{p.value}</div>
      <div style={{ font: "500 11px 'JetBrains Mono',monospace", color: "rgba(244,244,242,0.35)", marginTop: 4 }}>{p.sub}</div>
    </div>
  );

  return (
    <div className="p-4 sm:p-[28px_36px] flex flex-col gap-5">
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="date"
            value={selectedDate}
            max={todayIso()}
            onChange={(e) => setSelectedDate(e.target.value)}
            style={{ background: "#14161B", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 4, padding: "8px 10px", color: "#F4F4F2", font: "600 12px 'JetBrains Mono',monospace" }}
          />
          {selectedDate !== todayIso() && (
            <button
              onClick={() => setSelectedDate(todayIso())}
              style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 4, padding: "8px 12px", color: "rgba(244,244,242,0.6)", font: "600 11px 'JetBrains Mono',monospace", cursor: "pointer" }}
            >
              ← HOJE
            </button>
          )}
        </div>
        <label
          style={{ display: "flex", alignItems: "center", gap: 8, background: "#F54E00", border: "none", borderRadius: 4, padding: "9px 16px", color: "#0B0C10", font: "700 11px 'JetBrains Mono',monospace", cursor: analyzing ? "default" : "pointer", opacity: analyzing ? 0.6 : 1 }}
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onPhoto}
            disabled={analyzing}
            style={{ display: "none" }}
          />
          {analyzing ? "A ANALISAR…" : "+ REGISTAR REFEIÇÃO"}
        </label>
      </div>

      {error && (
        <div className="bg-red-500/10 text-red-400 border border-red-500/30 rounded px-4 py-2 font-mono text-[11.5px]">
          {error}
        </div>
      )}

      {selectedDate !== todayIso() && (
        <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, padding: "10px 14px", font: "500 11.5px 'JetBrains Mono',monospace", color: "rgba(244,244,242,0.5)" }}>
          A ver {new Date(selectedDate + "T12:00:00").toLocaleDateString("pt-PT")} — Passos e Composição Corporal continuam a mostrar sempre hoje
        </div>
      )}

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        <StatCard
          title="PASSOS"
          value={steps === undefined ? "…" : steps === null ? "—" : steps.toLocaleString("pt-PT")}
          sub={steps ? "hoje" : "sem dados — liga o Google Health API"}
        />
        <StatCard
          title="CALORIAS GASTAS"
          value={caloriesOut === 0 ? "—" : String(caloriesOut)}
          sub={
            bmr !== null
              ? `basal ${bmr} + passos ${stepsKcal} + treino ${treinoKcal}`
              : "define o perfil para basal real"
          }
          color="#36CFC9"
        />
        <StatCard title="CALORIAS INGERIDAS" value={String(caloriesIn)} sub={`${mealCount} refeições`} color="#F54E00" />
        <StatCard
          title="DÉFICIT CALÓRICO"
          value={deficitPct === null ? "—" : `${deficitPct}%`}
          sub={
            deficitPct === null
              ? "precisa de basal (não calculado)"
              : profile?.goal
              ? `meta ${GOAL_TARGET_PCT[profile.goal]}% · ${GOAL_LABEL[profile.goal]}`
              : `${Math.abs(deficitKcal)} kcal · sem objetivo definido`
          }
          color={deficitPct === null ? undefined : goalOnTrack === null ? (isDeficit ? "#3DDC84" : "#FF5F5F") : goalOnTrack ? "#3DDC84" : "#E8B93F"}
          border={
            deficitPct === null
              ? undefined
              : goalOnTrack === null
              ? isDeficit
                ? "rgba(61,220,132,0.3)"
                : "rgba(255,95,95,0.3)"
              : goalOnTrack
              ? "rgba(61,220,132,0.3)"
              : "rgba(232,185,63,0.3)"
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:[grid-template-columns:1fr_1.2fr] gap-4">
        <div style={{ border: "1px solid rgba(255,255,255,0.08)", background: "#14161B", borderRadius: 6, padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ font: "600 11px 'JetBrains Mono',monospace", letterSpacing: "0.06em", color: "rgba(244,244,242,0.4)" }}>
            COMPOSIÇÃO CORPORAL
          </div>
          <div style={{ display: "flex", gap: 16, alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 150, height: 220, flexShrink: 0, position: "relative", background: "radial-gradient(ellipse at center, rgba(10,30,45,0.9), #060A10 72%)", borderRadius: 8, overflow: "hidden" }}>
              <svg viewBox="0 0 100 220" style={{ width: "100%", height: "100%" }}>
                <defs>
                  <filter id="hologlow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="1.8" result="blur" />
                    <feMerge><feMergeNode in="blur" /><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                  </filter>
                  <linearGradient id="beamFade" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#36CFC9" stopOpacity={0} />
                    <stop offset="15%" stopColor="#36CFC9" stopOpacity={0.5} />
                    <stop offset="85%" stopColor="#36CFC9" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#36CFC9" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <line x1={15} y1={0} x2={15} y2={220} stroke="url(#beamFade)" strokeWidth={0.9} />
                <line x1={32} y1={0} x2={32} y2={220} stroke="url(#beamFade)" strokeWidth={0.6} />
                <line x1={50} y1={0} x2={50} y2={220} stroke="url(#beamFade)" strokeWidth={1.1} />
                <line x1={68} y1={0} x2={68} y2={220} stroke="url(#beamFade)" strokeWidth={0.6} />
                <line x1={85} y1={0} x2={85} y2={220} stroke="url(#beamFade)" strokeWidth={0.9} />
                <g filter="url(#hologlow)">
                  <circle cx={50} cy={15} r={12} fill="rgba(54,207,201,0.12)" stroke="#7FE3DE" strokeWidth={1.2} />
                  <path d="M44,28 L29,36 L22,54 L19,84 L20,112 L17,123 L23,128 L27,118 L29,107 L31,82 L34,60 L36,80 L34,101 L29,131 L28,161 L27,187 L28,204 L35,204 L37,161 L40,118 L50,109 L60,118 L63,161 L65,204 L72,204 L73,187 L72,161 L71,131 L66,101 L64,80 L66,60 L69,82 L71,107 L73,118 L77,128 L83,123 L80,112 L81,84 L78,54 L71,36 L56,28 Z" fill="rgba(54,207,201,0.12)" stroke="#7FE3DE" strokeWidth={1} strokeLinejoin="round" />
                  <path d="M36,80 L64,80 L66,101 L64,131 L36,131 L34,101 Z" fill="#F54E00" opacity={0.4} />
                  <ellipse cx={27} cy={207} rx={6.5} ry={3.2} fill="rgba(54,207,201,0.18)" stroke="#7FE3DE" strokeWidth={0.9} />
                  <ellipse cx={73} cy={207} rx={6.5} ry={3.2} fill="rgba(54,207,201,0.18)" stroke="#7FE3DE" strokeWidth={0.9} />
                </g>
                <ellipse cx={50} cy={30} rx={36} ry={4} fill="none" stroke="#7FE3DE" strokeWidth={0.9} opacity={0.55} />
                <ellipse cx={50} cy={65} rx={34} ry={4} fill="none" stroke="#7FE3DE" strokeWidth={0.9} opacity={0.55} />
                <ellipse cx={50} cy={100} rx={30} ry={4} fill="none" stroke="#7FE3DE" strokeWidth={0.9} opacity={0.55} />
                <ellipse cx={50} cy={140} rx={26} ry={3.5} fill="none" stroke="#7FE3DE" strokeWidth={0.9} opacity={0.55} />
                <ellipse cx={50} cy={180} rx={20} ry={3} fill="none" stroke="#7FE3DE" strokeWidth={0.9} opacity={0.55} />
              </svg>
            </div>
          </div>
          <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
            <div style={{ background: "#0B0C10", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 4, padding: "10px 12px" }}>
              <div style={{ font: "600 10px 'JetBrains Mono',monospace", color: "rgba(244,244,242,0.4)" }}>GORDURA CORPORAL</div>
              <div style={{ font: "700 18px 'JetBrains Mono',monospace", marginTop: 4, color: "#36CFC9" }}>{body?.body_fat_pct ?? "—"}%</div>
            </div>
            <div style={{ background: "#0B0C10", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 4, padding: "10px 12px" }}>
              <div style={{ font: "600 10px 'JetBrains Mono',monospace", color: "rgba(244,244,242,0.4)" }}>MASSA MAGRA</div>
              <div style={{ font: "700 18px 'JetBrains Mono',monospace", marginTop: 4, color: "#8B7CF6" }}>{body?.lean_mass_kg ?? "—"} kg</div>
            </div>
          </div>
          <button
            onClick={() => setShowBodyForm((s) => !s)}
            className="font-mono font-semibold text-[10px] text-white/40 hover:text-accent transition-colors text-left"
          >
            {showBodyForm ? "fechar" : "+ registar peso de hoje"}
          </button>
          {showBodyForm && (
            <form onSubmit={saveBody} className="flex flex-col gap-2">
              <div className="flex gap-2">
                <input value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="peso kg" type="number" step="0.1"
                  className="flex-1 bg-bg border border-white/10 rounded px-2.5 py-1.5 text-[12px] font-mono outline-none focus:border-accent" />
                <input value={bodyFat} onChange={(e) => setBodyFat(e.target.value)} placeholder="gordura %" type="number" step="0.1"
                  className="flex-1 bg-bg border border-white/10 rounded px-2.5 py-1.5 text-[12px] font-mono outline-none focus:border-accent" />
                <input value={leanMass} onChange={(e) => setLeanMass(e.target.value)} placeholder="magra kg" type="number" step="0.1"
                  className="flex-1 bg-bg border border-white/10 rounded px-2.5 py-1.5 text-[12px] font-mono outline-none focus:border-accent" />
              </div>
              <button type="submit" disabled={savingBody} className="px-3 py-1.5 bg-accent border-none rounded text-bg font-mono font-bold text-[10px] disabled:opacity-50">
                {savingBody ? "…" : "GRAVAR"}
              </button>
            </form>
          )}
          <button
            onClick={() => setShowProfileForm((s) => !s)}
            className="font-mono font-semibold text-[10px] text-white/40 hover:text-accent transition-colors text-left"
          >
            {showProfileForm ? "fechar" : profile?.height_cm ? "editar perfil (altura/idade)" : "+ definir perfil (para basal real)"}
          </button>
          {showProfileForm && (
            <form onSubmit={saveProfile} className="flex flex-col gap-2">
              <div className="flex gap-2">
                <input value={heightInput} onChange={(e) => setHeightInput(e.target.value)} placeholder="altura cm" type="number"
                  className="flex-1 bg-bg border border-white/10 rounded px-2.5 py-1.5 text-[12px] font-mono outline-none focus:border-accent" />
                <input value={ageInput} onChange={(e) => setAgeInput(e.target.value)} placeholder="idade" type="number"
                  className="flex-1 bg-bg border border-white/10 rounded px-2.5 py-1.5 text-[12px] font-mono outline-none focus:border-accent" />
                <select value={sexInput} onChange={(e) => setSexInput(e.target.value as "m" | "f")}
                  className="bg-bg border border-white/10 rounded px-2 py-1.5 text-[12px] outline-none">
                  <option value="m">M</option>
                  <option value="f">F</option>
                </select>
              </div>
              <select value={goalInput} onChange={(e) => setGoalInput(e.target.value as "perder" | "manter" | "ganhar")}
                className="bg-bg border border-white/10 rounded px-2.5 py-1.5 text-[12px] outline-none">
                <option value="perder">Objetivo: Perder peso</option>
                <option value="manter">Objetivo: Manter</option>
                <option value="ganhar">Objetivo: Ganhar massa</option>
              </select>
              <button type="submit" disabled={savingProfile} className="px-3 py-1.5 bg-accent border-none rounded text-bg font-mono font-bold text-[10px] disabled:opacity-50">
                {savingProfile ? "…" : "GRAVAR PERFIL"}
              </button>
            </form>
          )}
        </div>

        <div style={{ border: "1px solid rgba(255,255,255,0.08)", background: "#14161B", borderRadius: 6, padding: 20 }}>
          <div style={{ font: "600 11px 'JetBrains Mono',monospace", letterSpacing: "0.06em", color: "rgba(244,244,242,0.4)", marginBottom: 10 }}>
            INGERIDAS VS GASTAS · 7 DIAS
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 150 }}>
            {days.map((d, i) => (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 4, height: "100%" }}>
                <div style={{ flex: 1, display: "flex", alignItems: "flex-end", gap: 2, width: "100%", justifyContent: "center" }}>
                  <div style={{ width: 8, borderRadius: "2px 2px 0 0", background: "#F54E00", height: Math.max(4, (d.in / maxCal) * 120) }} />
                  <div style={{ width: 8, borderRadius: "2px 2px 0 0", background: "#36CFC9", height: Math.max(4, (d.out / maxCal) * 120) }} />
                </div>
                <span style={{ font: "600 9px 'JetBrains Mono',monospace", color: "rgba(244,244,242,0.4)" }}>{d.label}</span>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 16, marginTop: 12, font: "500 11px 'JetBrains Mono',monospace", color: "rgba(244,244,242,0.5)" }}>
            <span><span style={{ display: "inline-block", width: 8, height: 8, background: "#F54E00", borderRadius: 1, marginRight: 6 }} />Ingeridas</span>
            <span><span style={{ display: "inline-block", width: 8, height: 8, background: "#36CFC9", borderRadius: 1, marginRight: 6 }} />Gastas</span>
          </div>
        </div>
      </div>

      {hasMacroData && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          <div style={{ border: "1px solid rgba(255,255,255,0.08)", background: "#14161B", borderRadius: 6, padding: "14px 16px" }}>
            <div style={{ font: "600 10px 'JetBrains Mono',monospace", color: "rgba(244,244,242,0.4)" }}>PROTEÍNA</div>
            <div style={{ font: "700 20px 'JetBrains Mono',monospace", marginTop: 4, color: "#EF5DA8" }}>{Math.round(totalProtein)}g</div>
          </div>
          <div style={{ border: "1px solid rgba(255,255,255,0.08)", background: "#14161B", borderRadius: 6, padding: "14px 16px" }}>
            <div style={{ font: "600 10px 'JetBrains Mono',monospace", color: "rgba(244,244,242,0.4)" }}>CARBOIDRATOS</div>
            <div style={{ font: "700 20px 'JetBrains Mono',monospace", marginTop: 4, color: "#4F8FF7" }}>{Math.round(totalCarbs)}g</div>
          </div>
          <div style={{ border: "1px solid rgba(255,255,255,0.08)", background: "#14161B", borderRadius: 6, padding: "14px 16px" }}>
            <div style={{ font: "600 10px 'JetBrains Mono',monospace", color: "rgba(244,244,242,0.4)" }}>GORDURA</div>
            <div style={{ font: "700 20px 'JetBrains Mono',monospace", marginTop: 4, color: "#E8B93F" }}>{Math.round(totalFat)}g</div>
          </div>
        </div>
      )}

      <div style={{ border: "1px solid rgba(255,255,255,0.08)", background: "#14161B", borderRadius: 6, overflow: "hidden" }}>
        <div style={{ padding: "12px 18px", borderBottom: "1px solid rgba(255,255,255,0.08)", font: "700 13px Inter,sans-serif" }}>
          {selectedDate === todayIso() ? "Refeições e treinos de hoje" : `Refeições e treinos — ${new Date(selectedDate + "T12:00:00").toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" })}`}
        </div>
        {(!logs || logs.length === 0) && (
          <div className="px-[18px] py-4 text-[12.5px] text-white/35 font-sans">nada registado ainda</div>
        )}
        {logs?.map((l) => {
          const c = SOURCE_COLORS[l.source] || "rgba(244,244,242,0.4)";
          const hasMacros = l.protein_g !== null || l.carbs_g !== null || l.fat_g !== null;
          return (
            <div key={l.id} style={{ display: "flex", flexDirection: "column", gap: 2, padding: "13px 18px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ font: "600 10px 'JetBrains Mono',monospace", letterSpacing: "0.03em", padding: "3px 8px", borderRadius: 3, flexShrink: 0, color: c, background: `${c}1a`, border: `1px solid ${c}40` }}>
                  {l.source.charAt(0).toUpperCase() + l.source.slice(1)}
                </span>
                <span style={{ flex: 1, font: "500 13px Inter,sans-serif" }}>{l.label}</span>
                <span style={{ font: "500 11px 'JetBrains Mono',monospace", color: "rgba(244,244,242,0.4)" }}>
                  {new Date(l.created_at).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span style={{ font: "700 12px 'JetBrains Mono',monospace", color: l.type === "in" ? "#F54E00" : "#36CFC9", width: 80, textAlign: "right" }}>
                  {l.type === "in" ? "+" : "−"}{l.kcal} kcal
                </span>
              </div>
              {hasMacros && (
                <div style={{ font: "500 10.5px 'JetBrains Mono',monospace", color: "rgba(244,244,242,0.35)", paddingLeft: 2 }}>
                  P {l.protein_g ?? "—"}g · C {l.carbs_g ?? "—"}g · G {l.fat_g ?? "—"}g
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
