# Real Mar bot
WhatsApp (Bird) → este Worker (`POST /webhook`) → Groq → resposta pelo Bird → Supabase.

## Antes de ir a produção
1. `src/catalog.ts`: preencher produtos, preços, zonas, horário.
2. `src/bird.ts`: ajustar `parseInbound`, `sendReply`, `verifyWebhook` à documentação do Bird.
3. Aplicar `supabase/migrations/001_real_mar.sql` e pôr o URL em `wrangler.jsonc`.
4. `wrangler secret put` para GROQ_API_KEY, SUPABASE_SERVICE_KEY, BIRD_API_KEY, BIRD_WEBHOOK_SECRET.
5. `npm i && npm run typecheck && npm run deploy`; apontar o webhook do Bird para `/webhook`.
