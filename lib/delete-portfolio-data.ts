import { supabase } from "@/lib/supabase";

export async function deleteAllPortfolioData(): Promise<{ ok: true } | { ok: false; message: string }> {
    // Supabase RPC automatically passes the JWT, so auth.uid() works natively inside the SQL function
    const { error } = await supabase.rpc("delete_all_portfolio_data");

    if (error) {
        return { ok: false, message: `DDDeletion failed: ${error.message}` };
    }

    return { ok: true };
}