import { supabase } from "@/lib/supabase";

async function getCurrentUserId(): Promise<string | null> {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user?.id ?? null;
}

// ---------------------------------------------------------------------------
// deleteAllPortfolioData
//
// Deletion order follows the FK dependency chain so that RESTRICT constraints
// are never violated:
//
//   lot_matches          (→ tax_lots, → asset_transactions, → portfolio_assets)
//   tax_lots             (→ asset_transactions, → portfolio_assets)
//   asset_transactions   (→ portfolio_assets)
//   asset_prices         (→ portfolio_assets)
//   asset_valuations     (→ portfolio_assets)
//   portfolio_assets     (→ asset_categories)
//   asset_categories
//
// tax_lots and lot_matches are computed by the FIFO trigger but are owned by
// the user row and must be deleted explicitly.
// ---------------------------------------------------------------------------

export async function deleteAllPortfolioData(): Promise<{ ok: true } | { ok: false; message: string }> {
    const userId = await getCurrentUserId();
    if (!userId) {
        return { ok: false, message: "You must be signed in to delete your data." };
    }

    // 1. lot_matches — depends on tax_lots and asset_transactions
    const { error: lotMatchesError } = await supabase
        .from("lot_matches")
        .delete()
        .eq("user_id", userId);

    if (lotMatchesError) {
        return { ok: false, message: `lot_matches: ${lotMatchesError.message}` };
    }

    // 2. tax_lots — depends on asset_transactions
    const { error: taxLotsError } = await supabase
        .from("tax_lots")
        .delete()
        .eq("user_id", userId);

    if (taxLotsError) {
        return { ok: false, message: `tax_lots: ${taxLotsError.message}` };
    }

    // 3. asset_transactions — depends on portfolio_assets
    const { error: transactionsError } = await supabase
        .from("asset_transactions")
        .delete()
        .eq("user_id", userId);

    if (transactionsError) {
        return { ok: false, message: `asset_transactions: ${transactionsError.message}` };
    }

    // 4. asset_prices — depends on portfolio_assets
    const { error: pricesError } = await supabase
        .from("asset_prices")
        .delete()
        .eq("user_id", userId);

    if (pricesError) {
        return { ok: false, message: `asset_prices: ${pricesError.message}` };
    }

    // 5. asset_valuations — depends on portfolio_assets
    const { error: valuationsError } = await supabase
        .from("asset_valuations")
        .delete()
        .eq("user_id", userId);

    if (valuationsError) {
        return { ok: false, message: `asset_valuations: ${valuationsError.message}` };
    }

    // 6. portfolio_assets — depends on asset_categories
    const { error: assetsError } = await supabase
        .from("portfolio_assets")
        .delete()
        .eq("user_id", userId);

    if (assetsError) {
        return { ok: false, message: `portfolio_assets: ${assetsError.message}` };
    }

    // 7. asset_categories
    const { error: categoriesError } = await supabase
        .from("asset_categories")
        .delete()
        .eq("user_id", userId);

    if (categoriesError) {
        return { ok: false, message: `asset_categories: ${categoriesError.message}` };
    }

    return { ok: true };
}
