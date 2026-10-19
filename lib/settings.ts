import type { SupabaseClient } from "@supabase/supabase-js";

export async function getSetting<T = any>(sb: SupabaseClient, key: string): Promise<T | null> {
  const { data } = await sb.from("app_settings").select("value").eq("key", key).maybeSingle();
  return (data?.value as T) ?? null;
}

export async function setSetting(sb: SupabaseClient, key: string, value: unknown) {
  const { error } = await sb.from("app_settings").upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error(error.message);
}

// Voz do Holiday (ElevenLabs).
export interface VoiceSetting {
  voice_id: string;
  name: string;
  quality: "natural" | "rapida"; // natural = eleven_multilingual_v2; rapida = eleven_flash_v2_5
}

export const DEFAULT_VOICE: VoiceSetting = { voice_id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah (padrão, sotaque inglês)", quality: "natural" };
