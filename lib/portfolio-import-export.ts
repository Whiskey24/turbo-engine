import { supabase } from "@/lib/supabase";
import type {
    AssetTypeInsert,
    AssetValuationInsert,
    ExportAssetRow,
    ExportAssetTypeRow,
    ExportValuationRow,
    PortfolioAssetInsert,
} from "@/lib/database";
import { downloadTextFile, normalizeImportKey, parseBoolean, parseTsv, toTsv } from "@/lib/portfolio-tsv";

const ASSET_TYPE_COLUMNS = ["name", "requires_iban", "requires_ticker", "requires_isin"] as const;
const ASSET_COLUMNS = [
    "type_name",
    "name",
    "institution",
    "login_url",
    "comments",
    "iban",
    "ticker",
    "isin",
] as const;
const TRANSACTION_COLUMNS = ["asset_name", "institution", "valuation_date", "balance_amount"] as const;

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
        supabase
            .from("asset_types")
            .select("name, requires_iban, requires_ticker, requires_isin")
            .eq("user_id", userId)
            .order("name"),
        supabase
            .from("portfolio_assets")
            .select("name, institution, login_url, comments, iban, ticker, isin, asset_types(name)")
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

    const typeRows = (assetTypes ?? []).map((row: ExportAssetTypeRow) => ({
        name: row.name,
        requires_iban: String(row.requires_iban),
        requires_ticker: String(row.requires_ticker),
        requires_isin: String(row.requires_isin),
    }));

    const assetRows = (assets ?? []).map((row: ExportAssetRow) => ({
        type_name: row.asset_types?.name ?? "",
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
            requires_iban: parseBoolean(row.requires_iban ?? ""),
            requires_ticker: parseBoolean(row.requires_ticker ?? ""),
            requires_isin: parseBoolean(row.requires_isin ?? ""),
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

        seenNames.add(nameKey);
        payload.push({
            user_id: userId,
            type_id: typeId,
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
