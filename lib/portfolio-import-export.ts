import { supabase } from "@/lib/supabase";
import type {
    AssetTypeInsert,
    AssetValuationInsert,
    ExportAssetRow,
    ExportAssetTypeRow,
    ExportTransactionRow,
    ExportValuationRow,
    PortfolioAssetInsert,
} from "@/lib/database";
import { ASSET_TYPE_SLUGS } from "@/lib/database";
import { downloadTextFile, normalizeImportKey, parseTsv, toTsv } from "@/lib/portfolio-tsv";

// ---------------------------------------------------------------------------
// Column definitions
//
// Asset categories are no longer a separate file — the category name travels
// as type_name inside the assets file. On import, missing categories are
// created automatically.
//
// Bond-specific columns are included in the assets file; they are left blank
// for non-bond assets and populated only when type_slug = BOND.
//
// stock_transactions covers asset_transactions. tax_lots and lot_matches are
// derived by the database trigger and are NOT exported — they are recreated
// automatically when transactions are re-imported.
// ---------------------------------------------------------------------------

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
    // Bond-specific — blank for all other slugs
    "nominal_value",
    "coupon_rate",       // decimal (0.045 = 4.5%); blank for non-bonds
    "coupon_frequency",
    "maturity_date",
    "first_coupon_date",
    "day_count_basis",
] as const;

const VALUATION_COLUMNS = ["asset_name", "institution", "valuation_date", "balance_amount"] as const;

const STOCK_TRANSACTION_COLUMNS = [
    "asset_name",
    "transaction_type",
    "transacted_at",
    "settled_at",
    "quantity",
    "price_per_unit",
    "total_amount",
    "fee",
    "tax_amount",
    "currency",
    "exchange_rate",
    "broker",
    "external_ref",
    "notes",
    "accrued_interest",   // blank for non-bond transactions
] as const;

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

function valuationKey(assetId: string, valuationDate: string): string {
    return `${assetId}|${valuationDate.trim()}`;
}

function transactionKey(assetId: string, transactedAt: string): string {
    return `${assetId}|${transactedAt.trim()}`;
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
        { data: assets, error: assetsError },
        { data: valuations, error: valuationsError },
        { data: transactions, error: transactionsError },
    ] = await Promise.all([
        // Bond fields included — blank in the TSV for non-bond assets
        supabase
            .from("portfolio_assets")
            .select(`
            name, institution, login_url, comments, iban, ticker, isin, type_slug,
            nominal_value, coupon_rate, coupon_frequency, maturity_date, first_coupon_date, day_count_basis,
            asset_categories(name)
        `)
            .eq("user_id", userId)
            .order("name"),

        supabase
            .from("asset_valuations")
            .select("valuation_date, balance_amount, portfolio_assets!inner(name, institution, user_id)")
            .eq("portfolio_assets.user_id", userId)
            .order("valuation_date", { ascending: false }),

        // tax_lots and lot_matches are NOT exported — they are recreated by the
        // FIFO trigger when transactions are re-imported
        supabase
            .from("asset_transactions")
            .select(`
            transaction_type, transacted_at, settled_at, quantity, price_per_unit,
            total_amount, fee, tax_amount, currency, exchange_rate, broker, external_ref,
            notes, accrued_interest, portfolio_assets!inner(name, user_id)
        `)
            .eq("portfolio_assets.user_id", userId)
            .order("transacted_at", { ascending: true }),
    ]);

    if (assetsError || valuationsError || transactionsError) {
        return {
            ok: false,
            message: assetsError?.message || valuationsError?.message || transactionsError?.message || "Export failed.",
        };
    }

    const assetRows = (assets ?? []).map((row: ExportAssetRow) => ({
        type_name: row.asset_categories?.name ?? "",
        type_slug: row.type_slug ?? "",
        name: row.name,
        institution: row.institution,
        login_url: row.login_url ?? "",
        comments: row.comments ?? "",
        iban: row.iban ?? "",
        ticker: row.ticker ?? "",
        isin: row.isin ?? "",
        // Bond fields — empty string for non-bond assets
        nominal_value: row.nominal_value != null ? String(row.nominal_value) : "",
        coupon_rate: row.coupon_rate != null ? String(row.coupon_rate) : "",
        coupon_frequency: row.coupon_frequency != null ? String(row.coupon_frequency) : "",
        maturity_date: row.maturity_date ?? "",
        first_coupon_date: row.first_coupon_date ?? "",
        day_count_basis: row.day_count_basis ?? "",
    }));

    const valuationRows = (valuations ?? []).map((row: ExportValuationRow) => ({
        asset_name: row.portfolio_assets.name,
        institution: row.portfolio_assets.institution,
        valuation_date: row.valuation_date,
        balance_amount: String(row.balance_amount),
    }));

    const transactionRows = (transactions ?? []).map((row: ExportTransactionRow) => ({
        asset_name: row.portfolio_assets.name,
        transaction_type: row.transaction_type,
        transacted_at: row.transacted_at,
        settled_at: row.settled_at ?? "",
        quantity: String(row.quantity),
        price_per_unit: String(row.price_per_unit),
        total_amount: String(row.total_amount),
        fee: String(row.fee),
        tax_amount: String(row.tax_amount),
        currency: row.currency,
        exchange_rate: String(row.exchange_rate),
        broker: row.broker ?? "",
        external_ref: row.external_ref ?? "",
        notes: row.notes ?? "",
        accrued_interest: row.accrued_interest != null ? String(row.accrued_interest) : "",
    }));

    const stamp = new Date().toISOString().slice(0, 10);
    downloadTextFile(`portfolio-assets-${stamp}.tsv`, toTsv(assetRows, [...ASSET_COLUMNS]));
    downloadTextFile(`portfolio-valuations-${stamp}.tsv`, toTsv(valuationRows, [...VALUATION_COLUMNS]));
    downloadTextFile(`portfolio-stock-transactions-${stamp}.tsv`, toTsv(transactionRows, [...STOCK_TRANSACTION_COLUMNS]));

    return { ok: true };
}

