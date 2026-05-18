import { supabase } from "@/lib/supabase";

async function getCurrentUserId(): Promise<string | null> {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user?.id ?? null;
}

export async function deleteAllPortfolioData(): Promise<{ ok: true } | { ok: false; message: string }> {
    const userId = await getCurrentUserId();
    if (!userId) {
        return { ok: false, message: "You must be signed in to delete your data." };
    }

    const { error: valuationsError } = await supabase
        .from("asset_valuations")
        .delete()
        .eq("user_id", userId);

    if (valuationsError) {
        return { ok: false, message: valuationsError.message };
    }

    const { error: assetsError } = await supabase
        .from("portfolio_assets")
        .delete()
        .eq("user_id", userId);

    if (assetsError) {
        return { ok: false, message: assetsError.message };
    }

    const { error: typesError } = await supabase
        .from("asset_types")
        .delete()
        .eq("user_id", userId);

    if (typesError) {
        return { ok: false, message: typesError.message };
    }

    return { ok: true };
}
