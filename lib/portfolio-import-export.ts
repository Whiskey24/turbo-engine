import { supabase } from "@/lib/supabase";
import type {
    AssetTypeInsert,
    AssetValuationInsert,
    ExportAssetRow,
    ExportAssetTypeRow,
    ExportValuationRow,
    PortfolioAssetInsert,
} from "@/lib/database";
import { ASSET_TYPE_SLUGS } from "@/lib/database";
import { downloadTextFile, normalizeImportKey, parseTsv, toTsv } from "@/lib/portfolio-tsv";

// ---------------------------------------------------------------------------
// Column definitions
//
// type_slug removed from asset types — it is no longer stored on the type.
// type_slug added to assets       — each asset now carries its own classification.
// ---------------------------------------------------------------------------
const ASSET_TYPE_COLUMNS = ["name"] as const;

const ASSET_COLUMNS = [
    "type_name",
    "type_slug",
    "name",
    "institution",
    "login_url",
    "comments",
    "iban",
    "ticker",
    "isin",
] as const;

const TRANSACTION_COLUMNS = ["asset_name", "institution", "valuation_date", "balance_amount"] as const;

function isValidSlug(value: string): boolean {
    return (ASSET_TYPE_SLUGS as readonly string[]).includes(value);
}

type ImportSuccess = { ok: true; imported: number; skipped: number };
type ImportFailure = { ok: false; message: string };
export type ImportResult = ImportSuccess | ImportFailure;

async function getCurrentUserId(): Promise<string | null> {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user?.id ?? null;
}

