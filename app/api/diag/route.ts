import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    has_SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    has_SYNC_USER_ID: !!process.env.SYNC_USER_ID,
    has_TODOIST_API_TOKEN: !!process.env.TODOIST_API_TOKEN,
    has_TICKTICK_ACCESS_TOKEN: !!process.env.TICKTICK_ACCESS_TOKEN,
    has_GOOGLE_CLIENT_ID: !!process.env.GOOGLE_CLIENT_ID,
    has_GOOGLE_CLIENT_SECRET: !!process.env.GOOGLE_CLIENT_SECRET,
    has_GOOGLE_REFRESH_TOKEN: !!process.env.GOOGLE_REFRESH_TOKEN,
    has_GROQ_API_KEY: !!process.env.GROQ_API_KEY,
    NEXT_PUBLIC_SUPABASE_URL_value: process.env.NEXT_PUBLIC_SUPABASE_URL || "(vazio, usa fallback do codigo)",
  });
}
