"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { localDateKey } from "@/lib/dates";
import { calcBMR, GOAL_TARGET_PCT } from "@/lib/bmr";
import { compressImageToBase64 } from "@/lib/image";
import { cn } from "@/lib/cn";
import { Badge, Button, Card, CardHeader, EmptyState, Input, Label, Modal, Page, PageHeader, Segmented, Select, Skeleton, useToast } from "@/components/ui";
import { StatTile } from "@/components/StatTile";
import { IconCamera, IconNutricao } from "@/components/icons";

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
const GOAL_LABEL: Record<string, string> = { perder: "Perder peso", manter: "Manter", ganhar: "Ganhar massa" };

const SOURCE_TONE: Record<string, "accent" | "info" | "violet"> = { foto: "accent", manual: "info", treino: "violet" };
const IN_COLOR = "rgb(var(--accent))";
const OUT_COLOR = "rgb(var(--info))";

function dayRange(dateStr: string) {
  const start = new Date(dateStr + "T00:00:00");
  const end = new Date(dateStr + "T23:59:59.999");
  return { start: start.toISOString(), end: end.toISOString() };
}

function todayIso() {
  return localDateKey(new Date());
}

export default function NutricaoPage() {
  const toast = useToast();
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [logs, setLogs] = useState<NutritionLog[] | null>(null);
  const [weekLogs, setWeekLogs] = useState<NutritionLog[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
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
  const [showManual, setShowManual] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    load();
  }, [selectedDate]);

  async function load() {
    setError(null);
    api<{ steps: number | null; google_health_error: string | null }>(`/api/steps?date=${todayIso()}`)
      .then((d) => {
        setSteps(d.steps ?? null);
        setHealthError(d.google_health_error || null);
      })
      .catch(() => setSteps(null));

    const { start, end } = dayRange(selectedDate);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 6);
    weekAgo.setHours(0, 0, 0, 0);
    const q = (from: string, to?: string) =>
      `/api/nutrition/logs?from=${encodeURIComponent(from)}` + (to ? `&to=${encodeURIComponent(to)}` : "");

    try {
      const [day, week, body, prof] = await Promise.all([
        api<{ logs: NutritionLog[] }>(q(start, end)),
        api<{ logs: NutritionLog[] }>(q(weekAgo.toISOString())),
        api<{ body: BodyEntry | null }>("/api/nutrition/body"),
        api<{ profile: Profile | null }>("/api/profile"),
      ]);
      setLogs(day.logs);
      setWeekLogs(week.logs);
      setBodyHistory(body.body ? [body.body] : []);
      const p = prof.profile;
      setProfile(p || { height_cm: null, age: null, sex: null, goal: null });
      if (p?.goal) setGoalInput(p.goal);
      if (p?.height_cm) setHeightInput(String(p.height_cm));
      if (p?.age) setAgeInput(String(p.age));
      if (p?.sex) setSexInput(p.sex);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!heightInput || !ageInput) return;
    setSavingProfile(true);
    try {
      await api("/api/profile", {
        body: { height_cm: parseFloat(heightInput), age: parseInt(ageInput, 10), sex: sexInput, goal: goalInput },
      });
      setShowProfileForm(false);
      toast.success("Perfil guardado");
      await load();
    } catch (e: any) {
      toast.error("Não foi possível guardar o perfil", e.message);
    } finally {
      setSavingProfile(false);
    }
  }

  async function saveBody(e: React.FormEvent) {
    e.preventDefault();
    if (!weight && !bodyFat && !leanMass) return;
    setSavingBody(true);
    const today = todayIso();
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
    if (data.error) toast.error("Não foi possível gravar a medição", data.error);
    else {
      toast.success("Medição registada");
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
    try {
      await api("/api/nutrition/logs", { body: { label, kcal: parseFloat(kcal), type } });
      toast.success(type === "in" ? "Refeição registada" : "Treino registado", `${label} · ${kcal} kcal`);
      setLabel("");
      setKcal("");
      setShowManual(false);
      await load();
    } catch (e: any) {
      toast.error("Não foi possível registar", e.message);
    } finally {
      setSaving(false);
    }
  }

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAnalyzing(true);
    try {
      const base64 = await compressImageToBase64(file);
      const res = await fetch("/api/nutrition/photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64 }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const l = data.log;
      const macros = l.protein_g != null || l.carbs_g != null || l.fat_g != null ? ` · P ${l.protein_g ?? "—"}g · C ${l.carbs_g ?? "—"}g · G ${l.fat_g ?? "—"}g` : "";
      toast.success(`${l.label} · ${l.kcal} kcal`, `Refeição registada pela foto${macros}`);
      if (selectedDate !== todayIso()) setSelectedDate(todayIso());
      else await load();
    } catch (e: any) {
      toast.error("Não foi possível analisar a foto", e.message);
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

  const bmi =
    body?.weight_kg && profile?.height_cm
      ? (body.weight_kg / Math.pow(profile.height_cm / 100, 2)).toFixed(1)
      : null;

  // Calorias gastas a andar (NEAT) — estimativa padrao: ~0.0005 kcal por
  // passo por kg de peso corporal (ex: 70kg * 10.000 passos ~ 350 kcal).
  const stepsKcal = steps && body?.weight_kg ? Math.round(steps * body.weight_kg * 0.0005) : 0;

  const caloriesIn = (logs || []).filter((l) => l.type === "in").reduce((s, l) => s + Number(l.kcal), 0);
  const outLogs = (logs || []).filter((l) => l.type === "out");
  const treinoKcal = outLogs.reduce((s, l) => s + Number(l.kcal), 0);
  const caloriesOut = (bmr !== null ? bmr : 0) + stepsKcal + treinoKcal;
  const mealCount = (logs || []).filter((l) => l.type === "in").length;
  // Sem refeicoes registadas o defice dava sempre 100% ("no objetivo"), o que
  // e enganador — so calcular quando ha pelo menos uma refeicao no dia.
  const hasRealDeficitData = mealCount > 0 && (bmr !== null || outLogs.length > 0 || stepsKcal > 0) && caloriesOut > 0;
  const deficitKcal = caloriesOut - caloriesIn;
  const deficitPct = hasRealDeficitData ? Math.round((deficitKcal / caloriesOut) * 100) : null;
  const isDeficit = deficitKcal >= 0;
  const goalOnTrack: boolean | null = (() => {
    if (deficitPct === null || !profile?.goal) return null;
    if (profile.goal === "perder") return deficitPct >= GOAL_TARGET_PCT.perder;
    if (profile.goal === "ganhar") return deficitPct <= GOAL_TARGET_PCT.ganhar;
    return Math.abs(deficitPct) <= 10; // manter: tolerancia de 10 pontos
  })();
  const inLogs = (logs || []).filter((l) => l.type === "in");
  const totalProtein = inLogs.reduce((s, l) => s + Number(l.protein_g || 0), 0);
  const totalCarbs = inLogs.reduce((s, l) => s + Number(l.carbs_g || 0), 0);
  const totalFat = inLogs.reduce((s, l) => s + Number(l.fat_g || 0), 0);
  const hasMacroData = inLogs.some((l) => l.protein_g !== null);

  const days: { label: string; in: number; out: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = localDateKey(d);
    const dayLogs = (weekLogs || []).filter((l) => localDateKey(new Date(l.created_at)) === key);
    days.push({
      label: i === 0 ? "Hoje" : d.toLocaleDateString("pt-PT", { weekday: "short" }).slice(0, 3),
      in: i === 0 ? caloriesIn : dayLogs.filter((l) => l.type === "in").reduce((s, l) => s + Number(l.kcal), 0),
      out: dayLogs.filter((l) => l.type === "out").reduce((s, l) => s + Number(l.kcal), 0),
    });
  }
  const maxCal = Math.max(1, ...days.flatMap((d) => [d.in, d.out]));

  const isToday = selectedDate === todayIso();
  const loading = logs === null && !error;
  const selLabel = new Date(selectedDate + "T12:00:00").toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long" });

  const deficitTone: "default" | "success" | "warning" | "danger" =
    deficitPct === null ? "default" : goalOnTrack === null ? (isDeficit ? "success" : "danger") : goalOnTrack ? "success" : "warning";

  const BodyMetric = (p: { label: string; value: string; hint?: string }) => (
    <div className="rounded-lg bg-surface-2 border border-line/[0.06] px-3.5 py-3">
      <div className="text-[11.5px] font-medium text-fg-3">{p.label}</div>
      <div className="text-[18px] font-semibold tabular mt-1 leading-none">{p.value}</div>
      {p.hint && <div className="text-[11px] text-fg-3 mt-1">{p.hint}</div>}
    </div>
  );

  return (
    <Page>
      <PageHeader
        title="Nutrição"
        description={isToday ? `Hoje · ${selLabel}` : selLabel.charAt(0).toUpperCase() + selLabel.slice(1)}
        actions={
          <>
            <Input
              type="date"
              aria-label="Escolher dia"
              value={selectedDate}
              max={todayIso()}
              onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
              className="w-[150px] tabular"
            />
            {!isToday && (
              <Button variant="ghost" onClick={() => setSelectedDate(todayIso())}>
                Hoje
              </Button>
            )}
            {isToday && (
              <Button onClick={() => setShowManual(true)}>Registo manual</Button>
            )}
            <label
              className={cn(
                "inline-flex items-center gap-2 h-9 px-3.5 rounded-lg text-[13px] font-medium bg-accent text-white hover:bg-accent/90 cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-accent/40",
                analyzing && "opacity-60 pointer-events-none"
              )}
            >
              <input ref={fileRef} type="file" accept="image/*" onChange={onPhoto} disabled={analyzing} className="sr-only" />
              <IconCamera className="w-4 h-4" />
              {analyzing ? "A analisar…" : "Foto da refeição"}
            </label>
          </>
        }
      />

      {error && <Card className="border-danger/30 px-4 py-3 text-[13px] text-danger">Não foi possível carregar: {error}</Card>}

      {!isToday && (
        <div className="text-[12.5px] text-fg-3 -mt-2">Passos e composição corporal mostram sempre os dados de hoje.</div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Ingeridas" value={loading ? "—" : `${caloriesIn}`} hint={`kcal · ${mealCount} ${mealCount === 1 ? "refeição" : "refeições"}`} />
        <StatTile
          label="Gastas"
          value={caloriesOut === 0 ? "—" : `${caloriesOut}`}
          hint={bmr !== null ? `basal ${bmr} + passos ${stepsKcal} + treino ${treinoKcal}` : "define o perfil para o basal"}
        />
        <StatTile
          label="Défice calórico"
          value={deficitPct === null ? "—" : `${deficitPct}%`}
          tone={deficitTone}
          hint={
            deficitPct === null
              ? mealCount === 0
                ? "sem refeições registadas"
                : "precisa do basal"
              : profile?.goal
              ? `meta ${GOAL_TARGET_PCT[profile.goal]}% · ${GOAL_LABEL[profile.goal]}`
              : `${Math.abs(deficitKcal)} kcal · sem objetivo`
          }
        />
        <StatTile
          label="Passos"
          value={steps === undefined ? "—" : steps === null ? "—" : steps.toLocaleString("pt-PT")}
          tone={healthError ? "warning" : "default"}
          hint={healthError ? "Google Health com erro" : steps ? `hoje · ~${stepsKcal} kcal` : "sem dados hoje"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.3fr] gap-4 items-start">
        <Card>
          <CardHeader
            title="Corpo"
            description={body?.date ? `Última medição a ${new Date(body.date + "T12:00:00").toLocaleDateString("pt-PT", { day: "numeric", month: "short" })}` : "Sem medições registadas"}
            actions={
              <Button size="sm" variant="ghost" onClick={() => setShowProfileForm(true)}>
                Perfil
              </Button>
            }
          />
          <div className="px-5 pb-5 flex flex-col gap-3">
            {bodyHistory === null ? (
              <Skeleton className="h-[140px]" />
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                <BodyMetric label="Peso" value={body?.weight_kg != null ? `${body.weight_kg} kg` : "—"} />
                <BodyMetric label="IMC" value={bmi ?? "—"} hint={profile?.height_cm ? undefined : "precisa da altura"} />
                <BodyMetric label="Gordura corporal" value={body?.body_fat_pct != null ? `${body.body_fat_pct}%` : "—"} />
                <BodyMetric label="Massa magra" value={body?.lean_mass_kg != null ? `${body.lean_mass_kg} kg` : "—"} />
              </div>
            )}
            {profile && !profile.height_cm && (
              <div className="text-[12px] text-fg-3">Define altura, idade e objetivo no perfil para calcular o basal e o défice real.</div>
            )}
            <Button onClick={() => setShowBodyForm(true)} className="justify-center">
              Registar medição de hoje
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader title="Ingeridas vs gastas" description="Últimos 7 dias, em kcal" />
          <div className="px-5 pb-5">
            <div className="flex items-end gap-2 h-[150px]" role="img" aria-label="Calorias ingeridas e gastas nos últimos 7 dias">
              {days.map((d, i) => (
                <div key={i} className="flex-1 min-w-0 flex flex-col items-center justify-end gap-1.5 h-full group">
                  <div className="flex-1 w-full flex items-end justify-center gap-[3px]">
                    <div
                      className="w-[10px] rounded-t-[3px]"
                      style={{ background: IN_COLOR, height: Math.max(3, (d.in / maxCal) * 120) }}
                      title={`Ingeridas ${d.in} kcal`}
                    />
                    <div
                      className="w-[10px] rounded-t-[3px]"
                      style={{ background: OUT_COLOR, height: Math.max(3, (d.out / maxCal) * 120) }}
                      title={`Gastas (treino) ${d.out} kcal`}
                    />
                  </div>
                  <span className={cn("text-[11px] capitalize", i === days.length - 1 ? "text-fg font-medium" : "text-fg-3")}>{d.label}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-4 mt-3 text-[12px] text-fg-2">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-[3px]" style={{ background: IN_COLOR }} />
                Ingeridas
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-[3px]" style={{ background: OUT_COLOR }} />
                Gastas em treino
              </span>
            </div>
            {hasMacroData && (
              <div className="grid grid-cols-3 gap-2.5 mt-4 pt-4 border-t border-line/[0.06]">
                <BodyMetric label="Proteína" value={`${Math.round(totalProtein)} g`} />
                <BodyMetric label="Hidratos" value={`${Math.round(totalCarbs)} g`} />
                <BodyMetric label="Gordura" value={`${Math.round(totalFat)} g`} />
              </div>
            )}
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader
          title={isToday ? "Registos de hoje" : "Registos do dia"}
          description="Refeições e treinos"
          actions={<span className="text-[12px] text-fg-3 tabular">{logs ? `${logs.length}` : ""}</span>}
          className="border-b border-line/[0.06]"
        />
        {logs === null && !error ? (
          <div className="p-5 flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-5" />
            ))}
          </div>
        ) : !logs || logs.length === 0 ? (
          <EmptyState
            icon={<IconNutricao className="w-5 h-5" />}
            title="Nada registado"
            description={isToday ? "Tira uma foto ao prato ou regista manualmente uma refeição ou treino." : "Não há registos neste dia."}
            action={
              isToday && (
                <Button size="sm" onClick={() => setShowManual(true)}>
                  Registo manual
                </Button>
              )
            }
          />
        ) : (
          <ul>
            {logs.map((l) => {
              const hasMacros = l.protein_g !== null || l.carbs_g !== null || l.fat_g !== null;
              return (
                <li key={l.id} className="flex items-center gap-3 px-5 py-3 border-b border-line/[0.05] last:border-b-0 hover:bg-line/[0.025]">
                  <span className="w-11 flex-none text-[12.5px] tabular text-fg-3">
                    {new Date(l.created_at).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13.5px] truncate">{l.label}</div>
                    {hasMacros && (
                      <div className="text-[11.5px] text-fg-3 tabular mt-0.5">
                        P {l.protein_g ?? "—"}g · H {l.carbs_g ?? "—"}g · G {l.fat_g ?? "—"}g
                      </div>
                    )}
                  </div>
                  <Badge tone={SOURCE_TONE[l.source] || "neutral"} className="hidden sm:inline-flex capitalize">
                    {l.source}
                  </Badge>
                  <span className={cn("w-[84px] flex-none text-right text-[13px] font-medium tabular", l.type === "in" ? "text-fg" : "text-info")}>
                    {l.type === "in" ? "+" : "−"}
                    {l.kcal} kcal
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Modal
        open={showManual}
        onClose={() => !saving && setShowManual(false)}
        title="Registo manual"
        description="Uma refeição (calorias ingeridas) ou um treino (calorias gastas), hoje."
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowManual(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button variant="primary" type="submit" form="manual-form" loading={saving} disabled={!label.trim() || !kcal}>
              Registar
            </Button>
          </>
        }
      >
        <form id="manual-form" onSubmit={addManual} className="flex flex-col gap-4">
          <Segmented<"in" | "out">
            value={type}
            onChange={setType}
            options={[
              { value: "in", label: "Refeição" },
              { value: "out", label: "Treino" },
            ]}
          />
          <div>
            <Label>{type === "in" ? "O que comeste" : "Treino"}</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={type === "in" ? "Ex: frango com arroz" : "Ex: corrida 5 km"} />
          </div>
          <div>
            <Label>Calorias</Label>
            <Input value={kcal} onChange={(e) => setKcal(e.target.value)} placeholder="kcal" type="number" min="0" step="1" inputMode="numeric" />
          </div>
        </form>
      </Modal>

      <Modal
        open={showBodyForm}
        onClose={() => !savingBody && setShowBodyForm(false)}
        title="Medição de hoje"
        description="Preenche só o que mediste."
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowBodyForm(false)} disabled={savingBody}>
              Cancelar
            </Button>
            <Button variant="primary" type="submit" form="body-form" loading={savingBody} disabled={!weight && !bodyFat && !leanMass}>
              Gravar
            </Button>
          </>
        }
      >
        <form id="body-form" onSubmit={saveBody} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label>Peso (kg)</Label>
            <Input value={weight} onChange={(e) => setWeight(e.target.value)} type="number" step="0.1" inputMode="decimal" />
          </div>
          <div>
            <Label>Gordura (%)</Label>
            <Input value={bodyFat} onChange={(e) => setBodyFat(e.target.value)} type="number" step="0.1" inputMode="decimal" />
          </div>
          <div>
            <Label>Massa magra (kg)</Label>
            <Input value={leanMass} onChange={(e) => setLeanMass(e.target.value)} type="number" step="0.1" inputMode="decimal" />
          </div>
        </form>
      </Modal>

      <Modal
        open={showProfileForm}
        onClose={() => !savingProfile && setShowProfileForm(false)}
        title="Perfil"
        description="Usado para o metabolismo basal, o IMC e a meta de défice."
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowProfileForm(false)} disabled={savingProfile}>
              Cancelar
            </Button>
            <Button variant="primary" type="submit" form="profile-form" loading={savingProfile} disabled={!heightInput || !ageInput}>
              Guardar
            </Button>
          </>
        }
      >
        <form id="profile-form" onSubmit={saveProfile} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Altura (cm)</Label>
              <Input value={heightInput} onChange={(e) => setHeightInput(e.target.value)} type="number" inputMode="numeric" />
            </div>
            <div>
              <Label>Idade</Label>
              <Input value={ageInput} onChange={(e) => setAgeInput(e.target.value)} type="number" inputMode="numeric" />
            </div>
          </div>
          <div>
            <Label>Sexo</Label>
            <Segmented<"m" | "f">
              value={sexInput}
              onChange={setSexInput}
              options={[
                { value: "m", label: "Masculino" },
                { value: "f", label: "Feminino" },
              ]}
            />
          </div>
          <div>
            <Label>Objetivo</Label>
            <Select value={goalInput} onChange={(e) => setGoalInput(e.target.value as "perder" | "manter" | "ganhar")}>
              <option value="perder">Perder peso</option>
              <option value="manter">Manter</option>
              <option value="ganhar">Ganhar massa</option>
            </Select>
          </div>
        </form>
      </Modal>
    </Page>
  );
}
