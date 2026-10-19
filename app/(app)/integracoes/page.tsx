"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { Integration } from "@/lib/types";
import VoicePicker from "@/components/VoicePicker";
import { Badge, Button, Card, CardHeader, EmptyState, Input, Label, Modal, Page, PageHeader, Skeleton, StatusDot, useToast } from "@/components/ui";

interface Service {
  key: string;
  name: string;
  purpose: string;
  configured: boolean;
  ok: boolean;
  detail: string;
  ms: number | null;
  setup: string;
}
interface NotionPage {
  id: string;
  title: string;
  url: string;
}
type Item = Integration & { config?: { parent_id?: string; parent_title?: string } };

function statusOf(s: Service) {
  if (!s.configured) return { label: "Sem chave", tone: "neutral" as const };
  return s.ok ? { label: "Ligado", tone: "success" as const } : { label: "Com erro", tone: "danger" as const };
}

export default function IntegracoesPage() {
  const toast = useToast();
  const [services, setServices] = useState<Service[] | null>(null);
  const [testing, setTesting] = useState(false);
  const [items, setItems] = useState<Item[] | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Item | null>(null);

  const [notionQ, setNotionQ] = useState("");
  const [notionResults, setNotionResults] = useState<NotionPage[] | null>(null);
  const [searching, setSearching] = useState(false);

  async function test() {
    setTesting(true);
    try {
      const d = await api<{ services: Service[] }>("/api/integrations/status");
      setServices(d.services);
    } catch (e: any) {
      toast.error("Falhou o teste dos serviços", e.message);
    } finally {
      setTesting(false);
    }
  }

  async function load() {
    try {
      const d = await api<{ integrations: Item[] }>("/api/integrations");
      setItems(d.integrations);
    } catch (e: any) {
      toast.error("Não foi possível carregar as integrações", e.message);
    }
  }

  useEffect(() => {
    load();
    test();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const notion = items?.find((i) => i.name.trim().toLowerCase() === "notion") || null;
  const others = (items || []).filter((i) => i !== notion);

  async function createIntegration(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      const data = await api<{ validation_note?: string }>("/api/integrations", { body: { name, api_key: apiKey } });
      if (data.validation_note) toast.info("Chave guardada", data.validation_note);
      else toast.success("Chave guardada", name.trim());
      setName("");
      setApiKey("");
      setShowForm(false);
      await load();
      await test();
    } catch (err: any) {
      toast.error("Não foi possível guardar", err.message);
    } finally {
      setCreating(false);
    }
  }

  async function toggle(it: Item) {
    setBusyId(it.id);
    try {
      await api("/api/integrations/toggle", { body: { id: it.id, connect: !it.connected } });
      toast.success(it.connected ? `${it.name} desligado` : `${it.name} ligado`);
      await load();
    } catch (e: any) {
      toast.error("Não foi possível alterar", e.message);
    } finally {
      setBusyId(null);
    }
  }

  async function remove(it: Item) {
    setConfirmDelete(null);
    setBusyId(it.id);
    try {
      await api(`/api/integrations/${it.id}`, { method: "DELETE" });
      toast.success("Integração apagada", it.name);
      await load();
      await test();
    } catch (e: any) {
      toast.error("Não foi possível apagar", e.message);
    } finally {
      setBusyId(null);
    }
  }

  async function searchNotion(e: React.FormEvent) {
    e.preventDefault();
    setSearching(true);
    try {
      const d = await api<{ results: NotionPage[] }>(`/api/integrations/notion/search?q=${encodeURIComponent(notionQ)}`);
      setNotionResults(d.results);
    } catch (err: any) {
      toast.error("Falhou a pesquisa no Notion", err.message);
    } finally {
      setSearching(false);
    }
  }

  async function setDestination(p: NotionPage) {
    if (!notion) return;
    setBusyId(notion.id);
    try {
      await api(`/api/integrations/${notion.id}`, { method: "PATCH", body: { config: { parent_id: p.id.replace(/-/g, ""), parent_title: p.title } } });
      toast.success("Destino do Notion definido", p.title);
      setNotionResults(null);
      setNotionQ("");
      await load();
      await test();
    } catch (e: any) {
      toast.error("Não foi possível guardar o destino", e.message);
    } finally {
      setBusyId(null);
    }
  }

  const okCount = services?.filter((s) => s.ok).length ?? 0;
  const errCount = services?.filter((s) => s.configured && !s.ok).length ?? 0;

  return (
    <Page>
      <PageHeader
        title="Integrações"
        description="Serviços que a app e o Holiday usam. Cada teste é feito ao vivo contra o serviço."
        meta={
          services ? (
            <div className="flex flex-wrap gap-2">
              <Badge tone="success" dot>
                {okCount} de {services.length} a funcionar
              </Badge>
              {errCount > 0 && (
                <Badge tone="danger" dot>
                  {errCount} com erro
                </Badge>
              )}
            </div>
          ) : (
            <Badge>A testar os serviços…</Badge>
          )
        }
        actions={
          <Button variant="primary" onClick={test} loading={testing}>
            Testar tudo
          </Button>
        }
      />

      {/* Servicos */}
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {services?.map((s) => {
          const st = statusOf(s);
          return (
            <Card key={s.key} className={cn("p-4 flex flex-col gap-3", st.tone === "danger" && "border-danger/30")}>
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-surface-3 border border-line/[0.08] flex items-center justify-center text-[14px] font-semibold text-fg-2 flex-none">
                  {s.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-semibold truncate">{s.name}</div>
                  <div className="text-[12px] text-fg-3 leading-snug mt-0.5">{s.purpose}</div>
                </div>
                <Badge tone={st.tone} className="flex-none">
                  <StatusDot tone={st.tone} />
                  {st.label}
                </Badge>
              </div>
              <div className={cn("text-[12px] leading-snug break-words", st.tone === "danger" ? "text-danger" : "text-fg-2")}>
                {s.detail}
                {s.ms !== null && <span className="text-fg-3 tabular"> · {s.ms} ms</span>}
              </div>
              {(!s.configured || !s.ok) && <div className="text-[11.5px] text-fg-3 border-t border-line/[0.06] pt-2.5">Configurar em: {s.setup}</div>}
            </Card>
          );
        })}
        {!services && Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[118px] rounded-card" />)}
      </section>

      {/* Notion */}
      <Card>
        <CardHeader
          title="Notion"
          description="O Holiday pesquisa nas tuas páginas e cria páginas novas com o trabalho dele."
          actions={
            notion && (
              <>
                <Badge tone={notion.connected ? "success" : "neutral"} dot>
                  {notion.connected ? "Ligado" : "Desligado"}
                </Badge>
                <Button size="sm" variant={notion.connected ? "secondary" : "primary"} onClick={() => toggle(notion)} loading={busyId === notion.id}>
                  {notion.connected ? "Desligar" : "Ligar"}
                </Button>
              </>
            )
          }
        />
        <div className="px-5 pb-5 flex flex-col gap-4">
          {!items && <Skeleton className="h-16" />}
          {items && !notion && (
            <ol className="flex flex-col gap-2 text-[12.5px] text-fg-2 leading-relaxed list-decimal pl-5">
              <li>
                Em <b className="text-fg">notion.so/my-integrations</b> cria uma integração interna e copia a chave (começa por <code className="text-fg">ntn_</code>).
              </li>
              <li>
                No Notion, abre as páginas que o Holiday pode usar → <b className="text-fg">⋯ → Ligações → adiciona a integração</b>.
              </li>
              <li>
                Guarda a chave abaixo com o nome <b className="text-fg">Notion</b>.{" "}
                <button
                  className="text-accent hover:underline"
                  onClick={() => {
                    setName("Notion");
                    setShowForm(true);
                  }}
                >
                  Adicionar agora
                </button>
              </li>
            </ol>
          )}
          {notion && (
            <>
              <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-fg-2">
                Páginas novas vão para
                {notion.config?.parent_title ? <Badge tone="info">{notion.config.parent_title}</Badge> : <Badge tone="warning">ainda não escolhida</Badge>}
              </div>
              <form onSubmit={searchNotion} className="flex gap-2">
                <Input value={notionQ} onChange={(e) => setNotionQ(e.target.value)} placeholder="Procurar a página de destino no Notion…" className="flex-1 min-w-0" />
                <Button type="submit" loading={searching}>
                  Procurar
                </Button>
              </form>
              {notionResults && (
                <div className="rounded-lg border border-line/[0.07] overflow-hidden">
                  {notionResults.length === 0 && <EmptyState title="Nada encontrado" description="Confirma que a página está partilhada com a integração." className="py-6" />}
                  {notionResults.map((p) => (
                    <div key={p.id} className="flex items-center gap-3 px-3.5 h-11 border-b border-line/[0.05] last:border-b-0 hover:bg-line/[0.025]">
                      <span className="flex-1 min-w-0 truncate text-[13px]">{p.title}</span>
                      <a href={p.url} target="_blank" rel="noreferrer" className="text-[12px] text-fg-3 hover:text-fg">
                        Abrir
                      </a>
                      <Button size="sm" variant="success" onClick={() => setDestination(p)} disabled={busyId === notion.id}>
                        Usar como destino
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </Card>

      <VoicePicker />

      {/* Chaves guardadas */}
      <Card className="overflow-hidden">
        <CardHeader
          title="Chaves guardadas"
          description="Cifradas no Supabase Vault. O valor nunca volta a ser mostrado."
          actions={
            <Button size="sm" variant="primary" onClick={() => setShowForm(true)}>
              Nova chave
            </Button>
          }
        />
        <div className="border-t border-line/[0.06]">
          {!items && (
            <div className="p-5 flex flex-col gap-3">
              <Skeleton className="h-5" />
              <Skeleton className="h-5" />
            </div>
          )}
          {items && items.length === 0 && <EmptyState title="Nenhuma chave guardada" description="Adiciona a chave de um serviço para o Holiday o poder usar." />}
          {[...(notion ? [notion] : []), ...others].map((it) => (
            <div key={it.id} className="flex flex-wrap items-center gap-3 px-5 py-3 border-b border-line/[0.05] last:border-b-0">
              <StatusDot tone={it.connected ? "success" : "neutral"} />
              <div className="flex-1 min-w-[160px]">
                <div className="text-[13px] font-medium">{it.name}</div>
                <div className="text-[12px] text-fg-3">{it === notion ? "Usada pelo Holiday" : "Guardada — o Holiday ainda não sabe usar este serviço"}</div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => toggle(it)} disabled={busyId === it.id}>
                {it.connected ? "Desligar" : "Ligar"}
              </Button>
              <Button size="sm" variant="danger" onClick={() => setConfirmDelete(it)} disabled={busyId === it.id}>
                Apagar
              </Button>
            </div>
          ))}
        </div>
      </Card>

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title="Nova chave"
        description="A chave é cifrada no Supabase Vault e não volta a aparecer."
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowForm(false)}>
              Cancelar
            </Button>
            <Button variant="primary" type="submit" form="new-key" loading={creating} disabled={!name.trim()}>
              Guardar
            </Button>
          </>
        }
      >
        <form id="new-key" onSubmit={createIntegration} className="flex flex-col gap-4">
          <div>
            <Label>Serviço</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex: Notion" />
          </div>
          <div>
            <Label>Chave da API</Label>
            <Input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Cola aqui a chave" type="password" autoComplete="off" className="font-mono" />
          </div>
        </form>
      </Modal>

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title={`Apagar “${confirmDelete?.name ?? ""}”?`}
        description="A chave guardada é removida da app. Esta ação não pode ser desfeita."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={() => confirmDelete && remove(confirmDelete)}>
              Apagar
            </Button>
          </>
        }
      >
        <span />
      </Modal>
    </Page>
  );
}
