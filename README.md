# JS Dashboard

Sistema pessoal de produtividade — Next.js 15 a correr num Cloudflare Worker
(OpenNext), com Supabase (Postgres) como base de dados, Groq para o agente e a
classificação por pilares, e Gemini para analisar fotos de refeições.

## Páginas
- `/dashboard` — 6 pilares, tarefas atrasadas / para hoje / sem data (Todoist + TickTick), sync
- `/nutricao` — refeições (foto ou manual), treinos, passos, défice calórico, peso/IMC, perfil
- `/integracoes` — integrações (chaves guardadas no Supabase Vault) + laboratório de tools
- `/agendar` — eventos no Google Calendar com lembrete
- `/agente` — **Holiday**: agente com chat por texto ou voz, fotos de refeições e GTD
- `/login` — palavra-passe única (`APP_PASSWORD`)

## Arquitetura e segurança
- O **browser nunca fala com o Supabase**. Todas as leituras e escritas passam
  pelas rotas `/api/*`, que usam a service role no servidor.
- `middleware.ts` exige sessão em todas as páginas e rotas. A sessão é um cookie
  `httpOnly` assinado com HMAC (chave = `APP_PASSWORD`, validade 30 dias).
  Mudar a `APP_PASSWORD` termina todas as sessões.
- Exceções: `/login`, `/api/auth/*`, `POST /api/steps` (usa `X-Steps-Token`) e
  `POST /api/sync` vindo do cron (header `x-cron-key` derivado da `APP_PASSWORD`).
- RLS ligado em todas as tabelas, sem policies: a anon key não lê nem escreve nada.

## Holiday (agente)
Mesma estrutura de pensamento do Jarvis — ciclo fechado detetar → correlacionar → raciocinar → resolver
(`lib/holiday/`):
1. **Snapshot** (`snapshot.ts`) — tarefas (com dono GTD), refeições de hoje, peso, perfil, passos, sync. Sem IA.
2. **Regras** (`engines.ts`) — sinais determinísticos agrupados em problemas por pilar: rotina, atrasadas,
   duplicados, refeições, défice, peso, sync, e GTD (tarefas por esclarecer, delegadas ao Holiday sem trabalho).
3. **Memória** (`memory.ts`, `correlate.ts`):
   - *curto prazo* — conversa recente, o que mudou desde a última conversa, ações de hoje;
   - *longo prazo* — `holiday_memories` (factos, preferências, objetivos, padrões), geridas pelo próprio
     Holiday (`remember`/`forget`) e visíveis/apagáveis no chat;
   - *correlação* — `holiday_daily` (1 linha/dia, atualizada pelo cron): linha de base, padrões por dia da
     semana, correlações entre métricas, tendência de peso e há quantos dias cada problema persiste.
4. **Raciocínio** (`reasoning.ts`) — Groq (`openai/gpt-oss-120b`) em modo JSON. Circuit breaker: 3 falhas
   seguidas → 30 s sem IA; nesse caso responde só com as regras.
5. **Ações** (`actions.ts`) — catálogo fechado. Risco baixo executa logo (refeição, peso, memória, dono GTD,
   notas de trabalho); risco alto pede aprovação (concluir/criar/reagendar tarefa, evento). Propostas validadas
   contra o snapshot; nada que falhou nas últimas 24 h é repetido.

**GTD** é usado pelo Holiday, não é um ecrã: cada tarefa tem dono (`eu` / `holiday` / por esclarecer) e lista
(próxima, agendada, aguardando, algum dia). As tarefas delegadas ao Holiday são trabalho dele (rascunhos,
planos, listas), guardado em `gtd_note`.

**Fotos e voz**: o 📷 do chat analisa o prato (Gemini) e regista-o; o 🎤 grava, transcreve com o Whisper da
Groq (`/api/holiday/transcribe`) e envia. As respostas a mensagens de voz (ou com 🔊 ligado) são lidas em voz
alta pelo browser.

**Cron**: de hora a hora, depois do sync, `/api/holiday/briefing` grava o dia no histórico e gera o briefing
uma vez por dia a partir das 07h (Lisboa).

## Sync
- Botão **Sincronizar** no dashboard, e automático **de hora a hora** (cron em
  `wrangler.jsonc`, handler `scheduled` em `worker.ts`).
- As tarefas abertas que deixam de vir da origem (concluídas ou apagadas lá) são
  marcadas como concluídas. Se um provedor falhar, a cache dessa fonte não é tocada.
- A hora do último sync fica em `sync_state` (no dashboard aparece a amarelo
  quando passa das 3 h).

## Secrets do Worker (Cloudflare → Workers → js-dashboard → Settings → Variables and Secrets)
| Nome | Para quê |
|---|---|
| `APP_PASSWORD` | **obrigatório** — login e chave do cron. Sem este secret ninguém entra |
| `SUPABASE_SERVICE_ROLE_KEY` | acesso do servidor à BD |
| `SYNC_USER_ID` | id do utilizador (auth.users) dono das linhas |
| `TODOIST_API_TOKEN`, `TICKTICK_ACCESS_TOKEN` | tarefas |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` | Google Calendar |
| `GOOGLE_HEALTH_REFRESH_TOKEN` | passos (Google Health API) |
| `GROQ_API_KEY` | agente + classificação por pilares |
| `GEMINI_API_KEY` | análise de fotos de refeições |
| `STEPS_TOKEN` | opcional — `POST /api/steps` manual (ex: Atalhos do iOS) |

## Base de dados
Migrações em `supabase/migrations/`, aplicadas por ordem no SQL Editor do Supabase.
- `0009` — `daily_steps`, `sync_state`, remove a coluna legada `api_key_encrypted`,
  e não deixa criar integrações com nomes repetidos.
- `0011` — coluna `recurring` em `tasks_cache`; `0012` — tabelas do Holiday; `0013` — memória, histórico
  diário e campos GTD.
- `0010` — fecha o RLS (policies só para `service_role`). Já aplicada; a versão
  antiga lia a BD diretamente no browser e deixa de funcionar.

## Desenvolvimento
```bash
npm install
npm test            # vitest
npm run build       # next build
npm run preview     # build OpenNext + wrangler dev (secrets locais em .dev.vars)
npm run deploy      # build OpenNext + deploy para a Cloudflare
```
`.dev.vars` (não vai para o git) leva os mesmos nomes da tabela de secrets.
Para testar o cron localmente: `npx wrangler dev --test-scheduled` e abrir
`/__scheduled?cron=0+*+*+*+*`.
