import { createClient } from "@supabase/supabase-js";

// Estes dois valores nao sao secretos: a URL e publica e a anon key e
// desenhada para andar no browser (a seguranca vem do RLS, ja ativo em
// todas as tabelas). Gravamo-los aqui como fallback direto porque as
// NEXT_PUBLIC_* configuradas no dashboard da Cloudflare como "Variables
// and secrets" so ficam disponiveis ao Worker em runtime — o Next.js
// precisa delas durante o `next build`, que e uma fase anterior e
// separada, por isso nao estavam a chegar ao bundle do browser.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ucuzloaqtksdeypnwfeu.supabase.co";
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjdXpsb2FxdGtzZGV5cG53ZmV1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxNjI1NDMsImV4cCI6MjEwMDczODU0M30.0GGCuhP_EXDiqw15wiTe9AIby9Ym0NDXN8Xq8VPSP88";

export const supabase = createClient(url, anonKey);


