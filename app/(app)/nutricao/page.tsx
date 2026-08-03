"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

interface NutritionLog {
  id: string;
  created_at: string;
  label: string;
  kcal: number;
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

function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

export default function NutricaoPage() {
  const [logs, setLogs] = useState<NutritionLog[] | null>(null);
  const [weekLogs, setWeekLogs] = useState<NutritionLog[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const [bodyHistory, setBodyHistory] = useState<BodyEntry[] | null>(null);
  const [weight, setWeight] = useState("");
  const [bodyFat, setBodyFat] = useState("");
  const [leanMass, setLeanMass] = useState("");
  const [savingBody, setSavingBody] = useState(false);

  const [label, setLabel] = useState("");
  const [kcal, setKcal] = useState("");
  const [type, setType] = useState<"in" | "out">("in");
  const [saving, setSaving] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { start, end } = todayRange();
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
      .limit(14);
    setBodyHistory((body as BodyEntry[]) || []);
  }

  async function saveBody(e: React.FormEvent) {
    e.preventDefault();
    if (!weight && !bodyFat && !leanMass) return;
    setSavingBody(true);
    const today = new Date().toISOString().slice(0, 10);
    const { error } = await supabase.from("body_composition").upsert(
      {
        date: today,
        weight_kg: weight ? parseFloat(weight) : null,
        body_fat_pct: bodyFat ? parseFloat(bodyFat) : null,
        lean_mass_kg: leanMass ? parseFloat(leanMass) : null,
      },
      { onConflict: "user_id,date" }
    );
    setSavingBody(false);
    if (error) setError(error.message);
    else {
      setWeight("");
      setBodyFat("");
      setLeanMass("");
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
      const base64: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await fetch("/api/nutrition/photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64 }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAnalyzing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const todayIn = (logs || []).filter((l) => l.type === "in").reduce((s, l) => s + Number(l.kcal), 0);
  const todayOut = (logs || []).filter((l) => l.type === "out").reduce((s, l) => s + Number(l.kcal), 0);
  const deficit = todayOut > 0 ? Math.round(((todayOut - todayIn) / todayOut) * 100) : 0;
  const mealCount = (logs || []).filter((l) => l.type === "in").length;

  const days: { label: string; in: number; out: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const dayLogs = (weekLogs || []).filter((l) => l.created_at.slice(0, 10) === key);
    days.push({
      label: d.toLocaleDateString("pt-PT", { weekday: "short" }).slice(0, 3),
      in: dayLogs.filter((l) => l.type === "in").reduce((s, l) => s + Number(l.kcal), 0),
      out: dayLogs.filter((l) => l.type === "out").reduce((s, l) => s + Number(l.kcal), 0),
    });
  }
  const maxKcal = Math.max(1, ...days.map((d) => Math.max(d.in, d.out)));

  return (
    <div className="p-[28px_36px] max-w-[820px] flex flex-col gap-5">
      {error && (
        <div className="bg-red-500/10 text-red-400 border border-red-500/30 rounded px-4 py-2 font-mono text-[11.5px]">
          {error}
        </div>
      )}

      <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="border border-white/[0.08] bg-surface rounded-md p-[16px_18px]">
          <div className="font-mono font-semibold text-[11px] tracking-[0.05em] text-white/40">
            CALORIAS INGERIDAS
          </div>
          <div className="font-mono font-bold text-[26px] mt-2 text-accent">{todayIn}</div>
          <div className="font-mono font-medium text-[11px] text-white/35 mt-1">{mealCount} refeições</div>
        </div>
        <div
          className="border rounded-md p-[16px_18px]"
          style={{ borderColor: deficit >= 0 ? "rgba(61,220,132,0.3)" : "rgba(255,95,95,0.3)", background: "#14161B" }}
        >
          <div className="font-mono font-semibold text-[11px] tracking-[0.05em] text-white/40">
            DÉFICIT CALÓRICO
          </div>
          <div
            className="font-mono font-bold text-[26px] mt-2"
            style={{ color: deficit >= 0 ? "#3DDC84" : "#FF5F5F" }}
          >
            {deficit}%
          </div>
          <div className="font-mono font-medium text-[11px] text-white/35 mt-1">
            {todayOut - todayIn} kcal
          </div>
        </div>
      </div>

      <div className="border border-white/[0.08] bg-surface rounded-md p-5">
        <div className="font-mono font-semibold text-[11px] tracking-[0.06em] text-white/40 mb-4">
          ÚLTIMOS 7 DIAS — INGERIDAS VS GASTAS
        </div>
        <div className="flex items-end gap-3" style={{ height: 140 }}>
          {days.map((d, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
              <div className="flex items-end gap-1" style={{ height: 100 }}>
                <div
                  className="w-3 rounded-t-[2px] bg-accent"
                  style={{ height: `${(d.in / maxKcal) * 100}%` }}
                  title={`ingeridas: ${d.in}`}
                />
                <div
                  className="w-3 rounded-t-[2px] bg-[#36CFC9]"
                  style={{ height: `${(d.out / maxKcal) * 100}%` }}
                  title={`gastas: ${d.out}`}
                />
              </div>
              <span className="font-mono text-[9px] text-white/35 uppercase">{d.label}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-4 mt-3 font-mono text-[11px] text-white/50">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-[1px] bg-accent inline-block" /> ingeridas
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-[1px] bg-[#36CFC9] inline-block" /> gastas
          </span>
        </div>
      </div>

      <div className="border border-white/[0.08] bg-surface rounded-md p-5 flex flex-col gap-3">
        <div className="font-mono font-semibold text-[11px] tracking-[0.06em] text-white/40">
          CALCULADORA DE CALORIAS (FOTO)
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onPhoto}
          disabled={analyzing}
          className="text-[12.5px] text-white/60 file:mr-3 file:py-2 file:px-4 file:rounded file:border-0 file:font-mono file:font-bold file:text-[11px] file:bg-accent file:text-bg"
        />
        {analyzing && <div className="font-mono text-[11.5px] text-white/50">a analisar a foto…</div>}
      </div>

      <form onSubmit={addManual} className="border border-white/[0.08] bg-surface rounded-md p-5 flex flex-col gap-2.5">
        <div className="font-mono font-semibold text-[11px] tracking-[0.06em] text-white/40">
          ADICIONAR MANUALMENTE
        </div>
        <div className="flex gap-2">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Descrição"
            className="flex-1 bg-bg border border-white/10 rounded px-3 py-2 text-[13px] outline-none focus:border-accent"
          />
          <input
            value={kcal}
            onChange={(e) => setKcal(e.target.value)}
            placeholder="kcal"
            type="number"
            className="w-24 bg-bg border border-white/10 rounded px-3 py-2 text-[13px] font-mono outline-none focus:border-accent"
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value as "in" | "out")}
            className="bg-bg border border-white/10 rounded px-3 py-2 text-[13px] outline-none"
          >
            <option value="in">ingerida</option>
            <option value="out">gasta</option>
          </select>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-accent border-none rounded text-bg font-mono font-bold text-[11px] disabled:opacity-50"
          >
            {saving ? "…" : "ADICIONAR"}
          </button>
        </div>
      </form>

      <div className="border border-white/[0.08] bg-surface rounded-md overflow-hidden">
        <div className="px-[18px] py-[14px] border-b border-white/[0.08] font-sans font-bold text-[13px]">
          Registo de hoje
        </div>
        <div className="flex flex-col">
          {(!logs || logs.length === 0) && (
            <div className="px-[18px] py-4 text-[12.5px] text-white/35 font-sans">nada registado ainda</div>
          )}
          {logs?.map((l) => (
            <div
              key={l.id}
              className="flex items-center gap-3 px-[18px] py-[13px] border-b border-white/[0.05] last:border-none"
            >
              <span
                className="font-mono font-semibold text-[10px] px-2 py-[2px] rounded flex-none"
                style={{
                  background: l.type === "in" ? "rgba(245,78,0,0.15)" : "rgba(54,207,201,0.15)",
                  color: l.type === "in" ? "#F54E00" : "#36CFC9",
                }}
              >
                {l.type === "in" ? "INGERIDA" : "GASTA"}
              </span>
              <span className="flex-1 min-w-0 font-sans font-medium text-[13px] truncate">{l.label}</span>
              <span className="font-mono text-[11px] text-white/35">{l.source}</span>
              <span className="font-mono font-bold text-[13px] w-[70px] text-right">{l.kcal} kcal</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <form onSubmit={saveBody} className="border border-white/[0.08] bg-surface rounded-md p-5 flex flex-col gap-2.5">
          <div className="font-mono font-semibold text-[11px] tracking-[0.06em] text-white/40">
            COMPOSIÇÃO CORPORAL — HOJE
          </div>
          <div className="flex gap-2">
            <div className="flex-1 flex flex-col gap-1">
              <label className="font-mono text-[10px] text-white/35">peso (kg)</label>
              <input
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                type="number"
                step="0.1"
                className="bg-bg border border-white/10 rounded px-3 py-2 text-[13px] font-mono outline-none focus:border-accent"
              />
            </div>
            <div className="flex-1 flex flex-col gap-1">
              <label className="font-mono text-[10px] text-white/35">gordura %</label>
              <input
                value={bodyFat}
                onChange={(e) => setBodyFat(e.target.value)}
                type="number"
                step="0.1"
                className="bg-bg border border-white/10 rounded px-3 py-2 text-[13px] font-mono outline-none focus:border-accent"
              />
            </div>
            <div className="flex-1 flex flex-col gap-1">
              <label className="font-mono text-[10px] text-white/35">massa magra (kg)</label>
              <input
                value={leanMass}
                onChange={(e) => setLeanMass(e.target.value)}
                type="number"
                step="0.1"
                className="bg-bg border border-white/10 rounded px-3 py-2 text-[13px] font-mono outline-none focus:border-accent"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={savingBody}
            className="px-4 py-2 bg-accent border-none rounded text-bg font-mono font-bold text-[11px] disabled:opacity-50"
          >
            {savingBody ? "…" : "GRAVAR"}
          </button>
        </form>

        <div className="border border-white/[0.08] bg-surface rounded-md p-5">
          <div className="font-mono font-semibold text-[11px] tracking-[0.06em] text-white/40 mb-3">
            EVOLUÇÃO (últimos registos)
          </div>
          {(!bodyHistory || bodyHistory.length === 0) && (
            <div className="text-[12.5px] text-white/35 font-sans">sem registos ainda</div>
          )}
          <div className="flex flex-col gap-1.5">
            {bodyHistory?.map((b) => (
              <div key={b.id} className="flex items-center gap-3 text-[12px] font-mono">
                <span className="text-white/40 w-[76px] flex-none">{b.date}</span>
                <span className="text-white">{b.weight_kg ?? "—"} kg</span>
                <span className="text-white/50">{b.body_fat_pct ?? "—"}% gordura</span>
                <span className="text-white/50">{b.lean_mass_kg ?? "—"} kg magra</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
