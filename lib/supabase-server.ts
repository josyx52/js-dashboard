import { createClient } from "@supabase/supabase-js";

// A URL nao e secreta (ver lib/supabase.ts para a explicacao completa
// do porque de nao confiarmos so em NEXT_PUBLIC_SUPABASE_URL aqui).
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ucuzloaqtksdeypnwfeu.supabase.co";

// Usar APENAS em route handlers / server components — nunca importar
// este ficheiro num componente marcado "use client".
export function supabaseServer() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY nao configurado nos secrets do Worker");
  }
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