// ---------------------------------------------------------------------------
// Import: assets
//
// Categories (type_name) are created on-the-fly if they do not already exist
// for the user — no separate asset-types import step is needed.
// Bond fields are parsed when type_slug === BOND; ignored otherwise.
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

    // Fetch existing categories so we can upsert missing ones below
    const { data: existingCategories, error: catFetchError } = await supabase
        .from("asset_categories")
        .select("id, name")
        .eq("user_id", userId);

    if (catFetchError) {
        return { ok: false, message: catFetchError.message };
    }

    const categoryIdByName = new Map(
        (existingCategories ?? []).map((c) => [normalizeImportKey(c.name), c.id] as const)
    );

    // Collect any category names in the file that don't exist yet
    const missingCategoryNames = [
        ...new Set(
            rows
                .map((r) => r.type_name?.trim())
                .filter((n): n is string => !!n && !categoryIdByName.has(normalizeImportKey(n)))
        ),
    ];

    if (missingCategoryNames.length > 0) {
        const newCategoryPayload: AssetTypeInsert[] = missingCategoryNames.map((name) => ({
            user_id: userId,
            name,
        }));

        const { data: inserted, error: catInsertError } = await supabase
            .from("asset_categories")
            .insert(newCategoryPayload)
            .select("id, name");

        if (catInsertError) {
            return { ok: false, message: `Failed to create categories: ${catInsertError.message}` };
        }

        for (const cat of inserted ?? []) {
            categoryIdByName.set(normalizeImportKey(cat.name), cat.id);
        }
    }

    // Fetch existing assets for duplicate detection
    const { data: existingAssets, error: assetsError } = await supabase
        .from("portfolio_assets")
        .select("name")
        .eq("user_id", userId);

    if (assetsError) {
        return { ok: false, message: assetsError.message };
    }

    const seenNames = new Set((existingAssets ?? []).map((a) => normalizeImportKey(a.name)));
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

        const typeId = categoryIdByName.get(normalizeImportKey(row.type_name));
        if (!typeId) {
            // Should not happen since we auto-created above, but guard anyway
            return { ok: false, message: `Category "${row.type_name}" could not be resolved for asset "${row.name}".` };
        }

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

        const isBond = slug === "BOND";

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
            // Bond fields — null for non-bond assets
            nominal_value: isBond && row.nominal_value ? parseFloat(row.nominal_value) : null,
            coupon_rate: isBond && row.coupon_rate ? parseFloat(row.coupon_rate) : null,
            coupon_frequency: isBond && row.coupon_frequency ? parseInt(row.coupon_frequency) : null,
            maturity_date: isBond && row.maturity_date ? row.maturity_date.trim() : null,
            first_coupon_date: isBond && row.first_coupon_date ? row.first_coupon_date.trim() : null,
            day_count_basis: isBond && row.day_count_basis ? row.day_count_basis.trim() : null,
        });
    }

    if (payload.length === 0) {
        return {
            ok: false,
            message: "No new assets to import (all names already exist, or all rows were invalid).",
        };
    }

    const { error } = await supabase.from("portfolio_assets").insert(payload);
    if (error) {
        return { ok: false, message: error.message };
    }

    return { ok: true, imported: payload.length, skipped };
}

