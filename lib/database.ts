import type { QueryData } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Json, Tables, TablesInsert } from "@/lib/database.types";

export type { Database, Tables, TablesInsert } from "@/lib/database.types";
export { ASSET_TYPE_SLUGS } from "@/lib/database.types";
export type { AssetTypeSlug } from "@/lib/database.types";

// ---------------------------------------------------------------------------
// Base table row / insert types
// ---------------------------------------------------------------------------

export type AssetType = Tables<"asset_types">;
export type PortfolioAsset = Tables<"portfolio_assets">;
export type AssetValuation = Tables<"asset_valuations">;

export type AssetTypeInsert = TablesInsert<"asset_types">;
export type PortfolioAssetInsert = TablesInsert<"portfolio_assets">;
export type AssetValuationInsert = TablesInsert<"asset_valuations">;

// ---------------------------------------------------------------------------
// Derived query types
//
// type_slug now lives on portfolio_assets, NOT on asset_types.
// All joins that previously pulled type_slug from the asset_types relation
// have been updated accordingly.
// ---------------------------------------------------------------------------

/**
 * Full portfolio_assets row + the asset type's display name.
 * type_slug is already included via the `*` wildcard on portfolio_assets.
 */
const portfolioAssetWithTypeQuery = supabase
    .from("portfolio_assets")
    .select("*, asset_types(name)");

export type PortfolioAssetWithType = QueryData<typeof portfolioAssetWithTypeQuery>[number];

/**
 * Lightweight summary used for dropdowns / lists that only need
 * the identity fields.
 */
const portfolioAssetSummaryQuery = supabase
    .from("portfolio_assets")
    .select("id, name, institution");

export type PortfolioAssetSummary = QueryData<typeof portfolioAssetSummaryQuery>[number];

/**
 * Summary that also includes the type name and type_slug for display/filtering.
 * type_slug is selected directly from portfolio_assets; only the human-readable
 * name is fetched from the joined asset_types relation.
 */
const portfolioAssetWithTypeNameQuery = supabase
    .from("portfolio_assets")
    .select("id, name, institution, iban, ticker, isin, type_slug, asset_types(name)");

export type PortfolioAssetWithTypeName = QueryData<typeof portfolioAssetWithTypeNameQuery>[number];

/**
 * Valuation ledger rows used for history views / charts.
 * type_slug is now part of the portfolio_assets sub-select.
 */
const valuationLedgerQuery = supabase.from("asset_valuations").select(`
    id,
    asset_id,
    valuation_date,
    balance_amount,
    portfolio_assets(
        name,
        institution,
        type_slug,
        asset_types(name)
    )
`);

export type ValuationLedgerRow = QueryData<typeof valuationLedgerQuery>[number];

const valuationReferenceQuery = supabase
    .from("asset_valuations")
    .select("valuation_date, balance_amount");

export type ValuationReference = QueryData<typeof valuationReferenceQuery>[number];

// ---------------------------------------------------------------------------
// Export / import query types
// ---------------------------------------------------------------------------

/**
 * Asset type export — type_slug has been removed because it no longer exists
 * on asset_types. Only the display name is exported here; the slug travels
 * with each individual asset (see ExportAssetRow below).
 */
const exportAssetTypeQuery = supabase
    .from("asset_types")
    .select("name");

export type ExportAssetTypeRow = QueryData<typeof exportAssetTypeQuery>[number];

/**
 * Asset export — type_slug is now a direct column on portfolio_assets so it
 * is selected from there. The asset_types join only contributes the display name.
 */
const exportAssetQuery = supabase
    .from("portfolio_assets")
    .select("name, institution, login_url, comments, iban, ticker, isin, type_slug, asset_types(name)");

export type ExportAssetRow = QueryData<typeof exportAssetQuery>[number];

const exportValuationQuery = supabase.from("asset_valuations").select(`
    valuation_date,
    balance_amount,
    portfolio_assets!inner(name, institution, user_id)
`);

export type ExportValuationRow = QueryData<typeof exportValuationQuery>[number];

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

export async function hasPortfolioData(): Promise<boolean> {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) return false;

    const { count: typeCount } = await supabase
        .from("asset_types")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId);

    if (typeCount && typeCount > 0) return true;

    const { count: assetCount } = await supabase
        .from("portfolio_assets")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId);

    if (assetCount && assetCount > 0) return true;

    const { count: valuationCount } = await supabase
        .from("asset_valuations")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId);

    return (valuationCount ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// User Settings
// ---------------------------------------------------------------------------

export interface UserPreferences {
    locale?: string;
}

export async function getUserSettings(): Promise<UserPreferences> {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) return {};

    const { data, error } = await supabase
        .from("user_settings")
        .select("preferences")
        .eq("user_id", userId)
        .maybeSingle();

    if (error || !data) return {};
    return (data.preferences as UserPreferences) ?? {};
}

export async function upsertUserSettings(
    preferences: UserPreferences
): Promise<void> {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) throw new Error("Not authenticated");

    const { error } = await supabase
        .from("user_settings")
        .upsert(
            { user_id: userId, preferences: preferences as Json, updated_at: new Date().toISOString() },
            { onConflict: "user_id" }
        );

    if (error) throw error;
}
