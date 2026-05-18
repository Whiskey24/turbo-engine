import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export type TypedSupabaseClient = SupabaseClient<Database>;

const globalForSupabase = globalThis as unknown as {
    supabase: TypedSupabaseClient;
};

export const supabase: TypedSupabaseClient =
    globalForSupabase.supabase || createClient<Database>(supabaseUrl, supabaseAnonKey);

if (process.env.NODE_ENV !== "production") {
    globalForSupabase.supabase = supabase;
}