// ---------------------------------------------------------------------------
// Import: valuations (asset_valuations — manual balance snapshots)
// ---------------------------------------------------------------------------

export async function importValuationsFromTsv(content: string): Promise<ImportResult> {
    const userId = await getCurrentUserId();
    if (!userId) {
        return { ok: false, message: "You must be signed in to import valuations." };
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
                message: `Multiple assets named "${asset.name}" exist. Resolve duplicate names before importing valuations.`,
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
        (existingValuations ?? []).map((row) => valuationKey(row.asset_id, row.valuation_date))
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

        const vDate = row.valuation_date.trim();
        const dupKey = valuationKey(assetId, vDate);
        if (seenKeys.has(dupKey)) {
            skipped++;
            continue;
        }

        const balance = Number.parseFloat(row.balance_amount.replace(",", "."));
        if (Number.isNaN(balance)) {
            return { ok: false, message: `Invalid balance "${row.balance_amount}" for ${row.asset_name}.` };
        }

        seenKeys.add(dupKey);
        payload.push({ user_id: userId, asset_id: assetId, valuation_date: vDate, balance_amount: balance });
    }

    if (payload.length === 0) {
        return {
            ok: false,
            message: "No new valuations to import (duplicate asset/date pairs, or invalid rows).",
        };
    }

    const { error } = await supabase.from("asset_valuations").insert(payload);
    if (error) {
        return { ok: false, message: error.message };
    }

    return { ok: true, imported: payload.length, skipped };
}

// ---------------------------------------------------------------------------
// Import: stock transactions (asset_transactions)
//
// Inserting a row triggers the FIFO function (process_fifo_lots) which
// automatically recreates tax_lots and lot_matches — those tables are never
// imported directly.
//
// Deduplication key: (asset_id, transacted_at). Two transactions for the
// same asset at the exact same timestamp are assumed to be the same record.
//
// Import order matters: BUY / TRANSFER_IN transactions must precede their
// corresponding SELL / TRANSFER_OUT rows. The export is ordered by
// transacted_at ASC, so a round-trip preserves the correct sequence.
// ---------------------------------------------------------------------------