function transactionKey(assetId: string, valuationDate: string): string {
    return `${assetId}|${valuationDate.trim()}`;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export async function exportPortfolioData(): Promise<{ ok: true } | { ok: false; message: string }> {
    const userId = await getCurrentUserId();
    if (!userId) {
        return { ok: false, message: "You must be signed in to export data." };
    }

    const [
        { data: assetTypes, error: typesError },
        { data: assets, error: assetsError },
        { data: valuations, error: valuationsError },
    ] = await Promise.all([
        // type_slug no longer on asset_types — select name only
        supabase
            .from("asset_types")
            .select("name")
            .eq("user_id", userId)
            .order("name"),
        // type_slug is now a direct column on portfolio_assets; asset_types join fetches display name only
        supabase
            .from("portfolio_assets")
            .select("name, institution, login_url, comments, iban, ticker, isin, type_slug, asset_types(name)")
            .eq("user_id", userId)
            .order("name"),
        supabase
            .from("asset_valuations")
            .select(`
                valuation_date,
                balance_amount,
                portfolio_assets!inner(name, institution, user_id)
            `)
            .eq("portfolio_assets.user_id", userId)
            .order("valuation_date", { ascending: false }),
    ]);

    if (typesError || assetsError || valuationsError) {
        return {
            ok: false,
            message: typesError?.message || assetsError?.message || valuationsError?.message || "Export failed.",
        };
    }

    // Asset types: name only — slug is no longer stored here
    const typeRows = (assetTypes ?? []).map((row: ExportAssetTypeRow) => ({
        name: row.name,
    }));

    // Assets: include type_slug from the asset row itself
    const assetRows = (assets ?? []).map((row: ExportAssetRow) => ({
        type_name: row.asset_types?.name ?? "",
        type_slug: row.type_slug ?? "",
        name: row.name,
        institution: row.institution,
        login_url: row.login_url ?? "",
        comments: row.comments ?? "",
        iban: row.iban ?? "",
        ticker: row.ticker ?? "",
        isin: row.isin ?? "",
    }));

    const transactionRows = (valuations ?? []).map((row: ExportValuationRow) => ({
        asset_name: row.portfolio_assets.name,
        institution: row.portfolio_assets.institution,
        valuation_date: row.valuation_date,
        balance_amount: String(row.balance_amount),
    }));

    const stamp = new Date().toISOString().slice(0, 10);
    downloadTextFile(`turbo-engine-asset-types-${stamp}.tsv`, toTsv(typeRows, [...ASSET_TYPE_COLUMNS]));
    downloadTextFile(`turbo-engine-assets-${stamp}.tsv`, toTsv(assetRows, [...ASSET_COLUMNS]));
    downloadTextFile(
        `turbo-engine-transactions-${stamp}.tsv`,
        toTsv(transactionRows, [...TRANSACTION_COLUMNS])
    );

    return { ok: true };
}

// ---------------------------------------------------------------------------
// Import: asset types
//
// type_slug column is intentionally ignored if present in the file — it is no
// longer a property of an asset type. Only the name is imported.
// ---------------------------------------------------------------------------

export async function importAssetTypesFromTsv(content: string): Promise<ImportResult> {
    const userId = await getCurrentUserId();
    if (!userId) {
        return { ok: false, message: "You must be signed in to import asset types." };
    }

    const rows = parseTsv(content);
    if (rows.length === 0) {
        return { ok: false, message: "No data rows found. Include a header row and at least one record." };
    }

    const { data: existingTypes, error: fetchError } = await supabase
        .from("asset_types")
        .select("name")
        .eq("user_id", userId);

    if (fetchError) {
        return { ok: false, message: fetchError.message };
    }

    const seenNames = new Set((existingTypes ?? []).map((type) => normalizeImportKey(type.name)));
    const payload: AssetTypeInsert[] = [];
    let skipped = 0;

    for (const row of rows) {
        if (!row.name?.trim()) {
            skipped++;
            continue;
        }

        const nameKey = normalizeImportKey(row.name);
        if (seenNames.has(nameKey)) {
            skipped++;
            continue;
        }

        seenNames.add(nameKey);
        payload.push({
            user_id: userId,
            name: row.name.trim(),
            // type_slug intentionally omitted — no longer part of asset_types
        });
    }

    if (payload.length === 0) {
        return {
            ok: false,
            message: "No new asset types to import (duplicate names in file or database, or empty rows).",
        };
    }

    const { error } = await supabase.from("asset_types").insert(payload);
    if (error) {
        return { ok: false, message: error.message };
    }

    return { ok: true, imported: payload.length, skipped };
}

// ---------------------------------------------------------------------------
// Import: assets
//
// type_slug is now a required column in the TSV and is validated against the
// allowed slug list before insertion.
// ---------------------------------------------------------------------------

export async function importAssetsFromTsv(content: string): Promise<ImportResult> {
    const userId = await getCurrentUserId();
    if (!userId) {
        return { ok: false, message: "You must be signed in to import assets." };
    }

    const rows = parseTsv(content);
    if (rows.length === 0) {
        return { ok: false, message: "No data rows found. Include a header row and at least one record." };
    }

    const { data: types, error: typesError } = await supabase
        .from("asset_types")
        .select("id, name")
        .eq("user_id", userId);

    if (typesError) {
        return { ok: false, message: typesError.message };
    }

    const typeIdByName = new Map(
        (types ?? []).map((type) => [normalizeImportKey(type.name), type.id] as const)
    );

    const { data: existingAssets, error: assetsError } = await supabase
        .from("portfolio_assets")
        .select("name")
        .eq("user_id", userId);

    if (assetsError) {
        return { ok: false, message: assetsError.message };
    }

    const seenNames = new Set((existingAssets ?? []).map((asset) => normalizeImportKey(asset.name)));
    const payload: PortfolioAssetInsert[] = [];
    let skipped = 0;

    for (const row of rows) {
        if (!row.name?.trim() || !row.institution?.trim() || !row.type_name?.trim()) {
            skipped++;
            continue;
        }

        const nameKey = normalizeImportKey(row.name);
        if (seenNames.has(nameKey)) {
            skipped++;
            continue;
        }

        const typeId = typeIdByName.get(normalizeImportKey(row.type_name));
        if (!typeId) {
            return { ok: false, message: `Unknown asset type "${row.type_name}" for asset "${row.name}".` };
        }

        // type_slug is required on assets — validate it
        const slug = row.type_slug?.trim() ?? "";
        if (!slug) {
            return {
                ok: false,
                message: `Missing type_slug for asset "${row.name.trim()}". Must be one of: ${ASSET_TYPE_SLUGS.join(", ")}.`,
            };
        }
        if (!isValidSlug(slug)) {
            return {
                ok: false,
                message: `Invalid type_slug "${slug}" for asset "${row.name.trim()}". Must be one of: ${ASSET_TYPE_SLUGS.join(", ")}.`,
            };
        }

        seenNames.add(nameKey);
        payload.push({
            user_id: userId,
            type_id: typeId,
            type_slug: slug,
            name: row.name.trim(),
            institution: row.institution.trim(),
            login_url: row.login_url || null,
            comments: row.comments || null,
            iban: row.iban || null,
            ticker: row.ticker ? row.ticker.toUpperCase() : null,
            isin: row.isin ? row.isin.toUpperCase() : null,
        });
    }

    if (payload.length === 0) {
        return {
            ok: false,
            message: "No new assets to import (duplicate names in file or database, or invalid rows).",
        };
    }

    const { error } = await supabase.from("portfolio_assets").insert(payload);
    if (error) {
        return { ok: false, message: error.message };
    }

    return { ok: true, imported: payload.length, skipped };
}

// ---------------------------------------------------------------------------
// Import: transactions (unchanged — no slug involvement)
// ---------------------------------------------------------------------------

export async function importTransactionsFromTsv(content: string): Promise<ImportResult> {
    const userId = await getCurrentUserId();
    if (!userId) {
        return { ok: false, message: "You must be signed in to import transactions." };
    }

    const rows = parseTsv(content);
    if (rows.length === 0) {
        return { ok: false, message: "No data rows found. Include a header row and at least one record." };
    }

    const { data: assets, error: assetsError } = await supabase
        .from("portfolio_assets")
        .select("id, name, institution")
        .eq("user_id", userId);

    if (assetsError) {
        return { ok: false, message: assetsError.message };
    }

    const assetIdByName = new Map<string, string>();
    for (const asset of assets ?? []) {
        const nameKey = normalizeImportKey(asset.name);
        if (assetIdByName.has(nameKey)) {
            return {
                ok: false,
                message: `Multiple assets named "${asset.name}" exist. Resolve duplicate names in Master Data before importing transactions.`,
            };
        }
        assetIdByName.set(nameKey, asset.id);
    }

    const { data: existingValuations, error: valuationsError } = await supabase
        .from("asset_valuations")
        .select("asset_id, valuation_date, portfolio_assets!inner(user_id)")
        .eq("portfolio_assets.user_id", userId);

    if (valuationsError) {
        return { ok: false, message: valuationsError.message };
    }

    const seenKeys = new Set(
        (existingValuations ?? []).map((row) => transactionKey(row.asset_id, row.valuation_date))
    );

    const payload: AssetValuationInsert[] = [];
    let skipped = 0;

    for (const row of rows) {
        if (!row.asset_name?.trim() || !row.valuation_date?.trim() || !row.balance_amount) {
            skipped++;
            continue;
        }

        const assetId = assetIdByName.get(normalizeImportKey(row.asset_name));
        if (!assetId) {
            return {
                ok: false,
                message: `Unknown asset "${row.asset_name}" for date ${row.valuation_date}.`,
            };
        }

        const valuationDate = row.valuation_date.trim();
        const duplicateKey = transactionKey(assetId, valuationDate);
        if (seenKeys.has(duplicateKey)) {
            skipped++;
            continue;
        }

        const balance = Number.parseFloat(row.balance_amount.replace(",", "."));
        if (Number.isNaN(balance)) {
            return { ok: false, message: `Invalid balance "${row.balance_amount}" for ${row.asset_name}.` };
        }

        seenKeys.add(duplicateKey);
        payload.push({
            user_id: userId,
            asset_id: assetId,
            valuation_date: valuationDate,
            balance_amount: balance,
        });
    }

    if (payload.length === 0) {
        return {
            ok: false,
            message: "No new transactions to import (duplicate asset/date pairs in file or database, or invalid rows).",
        };
    }

    const { error } = await supabase.from("asset_valuations").insert(payload);
    if (error) {
        return { ok: false, message: error.message };
    }

    return { ok: true, imported: payload.length, skipped };
}
