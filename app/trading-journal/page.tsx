"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Tables, TablesInsert } from "@/lib/database";

// ---------------------------------------------------------------------------
// Types — use generated DB view/table types directly instead of duplicating
// ---------------------------------------------------------------------------

type UnrealizedPnLRow = Tables<"unrealized_pnl">;
type RealizedPnLRow = Tables<"realized_pnl">;
type CurrentHoldingRow = Tables<"current_holdings">;

/** Minimal shape selected from portfolio_assets for the BUY asset dropdown. */
interface TradableAsset {
    id: string;
    name: string;
    ticker: string | null;
    type_slug: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ASSET_TYPE_LABELS: Record<string, string> = {
    STOCK: "Stock",
    CRYPTO: "Cryptocurrency",
    FUND_ETF: "Fund / ETF",
    BOND: "Bond",
};

const ASSET_TYPE_BADGES: Record<string, string> = {
    STOCK: "bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-900/50",
    CRYPTO: "bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-900/50",
    FUND_ETF: "bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-900/50",
    BOND: "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-900/50",
};

const TRADEABLE_ASSET_TYPES = ["STOCK", "CRYPTO", "FUND_ETF", "BOND"] as const;
type TradeableAssetType = (typeof TRADEABLE_ASSET_TYPES)[number];

const COMMON_CURRENCIES = ["EUR", "USD", "GBP", "CHF", "JPY", "SEK", "NOK", "DKK"];

// ---------------------------------------------------------------------------
// Trade form state
// ---------------------------------------------------------------------------

interface TradeFormData {
    transactionType: "BUY" | "SELL";
    assetId: string;
    transactedAt: string;   // "YYYY-MM-DDTHH:mm" for <input type="datetime-local">
    quantity: string;
    pricePerUnit: string;
    totalAmount: string;    // auto-calculated but user-editable for override
    fee: string;
    currency: string;
    exchangeRate: string;
    broker: string;
    notes: string;
}

function buildDefaultForm(baseCurrency: string): TradeFormData {
    return {
        transactionType: "BUY",
        assetId: "",
        transactedAt: new Date().toISOString().slice(0, 16),
        quantity: "",
        pricePerUnit: "",
        totalAmount: "",
        fee: "0",
        currency: baseCurrency,
        exchangeRate: "1",
        broker: "",
        notes: "",
    };
}

// ---------------------------------------------------------------------------
// TradeModal
// ---------------------------------------------------------------------------

interface TradeModalProps {
    baseCurrency: string;
    onClose: () => void;
    onSuccess: () => void;
}

function TradeModal({ baseCurrency, onClose, onSuccess }: TradeModalProps) {
    const [form, setForm] = useState<TradeFormData>(buildDefaultForm(baseCurrency));
    const [buyableAssets, setBuyableAssets] = useState<TradableAsset[]>([]);
    const [sellableHoldings, setSellableHoldings] = useState<CurrentHoldingRow[]>([]);
    const [loadingAssets, setLoadingAssets] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [showAdvanced, setShowAdvanced] = useState(false);

    // ── Fetch asset lists once on mount ──────────────────────────────────────
    useEffect(() => {
        async function loadAssets() {
            setLoadingAssets(true);
            const [buyResult, sellResult] = await Promise.all([
                supabase
                    .from("portfolio_assets")
                    .select("id, name, ticker, type_slug")
                    .in("type_slug", [...TRADEABLE_ASSET_TYPES])
                    .order("name"),
                supabase
                    .from("current_holdings")
                    .select("*")
                    .in("asset_type", [...TRADEABLE_ASSET_TYPES])
                    .order("asset_name"),
            ]);
            if (buyResult.data) setBuyableAssets(buyResult.data as TradableAsset[]);
            if (sellResult.data) setSellableHoldings(sellResult.data as CurrentHoldingRow[]);
            setLoadingAssets(false);
        }
        void loadAssets();
    }, []);

    // ── Auto-calculate total_amount from qty × price ± fee ───────────────────
    useEffect(() => {
        const qty = parseFloat(form.quantity);
        const price = parseFloat(form.pricePerUnit);
        const fee = parseFloat(form.fee) || 0;
        if (!isNaN(qty) && qty > 0 && !isNaN(price) && price >= 0) {
            const gross = qty * price;
            const total = form.transactionType === "BUY" ? gross + fee : gross - fee;
            setForm((prev) => ({ ...prev, totalAmount: Math.max(0, total).toFixed(4) }));
        }
    }, [form.quantity, form.pricePerUnit, form.fee, form.transactionType]);

    // ── Helpers ───────────────────────────────────────────────────────────────
    const update = (field: keyof TradeFormData, value: string) =>
        setForm((prev) => ({ ...prev, [field]: value }));

    const switchType = (type: "BUY" | "SELL") =>
        setForm((prev) => ({ ...prev, transactionType: type, assetId: "" }));

    const selectedHolding = sellableHoldings.find((h) => h.asset_id === form.assetId);

    // ── Validation ────────────────────────────────────────────────────────────
    function validate(): string | null {
        if (!form.assetId) return "Please select an asset.";

        const qty = parseFloat(form.quantity);
        if (isNaN(qty) || qty <= 0) return "Quantity must be a positive number.";

        const price = parseFloat(form.pricePerUnit);
        if (isNaN(price) || price < 0) return "Price per unit must be zero or greater.";

        const total = parseFloat(form.totalAmount);
        if (isNaN(total) || total < 0) return "Total amount must be zero or greater.";

        if (form.transactionType === "SELL" && selectedHolding) {
            if (qty > selectedHolding.quantity_held) {
                return `Cannot sell more than your current holding of ${selectedHolding.quantity_held} units.`;
            }
        }

        const rate = parseFloat(form.exchangeRate);
        if (isNaN(rate) || rate <= 0) return "Exchange rate must be a positive number.";

        return null;
    }

    // ── Submit ────────────────────────────────────────────────────────────────
    async function handleSubmit() {
        const validationError = validate();
        if (validationError) {
            setFormError(validationError);
            return;
        }
        setFormError(null);
        setSubmitting(true);

        try {
            const insert: TablesInsert<"asset_transactions"> = {
                asset_id: form.assetId,
                transaction_type: form.transactionType,
                transacted_at: new Date(form.transactedAt).toISOString(),
                quantity: parseFloat(form.quantity),
                price_per_unit: parseFloat(form.pricePerUnit),
                total_amount: parseFloat(form.totalAmount),
                fee: parseFloat(form.fee) || 0,
                currency: form.currency,
                exchange_rate: parseFloat(form.exchangeRate) || 1,
                broker: form.broker || null,
                notes: form.notes || null,
            };

            const { error } = await supabase.from("asset_transactions").insert(insert);
            if (error) throw error;

            onSuccess();
            onClose();
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Failed to record transaction.";
            setFormError(message);
        } finally {
            setSubmitting(false);
        }
    }

    const isSell = form.transactionType === "SELL";
    const inputCls =
        "w-full bg-background border border-border text-foreground text-sm font-mono rounded-lg px-3 py-2.5 outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition";

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden">

                {/* ── Header ── */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                    <h2 className="text-lg font-bold tracking-tight text-foreground">Record Trade</h2>
                    <button
                        onClick={onClose}
                        aria-label="Close"
                        className="w-8 h-8 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition text-xl leading-none"
                    >
                        ×
                    </button>
                </div>

                {/* ── Body (scrollable) ── */}
                <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">

                    {/* BUY / SELL toggle */}
                    <div className="flex gap-2 p-1 bg-muted rounded-xl">
                        <button
                            onClick={() => switchType("BUY")}
                            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${!isSell
                                    ? "bg-emerald-600 text-white shadow"
                                    : "text-muted-foreground hover:text-foreground"
                                }`}
                        >
                            Buy
                        </button>
                        <button
                            onClick={() => switchType("SELL")}
                            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${isSell
                                    ? "bg-rose-600 text-white shadow"
                                    : "text-muted-foreground hover:text-foreground"
                                }`}
                        >
                            Sell
                        </button>
                    </div>

                    {/* Asset selector */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Asset
                            {isSell && (
                                <span className="ml-1 text-rose-500 normal-case font-normal">
                                    — open positions only
                                </span>
                            )}
                        </label>
                        {loadingAssets ? (
                            <div className="h-10 bg-muted animate-pulse rounded-lg" />
                        ) : isSell && sellableHoldings.length === 0 ? (
                            <p className="text-sm text-muted-foreground bg-muted rounded-lg px-3 py-2.5">
                                No open positions found. Record a buy first.
                            </p>
                        ) : (
                            <select
                                value={form.assetId}
                                onChange={(e) => update("assetId", e.target.value)}
                                className={inputCls + " font-sans cursor-pointer"}
                            >
                                <option value="">Select asset…</option>
                                {isSell
                                    ? sellableHoldings.map((h) => (
                                        <option key={h.asset_id} value={h.asset_id}>
                                            {h.asset_name}
                                            {h.ticker ? ` (${h.ticker})` : ""}
                                            {" — "}held: {h.quantity_held}
                                        </option>
                                    ))
                                    : buyableAssets.map((a) => (
                                        <option key={a.id} value={a.id}>
                                            {a.name}
                                            {a.ticker ? ` (${a.ticker})` : ""}
                                            {" — "}
                                            {ASSET_TYPE_LABELS[a.type_slug] ?? a.type_slug}
                                        </option>
                                    ))
                                }
                            </select>
                        )}
                        {/* Show holding context when an asset is selected for sell */}
                        {isSell && selectedHolding && (
                            <p className="text-xs text-muted-foreground">
                                Available:{" "}
                                <span className="font-mono font-semibold text-foreground">
                                    {selectedHolding.quantity_held}
                                </span>{" "}
                                units
                                {selectedHolding.avg_cost_per_unit_local > 0 && (
                                    <>
                                        {" · "}Avg cost:{" "}
                                        <span className="font-mono">
                                            {selectedHolding.avg_cost_per_unit_local.toFixed(4)}{" "}
                                            {selectedHolding.local_currency}
                                        </span>
                                    </>
                                )}
                            </p>
                        )}
                    </div>

                    {/* Transaction date/time */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Transaction Date &amp; Time
                        </label>
                        <input
                            type="datetime-local"
                            value={form.transactedAt}
                            onChange={(e) => update("transactedAt", e.target.value)}
                            className={inputCls + " font-sans"}
                        />
                    </div>

                    {/* Quantity + Price per unit */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Quantity
                            </label>
                            <input
                                type="number"
                                min="0"
                                step="any"
                                value={form.quantity}
                                onChange={(e) => update("quantity", e.target.value)}
                                placeholder="0.00"
                                className={inputCls}
                            />
                            {isSell && selectedHolding && (
                                <button
                                    type="button"
                                    onClick={() => update("quantity", String(selectedHolding.quantity_held))}
                                    className="text-[10px] text-emerald-600 dark:text-emerald-400 hover:underline font-semibold"
                                >
                                    Use max ({selectedHolding.quantity_held})
                                </button>
                            )}
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Price Per Unit
                            </label>
                            <input
                                type="number"
                                min="0"
                                step="any"
                                value={form.pricePerUnit}
                                onChange={(e) => update("pricePerUnit", e.target.value)}
                                placeholder="0.00"
                                className={inputCls}
                            />
                        </div>
                    </div>

                    {/* Fee + Total amount */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Fee
                            </label>
                            <input
                                type="number"
                                min="0"
                                step="any"
                                value={form.fee}
                                onChange={(e) => update("fee", e.target.value)}
                                placeholder="0.00"
                                className={inputCls}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Total Amount{" "}
                                <span className="font-normal normal-case text-muted-foreground/60">
                                    (auto)
                                </span>
                            </label>
                            <input
                                type="number"
                                min="0"
                                step="any"
                                value={form.totalAmount}
                                onChange={(e) => update("totalAmount", e.target.value)}
                                placeholder="0.00"
                                className={inputCls}
                            />
                        </div>
                    </div>

                    {/* Currency + FX rate */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Currency
                            </label>
                            <select
                                value={form.currency}
                                onChange={(e) => {
                                    const next = e.target.value;
                                    update("currency", next);
                                    if (next === baseCurrency) update("exchangeRate", "1");
                                }}
                                className={inputCls + " font-sans cursor-pointer"}
                            >
                                {COMMON_CURRENCIES.map((c) => (
                                    <option key={c} value={c}>{c}</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                FX Rate → {baseCurrency}
                            </label>
                            <input
                                type="number"
                                min="0.000001"
                                step="any"
                                value={form.exchangeRate}
                                onChange={(e) => update("exchangeRate", e.target.value)}
                                placeholder="1.0"
                                disabled={form.currency === baseCurrency}
                                className={inputCls + (form.currency === baseCurrency ? " opacity-40 cursor-not-allowed" : "")}
                            />
                        </div>
                    </div>

                    {/* Optional fields */}
                    <div>
                        <button
                            type="button"
                            onClick={() => setShowAdvanced((v) => !v)}
                            className="text-xs font-semibold text-muted-foreground hover:text-foreground transition flex items-center gap-1.5"
                        >
                            <span className="text-[10px]">{showAdvanced ? "▾" : "▸"}</span>
                            Optional — Broker &amp; Notes
                        </button>
                        {showAdvanced && (
                            <div className="mt-3 space-y-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                        Broker
                                    </label>
                                    <input
                                        type="text"
                                        value={form.broker}
                                        onChange={(e) => update("broker", e.target.value)}
                                        placeholder="e.g. DEGIRO, Interactive Brokers"
                                        className={inputCls + " font-sans"}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                        Notes
                                    </label>
                                    <textarea
                                        value={form.notes}
                                        onChange={(e) => update("notes", e.target.value)}
                                        placeholder="Optional trade notes…"
                                        rows={2}
                                        className={inputCls + " font-sans resize-none"}
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Validation error */}
                    {formError && (
                        <p className="text-sm text-rose-500 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-lg px-4 py-2.5">
                            {formError}
                        </p>
                    )}
                </div>

                {/* ── Footer ── */}
                <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        disabled={submitting}
                        className="px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={submitting || loadingAssets}
                        className={`px-5 py-2 text-sm font-semibold rounded-lg text-white transition shadow disabled:opacity-50 ${isSell
                                ? "bg-rose-600 hover:bg-rose-700"
                                : "bg-emerald-600 hover:bg-emerald-700"
                            }`}
                    >
                        {submitting ? "Submitting…" : isSell ? "Record Sell" : "Record Buy"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// TradingJournalPage
// ---------------------------------------------------------------------------

export default function TradingJournalPage() {
    const [activeTab, setActiveTab] = useState<"unrealized" | "realized">("unrealized");
    const [selectedType, setSelectedType] = useState<string>("ALL");
    const [showTradeModal, setShowTradeModal] = useState(false);

    const [unrealizedData, setUnrealizedData] = useState<UnrealizedPnLRow[]>([]);
    const [realizedData, setRealizedData] = useState<RealizedPnLRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // ── Data fetching — extracted so it can be called after a trade ──────────
    const fetchJournalData = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);

            const [unrealizedResult, realizedResult] = await Promise.all([
                supabase
                    .from("unrealized_pnl")
                    .select("*")
                    .in("asset_type", [...TRADEABLE_ASSET_TYPES]),
                supabase
                    .from("realized_pnl")
                    .select("*")
                    .in("asset_type", [...TRADEABLE_ASSET_TYPES])
                    .order("sold_at", { ascending: false }),
            ]);

            if (unrealizedResult.error) throw unrealizedResult.error;
            if (realizedResult.error) throw realizedResult.error;

            setUnrealizedData((unrealizedResult.data as UnrealizedPnLRow[]) ?? []);
            setRealizedData((realizedResult.data as RealizedPnLRow[]) ?? []);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Failed to load ledger views.";
            console.error("Error fetching trading journal data:", err);
            setError(message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchJournalData();
    }, [fetchJournalData]);

    // ── Format helpers ────────────────────────────────────────────────────────
    const formatCurrency = (val: number, currency = "EUR") =>
        new Intl.NumberFormat("en-US", { style: "currency", currency }).format(val);

    const formatNumber = (val: number, decimals = 2) =>
        new Intl.NumberFormat("en-US", {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
        }).format(val);

    // ── Derived state ─────────────────────────────────────────────────────────
    const filteredUnrealized = unrealizedData.filter(
        (row) => selectedType === "ALL" || row.asset_type === selectedType
    );
    const filteredRealized = realizedData.filter(
        (row) => selectedType === "ALL" || row.asset_type === selectedType
    );

    const baseCurrency = unrealizedData[0]?.base_currency ?? "EUR";

    // Null-safe aggregations (view columns are nullable when no price data exists)
    const totalCostBase = filteredUnrealized.reduce((acc, r) => acc + (r.total_cost_base ?? 0), 0);
    const totalCurrentValueBase = filteredUnrealized.reduce((acc, r) => acc + (r.current_value_base ?? 0), 0);
    const totalUnrealizedBase = filteredUnrealized.reduce((acc, r) => acc + (r.unrealized_pnl_base ?? 0), 0);
    const totalRealizedBase = filteredRealized.reduce((acc, r) => acc + (r.realized_pnl_base ?? 0), 0);
    const totalUnrealizedPct = totalCostBase > 0 ? (totalUnrealizedBase / totalCostBase) * 100 : 0;

    // ── Loading / error states ────────────────────────────────────────────────
    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
                <div className="text-center space-y-4">
                    <div className="h-12 w-12 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent mx-auto" />
                    <p className="text-sm font-medium text-muted-foreground">
                        Auditing historical transactions &amp; market tickers…
                    </p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-6 max-w-7xl mx-auto bg-background min-h-screen text-foreground">
                <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-xl p-6 text-center max-w-xl mx-auto mt-20">
                    <h2 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-2">Data Engine Fault</h2>
                    <p className="text-sm text-muted-foreground mb-4">{error}</p>
                    <button
                        onClick={() => void fetchJournalData()}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 dark:bg-red-900 dark:hover:bg-red-800 transition text-white text-xs font-semibold rounded-lg"
                    >
                        Retry Sync
                    </button>
                </div>
            </div>
        );
    }

    // ── Main render ───────────────────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-background text-foreground p-6 sm:p-8">
            {showTradeModal && (
                <TradeModal
                    baseCurrency={baseCurrency}
                    onClose={() => setShowTradeModal(false)}
                    onSuccess={() => void fetchJournalData()}
                />
            )}

            <div className="max-w-7xl mx-auto space-y-8">

                {/* ── Header ── */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-6">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Trading Journal</h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            Multi-asset portfolio sub-ledger tracking performance under global base{" "}
                            <span className="font-mono bg-muted text-muted-foreground px-1.5 py-0.5 rounded text-xs">
                                {baseCurrency}
                            </span>.
                        </p>
                    </div>

                    <div className="flex items-center gap-3 self-start sm:self-auto flex-wrap">
                        {/* Asset class filter */}
                        <div className="flex items-center gap-2">
                            <label
                                htmlFor="typeFilter"
                                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                            >
                                Asset Class:
                            </label>
                            <select
                                id="typeFilter"
                                value={selectedType}
                                onChange={(e) => setSelectedType(e.target.value)}
                                className="bg-background border border-border text-foreground text-xs font-medium rounded-lg px-3 py-2 outline-none focus:border-emerald-500 transition cursor-pointer"
                            >
                                <option value="ALL">All Mixed Assets</option>
                                {TRADEABLE_ASSET_TYPES.map((type) => (
                                    <option key={type} value={type}>
                                        {ASSET_TYPE_LABELS[type]}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* New trade button */}
                        <button
                            onClick={() => setShowTradeModal(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition shadow-sm"
                        >
                            <span className="text-base leading-none">+</span>
                            New Trade
                        </button>
                    </div>
                </div>

                {/* ── Summary scorecards ── */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Open Value ({selectedType === "ALL" ? "Combined" : ASSET_TYPE_LABELS[selectedType]})
                        </span>
                        <div className="text-2xl font-bold mt-2 text-foreground">
                            {formatCurrency(totalCurrentValueBase, baseCurrency)}
                        </div>
                        <p className="text-xs text-muted-foreground/80 mt-1">
                            Total Cost Outlay: {formatCurrency(totalCostBase, baseCurrency)}
                        </p>
                    </div>

                    <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Unrealized Performance
                        </span>
                        <div
                            className={`text-2xl font-bold mt-2 ${totalUnrealizedBase >= 0
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : "text-rose-600 dark:text-rose-400"
                                }`}
                        >
                            {totalUnrealizedBase >= 0 ? "+" : ""}
                            {formatCurrency(totalUnrealizedBase, baseCurrency)}
                        </div>
                        <p
                            className={`text-xs mt-1 font-medium ${totalUnrealizedBase >= 0
                                    ? "text-emerald-600 dark:text-emerald-500"
                                    : "text-rose-600 dark:text-rose-500"
                                }`}
                        >
                            {totalUnrealizedPct >= 0 ? "+" : ""}
                            {formatNumber(totalUnrealizedPct)}% ROI
                        </p>
                    </div>

                    <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Realized Performance Summary
                        </span>
                        <div
                            className={`text-2xl font-bold mt-2 ${totalRealizedBase >= 0
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : "text-rose-600 dark:text-rose-400"
                                }`}
                        >
                            {totalRealizedBase >= 0 ? "+" : ""}
                            {formatCurrency(totalRealizedBase, baseCurrency)}
                        </div>
                        <p className="text-xs text-muted-foreground/80 mt-1">
                            Net gains/losses from liquidated entries
                        </p>
                    </div>
                </div>

                {/* ── Tab strip ── */}
                <div className="flex border-b border-border">
                    <button
                        onClick={() => setActiveTab("unrealized")}
                        className={`px-5 py-3 text-sm font-semibold border-b-2 transition-all ${activeTab === "unrealized"
                                ? "border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-muted/40"
                                : "border-transparent text-muted-foreground hover:text-foreground"
                            }`}
                    >
                        Open Positions ({filteredUnrealized.length})
                    </button>
                    <button
                        onClick={() => setActiveTab("realized")}
                        className={`px-5 py-3 text-sm font-semibold border-b-2 transition-all ${activeTab === "realized"
                                ? "border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-muted/40"
                                : "border-transparent text-muted-foreground hover:text-foreground"
                            }`}
                    >
                        Closed History ({filteredRealized.length})
                    </button>
                </div>

                {/* ── Data table ── */}
                <div className="bg-card border border-border rounded-xl overflow-hidden shadow-xl">
                    {activeTab === "unrealized" ? (

                        /* ── Open Positions ── */
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse text-xs sm:text-sm">
                                <thead>
                                    <tr className="bg-muted/50 border-b border-border text-muted-foreground font-medium">
                                        <th className="p-4 font-semibold">Asset Name / Class</th>
                                        <th className="p-4 text-right font-semibold">Qty Held</th>
                                        <th className="p-4 text-right font-semibold">Avg Cost (Local)</th>
                                        <th className="p-4 text-right font-semibold">Price Feed</th>
                                        <th className="p-4 text-right font-semibold">Market Value ({baseCurrency})</th>
                                        <th className="p-4 text-right font-semibold">Unrealized P&amp;L ({baseCurrency})</th>
                                        <th className="p-4 text-right font-semibold">FX Impact</th>
                                        <th className="p-4 text-right font-semibold">ROI %</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border bg-card">
                                    {filteredUnrealized.length === 0 ? (
                                        <tr>
                                            <td colSpan={8} className="p-8 text-center text-muted-foreground text-sm">
                                                No active open positions found matching the selected asset class criteria.
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredUnrealized.map((row) => {
                                            const pnlBase = row.unrealized_pnl_base ?? 0;
                                            const isPositive = pnlBase >= 0;
                                            const qtyDp = row.asset_type === "CRYPTO" ? 6 : 4;
                                            const fxEffect = row.fx_effect ?? 0;
                                            return (
                                                <tr key={row.asset_id} className="hover:bg-muted/40 transition">
                                                    <td className="p-4">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className="font-semibold text-foreground">{row.asset_name}</span>
                                                            <span
                                                                className={`text-[10px] uppercase font-bold tracking-wide border px-1.5 py-0.5 rounded ${ASSET_TYPE_BADGES[row.asset_type] ?? ""}`}
                                                            >
                                                                {ASSET_TYPE_LABELS[row.asset_type] ?? row.asset_type}
                                                            </span>
                                                        </div>
                                                        {row.ticker && (
                                                            <div className="text-xs text-muted-foreground font-mono mt-0.5">
                                                                {row.ticker}
                                                                {row.isin ? ` · ${row.isin}` : ""}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="p-4 text-right font-mono text-foreground/80">
                                                        {formatNumber(row.quantity_held, qtyDp)}
                                                    </td>
                                                    <td className="p-4 text-right font-mono text-foreground/80">
                                                        {formatCurrency(row.avg_cost_per_unit_local, row.local_currency)}
                                                    </td>
                                                    <td className="p-4 text-right font-mono text-foreground/80">
                                                        {row.current_price != null
                                                            ? formatCurrency(row.current_price, row.local_currency)
                                                            : <span className="text-muted-foreground">—</span>
                                                        }
                                                    </td>
                                                    <td className="p-4 text-right font-mono text-foreground font-medium">
                                                        {row.current_value_base != null
                                                            ? formatCurrency(row.current_value_base, baseCurrency)
                                                            : <span className="text-muted-foreground">—</span>
                                                        }
                                                    </td>
                                                    <td className={`p-4 text-right font-mono font-semibold ${isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                                                        {row.unrealized_pnl_base != null
                                                            ? `${isPositive ? "+" : ""}${formatCurrency(pnlBase, baseCurrency)}`
                                                            : <span className="text-muted-foreground">—</span>
                                                        }
                                                    </td>
                                                    <td className={`p-4 text-right font-mono text-xs ${fxEffect >= 0 ? "text-emerald-600 dark:text-emerald-500/90" : "text-rose-600 dark:text-rose-500/90"}`}>
                                                        {row.fx_effect != null
                                                            ? `${fxEffect >= 0 ? "▲ +" : "▼ "}${formatCurrency(fxEffect, baseCurrency)}`
                                                            : "—"
                                                        }
                                                    </td>
                                                    <td className={`p-4 text-right font-mono font-bold ${isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                                                        {row.unrealized_pnl_pct != null
                                                            ? `${row.unrealized_pnl_pct >= 0 ? "+" : ""}${formatNumber(row.unrealized_pnl_pct)}%`
                                                            : "—"
                                                        }
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>

                    ) : (

                        /* ── Closed / Realized History ── */
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse text-xs sm:text-sm">
                                <thead>
                                    <tr className="bg-muted/50 border-b border-border text-muted-foreground font-medium">
                                        <th className="p-4 font-semibold">Asset Details / Class</th>
                                        <th className="p-4 text-right font-semibold">Qty Match</th>
                                        <th className="p-4 font-semibold">Holding Duration</th>
                                        <th className="p-4 text-right font-semibold">Cost Basis ({baseCurrency})</th>
                                        <th className="p-4 text-right font-semibold">Net Proceeds ({baseCurrency})</th>
                                        <th className="p-4 text-right font-semibold">Realized P&amp;L ({baseCurrency})</th>
                                        <th className="p-4 text-right font-semibold">FX Impact</th>
                                        <th className="p-4 text-right font-semibold">Return %</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border bg-card">
                                    {filteredRealized.length === 0 ? (
                                        <tr>
                                            <td colSpan={8} className="p-8 text-center text-muted-foreground text-sm">
                                                No matched sales transactions logged matching the selected asset class criteria.
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredRealized.map((row) => {
                                            const pnlBase = row.realized_pnl_base ?? 0;
                                            const isPositive = pnlBase >= 0;
                                            const fxEffect = row.fx_effect ?? 0;
                                            const qtyDp = row.asset_type === "CRYPTO" ? 6 : 4;
                                            return (
                                                <tr
                                                    key={`${row.sell_transaction_id}-${row.lot_id}`}
                                                    className="hover:bg-muted/40 transition"
                                                >
                                                    <td className="p-4">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className="font-semibold text-foreground">{row.asset_name}</span>
                                                            <span className={`text-[10px] uppercase font-bold tracking-wide border px-1.5 py-0.5 rounded ${ASSET_TYPE_BADGES[row.asset_type] ?? ""}`}>
                                                                {ASSET_TYPE_LABELS[row.asset_type] ?? row.asset_type}
                                                            </span>
                                                        </div>
                                                        {row.ticker && (
                                                            <div className="text-xs text-muted-foreground font-mono mt-0.5">
                                                                {row.ticker}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="p-4 text-right font-mono text-foreground/80">
                                                        {formatNumber(row.quantity_sold, qtyDp)}
                                                    </td>
                                                    <td className="p-4">
                                                        <div className="text-foreground/80 text-xs font-medium">
                                                            {row.acquired_at} → {row.sold_at}
                                                        </div>
                                                        <div className="text-[10px] text-muted-foreground mt-0.5 flex gap-1.5 items-center flex-wrap">
                                                            <span className="bg-muted px-1.5 py-0.5 rounded font-mono">
                                                                {row.held_days} Days
                                                            </span>
                                                            {row.is_long_term && (
                                                                <span className="bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50 px-1 py-0.5 rounded font-semibold">
                                                                    Long-Term Horizon
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="p-4 text-right font-mono text-muted-foreground">
                                                        {formatCurrency(row.cost_basis_base, baseCurrency)}
                                                    </td>
                                                    <td className="p-4 text-right font-mono text-foreground/80">
                                                        {formatCurrency(row.proceeds_base, baseCurrency)}
                                                    </td>
                                                    <td className={`p-4 text-right font-mono font-semibold ${isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                                                        {isPositive ? "+" : ""}
                                                        {formatCurrency(pnlBase, baseCurrency)}
                                                    </td>
                                                    <td className={`p-4 text-right font-mono text-xs ${fxEffect >= 0 ? "text-emerald-600 dark:text-emerald-500/90" : "text-rose-600 dark:text-rose-500/90"}`}>
                                                        {fxEffect >= 0 ? "▲ +" : "▼ "}
                                                        {formatCurrency(fxEffect, baseCurrency)}
                                                    </td>
                                                    <td className={`p-4 text-right font-mono font-bold ${isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                                                        {row.realized_pnl_pct != null
                                                            ? `${row.realized_pnl_pct >= 0 ? "+" : ""}${formatNumber(row.realized_pnl_pct)}%`
                                                            : "—"
                                                        }
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