export async function importStockTransactionsFromTsv(content: string): Promise<ImportResult> {
    const userId = await getCurrentUserId();
    if (!userId) {
        return { ok: false, message: "You must be signed in to import stock transactions." };
    }

    const rows = parseTsv(content);
    if (rows.length === 0) {
        return { ok: false, message: "No data rows found. Include a header row and at least one record." };
    }

    const { data: assets, error: assetsError } = await supabase
        .from("portfolio_assets")
        .select("id, name")
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
                message: `Multiple assets named "${asset.name}" exist. Resolve duplicate names before importing stock transactions.`,
            };
        }
        assetIdByName.set(nameKey, asset.id);
    }

    // Build dedup set from existing transactions
    const { data: existingTx, error: txFetchError } = await supabase
        .from("asset_transactions")
        .select("asset_id, transacted_at, portfolio_assets!inner(user_id)")
        .eq("portfolio_assets.user_id", userId);

    if (txFetchError) {
        return { ok: false, message: txFetchError.message };
    }

    const seenKeys = new Set(
        (existingTx ?? []).map((row) => transactionKey(row.asset_id, row.transacted_at))
    );

    // Collect valid rows first so we can insert in a single batch while
    // preserving the file's original order (critical for FIFO correctness)
    type TxInsert = {
        user_id: string;
        asset_id: string;
        transaction_type: string;
        transacted_at: string;
        settled_at: string | null;
        quantity: number;
        price_per_unit: number;
        total_amount: number;
        fee: number;
        tax_amount: number;
        currency: string;
        exchange_rate: number;
        broker: string | null;
        external_ref: string | null;
        notes: string | null;
        accrued_interest: number | null;
    };

    const payload: TxInsert[] = [];
    let skipped = 0;

    for (const row of rows) {
        if (!row.asset_name?.trim() || !row.transaction_type?.trim() || !row.transacted_at?.trim()) {
            skipped++;
            continue;
        }

        const assetId = assetIdByName.get(normalizeImportKey(row.asset_name));
        if (!assetId) {
            return {
                ok: false,
                message: `Unknown asset "${row.asset_name}" on row with transacted_at ${row.transacted_at}.`,
            };
        }

        const txAt = row.transacted_at.trim();
        const dupKey = transactionKey(assetId, txAt);
        if (seenKeys.has(dupKey)) {
            skipped++;
            continue;
        }

        const quantity = parseFloat(row.quantity ?? "0");
        const pricePerUnit = parseFloat(row.price_per_unit ?? "0");
        const totalAmount = parseFloat((row.total_amount ?? "0").replace(",", "."));
        const fee = parseFloat(row.fee ?? "0");
        const taxAmount = parseFloat(row.tax_amount ?? "0");
        const exchangeRate = parseFloat(row.exchange_rate ?? "1");

        if (Number.isNaN(totalAmount)) {
            return { ok: false, message: `Invalid total_amount "${row.total_amount}" for ${row.asset_name}.` };
        }

        const ai = row.accrued_interest?.trim();

        seenKeys.add(dupKey);
        payload.push({
            user_id: userId,
            asset_id: assetId,
            transaction_type: row.transaction_type.trim().toUpperCase(),
            transacted_at: txAt,
            settled_at: row.settled_at?.trim() || null,
            quantity: Number.isNaN(quantity) ? 0 : quantity,
            price_per_unit: Number.isNaN(pricePerUnit) ? 0 : pricePerUnit,
            total_amount: totalAmount,
            fee: Number.isNaN(fee) ? 0 : fee,
            tax_amount: Number.isNaN(taxAmount) ? 0 : taxAmount,
            currency: row.currency?.trim() || "EUR",
            exchange_rate: Number.isNaN(exchangeRate) ? 1 : exchangeRate,
            broker: row.broker?.trim() || null,
            external_ref: row.external_ref?.trim() || null,
            notes: row.notes?.trim() || null,
            accrued_interest: ai ? parseFloat(ai) : null,
        });
    }

    if (payload.length === 0) {
        return {
            ok: false,
            message: "No new stock transactions to import (all already exist, or all rows were invalid).",
        };
    }

    // Insert one at a time in file order to satisfy FIFO: a SELL row must
    // find its BUY lots already present. Batch insert would not guarantee
    // that the trigger sees earlier rows in the same batch first.
    let imported = 0;
    for (const tx of payload) {
        const { error } = await supabase.from("asset_transactions").insert(tx);
        if (error) {
            return {
                ok: false,
                message: `Failed on transaction for "${tx.asset_id}" at ${tx.transacted_at}: ${error.message}`,
            };
        }
        imported++;
    }

    return { ok: true, imported, skipped };
}
