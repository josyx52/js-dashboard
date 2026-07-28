import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder";

// Client para uso no browser (respeita RLS via sessao do utilizador).
// Usamos um fallback inofensivo quando as env vars nao estao presentes
// (ex: durante a pre-renderizacao no build) para o build nunca rebentar —
// em runtime real, as variaveis verdadeiras devem estar sempre definidas.
export const supabase = createClient(url, anonKey);

