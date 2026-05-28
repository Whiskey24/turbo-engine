import type { QueryData } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Json, Tables, TablesInsert } from "@/lib/database.types";

export type { Database, Tables, TablesInsert } from "@/lib/database.types";

export type AssetType = Tables<"asset_types">;
export type PortfolioAsset = Tables<"portfolio_assets">;
export type AssetValuation = Tables<"asset_valuations">;

export type AssetTypeInsert = TablesInsert<"asset_types">;
export type PortfolioAssetInsert = TablesInsert<"portfolio_assets">;
export type AssetValuationInsert = TablesInsert<"asset_valuations">;

const portfolioAssetWithTypeQuery = supabase
    .from("portfolio_assets")
    .select("*, asset_types(name, type_slug)");

export type PortfolioAssetWithType = QueryData<typeof portfolioAssetWithTypeQuery>[number];

const portfolioAssetSummaryQuery = supabase
    .from("portfolio_assets")
    .select("id, name, institution");

export type PortfolioAssetSummary = QueryData<typeof portfolioAssetSummaryQuery>[number];

const portfolioAssetWithTypeNameQuery = supabase
    .from("portfolio_assets")
    .select("id, name, institution, iban, ticker, isin, asset_types(name, type_slug)");

export type PortfolioAssetWithTypeName = QueryData<typeof portfolioAssetWithTypeNameQuery>[number];

const valuationLedgerQuery = supabase.from("asset_valuations").select(`
    id,
    asset_id,
    valuation_date,
    balance_amount,
    portfolio_assets(
        name,
        institution,
        asset_types(name, type_slug)
    )
`);

export type ValuationLedgerRow = QueryData<typeof valuationLedgerQuery>[number];

const valuationReferenceQuery = supabase
    .from("asset_valuations")
    .select("valuation_date, balance_amount");

export type ValuationReference = QueryData<typeof valuationReferenceQuery>[number];

const exportAssetTypeQuery = supabase
    .from("asset_types")
    .select("name, type_slug");

export type ExportAssetTypeRow = QueryData<typeof exportAssetTypeQuery>[number];

const exportAssetQuery = supabase
    .from("portfolio_assets")
    .select("name, institution, login_url, comments, iban, ticker, isin, asset_types(name, type_slug)");

export type ExportAssetRow = QueryData<typeof exportAssetQuery>[number];

const exportValuationQuery = supabase.from("asset_valuations").select(`
    valuation_date,
    balance_amount,
    portfolio_assets!inner(name, institution, user_id)
`);

export type ExportValuationRow = QueryData<typeof exportValuationQuery>[number];

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

// ---- User Settings ----

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