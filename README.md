# JS Dashboard

Sistema pessoal de produtividade (Next.js + Supabase + Groq).

## Setup
1. `npm install`
2. Copia `.env.example` para `.env.local` e preenche com as credenciais do Supabase e da Groq
3. Corre a migration em `supabase/migrations/0001_init.sql` no teu projeto Supabase (SQL Editor)
4. `npm run dev`

## Estrutura
- `app/dashboard` — pilares + gráficos (fase 1, feito)
- `app/nutricao` — calorias, composição corporal (fase 4, por fazer)
- `app/integracoes` — CRUD de integrações + laboratório de tools (fase 2, por fazer)
- `app/agendar` — agendamento com lembretes (a migrar do sistema-3-pilares)
- `app/agente` — chat com 3 modos: Chat/Calculadora/GTD (fase 5, por fazer)
