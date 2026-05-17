import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Hook into the global scope during development so Next.js hot-reloads 
// don't recreate the client on every file save.
const globalForSupabase = globalThis as unknown as {
    supabase: ReturnType<typeof createClient>;
};

export const supabase =
    globalForSupabase.supabase || createClient(supabaseUrl, supabaseAnonKey);

if (process.env.NODE_ENV !== "production") {
    globalForSupabase.supabase = supabase;
}