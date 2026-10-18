# JS Dashboard

Sistema pessoal de produtividade — Next.js 15 a correr num Cloudflare Worker
(OpenNext), com Supabase (Postgres) como base de dados, Groq para o agente e a
classificação por pilares, e Gemini para analisar fotos de refeições.

## Páginas
- `/dashboard` — 6 pilares, tarefas atrasadas / para hoje / sem data (Todoist + TickTick), sync
- `/nutricao` — refeições (foto ou manual), treinos, passos, défice calórico, peso/IMC, perfil
- `/integracoes` — integrações (chaves guardadas no Supabase Vault) + laboratório de tools
- `/agendar` — eventos no Google Calendar com lembrete
- `/agente` — chat, calculadora por foto e delegação GTD
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
- `0010` — fecha o RLS. **Só depois** de publicar a versão com login: a versão
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
