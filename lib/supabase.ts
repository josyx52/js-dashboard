import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Client para uso no browser (respeita RLS via sessao do utilizador)
export const supabase = createClient(url, anonKey);
