import type { QueryData } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Json, Tables, TablesInsert } from "@/lib/database.types";

export type { Database, Tables, TablesInsert } from "@/lib/database.types";
export { ASSET_TYPE_SLUGS } from "@/lib/database.types";
export type { AssetTypeSlug } from "@/lib/database.types";

// ---------------------------------------------------------------------------
// Base table row / insert types
//
// The database table is now called asset_categories.
// The exported TypeScript names (AssetType, AssetTypeInsert) are kept
// unchanged so that all downstream consumers continue to compile without
// modification. Renaming the exports to AssetCategory / AssetCategoryInsert
// is the next planned step.
// ---------------------------------------------------------------------------

export type AssetType = Tables<"asset_categories">;     // table: asset_categories
export type PortfolioAsset = Tables<"portfolio_assets">;
export type AssetValuation = Tables<"asset_valuations">;

export type AssetTypeInsert = TablesInsert<"asset_categories">;
export type PortfolioAssetInsert = TablesInsert<"portfolio_assets">;
export type AssetValuationInsert = TablesInsert<"asset_valuations">;

// ---------------------------------------------------------------------------
// Derived query types
//
// All .from("asset_types") calls updated to .from("asset_categories").
// All join sub-selects "asset_types(...)" updated to "asset_categories(...)".
// ---------------------------------------------------------------------------

/**
 * Full portfolio_assets row + the asset category's display name.
 * type_slug is already included via the `*` wildcard on portfolio_assets.
 */
const portfolioAssetWithTypeQuery = supabase
    .from("portfolio_assets")
    .select("*, asset_categories(name)");

export type PortfolioAssetWithType = QueryData<typeof portfolioAssetWithTypeQuery>[number];

/**
 * Lightweight summary used for dropdowns / lists.
 */
const portfolioAssetSummaryQuery = supabase
    .from("portfolio_assets")
    .select("id, name, institution");

export type PortfolioAssetSummary = QueryData<typeof portfolioAssetSummaryQuery>[number];

/**
 * Summary with category name and type_slug for display / filtering.
 */
const portfolioAssetWithTypeNameQuery = supabase
    .from("portfolio_assets")
    .select("id, name, institution, iban, ticker, isin, type_slug, asset_categories(name)");

export type PortfolioAssetWithTypeName = QueryData<typeof portfolioAssetWithTypeNameQuery>[number];

/**
 * Valuation ledger rows used for history views / charts.
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
        asset_categories(name)
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
 * Asset category export — only the display name is exported.
 */
const exportAssetTypeQuery = supabase
    .from("asset_categories")
    .select("name");

export type ExportAssetTypeRow = QueryData<typeof exportAssetTypeQuery>[number];

/**
 * Asset export — type_slug from portfolio_assets; category name from the join.
 */
const exportAssetQuery = supabase
    .from("portfolio_assets")
    .select("name, institution, login_url, comments, iban, ticker, isin, type_slug, asset_categories(name)");

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

    const { count: categoryCount } = await supabase
        .from("asset_categories")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId);

    if (categoryCount && categoryCount > 0) return true;

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
