"use client";

import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Tables, TablesInsert } from "@/lib/database";

// ---------------------------------------------------------------------------
// Types — use generated DB view/table types directly instead of duplicating
// ---------------------------------------------------------------------------

type UnrealizedPnLRow = Tables<"unrealized_pnl">;
type RealizedPnLRow = Tables<"realized_pnl">;
type CurrentHoldingRow = Tables<"current_holdings">;
type TaxLotRow = Tables<"tax_lots">;

/** Minimal shape selected from portfolio_assets for the BUY asset dropdown. */
interface TradableAsset {
    id: string;
    name: string;
    ticker: string | null;
    type_slug: string;
    nominal_value: number | null;  // face/par value per unit — only set for BONDs
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
    transactedAt: string;       // "YYYY-MM-DDTHH:mm" for <input type="datetime-local">
    quantity: string;
    pricePerUnit: string;       // absolute clean price per unit
    percentOfNominal: string;   // bond only: price expressed as % of nominal value
    accruedInterest: string;    // bond only: accrued coupon interest on top of clean price
    totalAmount: string;        // auto-calculated but user-editable for override
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
        percentOfNominal: "",
        accruedInterest: "0",
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
                    .select("id, name, ticker, type_slug, nominal_value")
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

    // ── Auto-calculate total_amount from qty × price ± fee (+ accrued interest for bonds) ──
    useEffect(() => {
        const qty = parseFloat(form.quantity);
        const price = parseFloat(form.pricePerUnit);
        const fee = parseFloat(form.fee) || 0;
        const accrued = parseFloat(form.accruedInterest) || 0;
        if (!isNaN(qty) && qty > 0 && !isNaN(price) && price >= 0) {
            const gross = qty * price;
            // Accrued interest is paid by the buyer and received by the seller —
            // so it adds to the total in both directions (cost basis vs. proceeds).
            const total = form.transactionType === "BUY"
                ? gross + accrued + fee
                : gross + accrued - fee;
            setForm((prev) => ({ ...prev, totalAmount: Math.max(0, total).toFixed(4) }));
        }
    }, [form.quantity, form.pricePerUnit, form.fee, form.accruedInterest, form.transactionType]);

    // ── Helpers ───────────────────────────────────────────────────────────────
    const update = (field: keyof TradeFormData, value: string) =>
        setForm((prev) => ({ ...prev, [field]: value }));

    const switchType = (type: "BUY" | "SELL") =>
        setForm((prev) => ({ ...prev, transactionType: type, assetId: "", percentOfNominal: "", accruedInterest: "0" }));

    // buyableAssets is the authoritative source for all asset metadata (type, nominal_value),
    // so it's used as a lookup for both BUY and SELL sides.
    const selectedAsset = buyableAssets.find((a) => a.id === form.assetId);
    const selectedHolding = sellableHoldings.find((h) => h.asset_id === form.assetId);
    const isBond = selectedAsset?.type_slug === "BOND";
    const nominalValue = selectedAsset?.nominal_value ?? null;

    // When the asset changes, reset bond-specific fields so stale % values
    // from a previously selected bond don't carry over to a new selection.
    function handleAssetChange(assetId: string) {
        setForm((prev) => ({
            ...prev,
            assetId,
            pricePerUnit: "",
            percentOfNominal: "",
            accruedInterest: "0",
        }));
    }

    // Bond pricing: price ↔ % of nominal are kept in sync via direct atomic
    // state updates so there's no useEffect feedback loop between them.
    function handlePriceChange(raw: string) {
        const price = parseFloat(raw);
        const pct = !isNaN(price) && nominalValue && nominalValue > 0
            ? ((price / nominalValue) * 100).toFixed(6)
            : "";
        setForm((prev) => ({ ...prev, pricePerUnit: raw, percentOfNominal: pct }));
    }

    function handlePercentChange(raw: string) {
        const pct = parseFloat(raw);
        const price = !isNaN(pct) && nominalValue && nominalValue > 0
            ? ((pct / 100) * nominalValue).toFixed(6)
            : "";
        setForm((prev) => ({ ...prev, percentOfNominal: raw, pricePerUnit: price }));
    }

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
                accrued_interest: isBond ? (parseFloat(form.accruedInterest) || 0) : null,
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
                                onChange={(e) => handleAssetChange(e.target.value)}
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

                    {/* Quantity + Price */}
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
                                {isBond ? "Clean Price Per Unit" : "Price Per Unit"}
                            </label>
                            <input
                                type="number"
                                min="0"
                                step="any"
                                value={form.pricePerUnit}
                                onChange={(e) => isBond ? handlePriceChange(e.target.value) : update("pricePerUnit", e.target.value)}
                                placeholder="0.00"
                                className={inputCls}
                            />
                        </div>
                    </div>

                    {/* Bond pricing panel — % of nominal ↔ price per unit */}
                    {isBond && (
                        <div className="rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/60 dark:bg-indigo-950/30 p-4 space-y-4">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
                                    Bond Pricing
                                </span>
                                {nominalValue != null && (
                                    <span className="text-[10px] text-indigo-500 dark:text-indigo-500/80 font-mono">
                                        Nominal: {nominalValue} {form.currency}
                                    </span>
                                )}
                                {nominalValue == null && (
                                    <span className="text-[10px] text-amber-600 dark:text-amber-400">
                                        ⚠ No nominal value set — enter price directly above
                                    </span>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                {/* % of nominal */}
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                                        % of Nominal
                                    </label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            min="0"
                                            step="any"
                                            value={form.percentOfNominal}
                                            onChange={(e) => handlePercentChange(e.target.value)}
                                            placeholder="e.g. 98.50"
                                            disabled={nominalValue == null}
                                            className={inputCls + " pr-8" + (nominalValue == null ? " opacity-40 cursor-not-allowed" : "")}
                                        />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-mono">
                                            %
                                        </span>
                                    </div>
                                    <p className="text-[10px] text-muted-foreground">
                                        Updates price ↑
                                    </p>
                                </div>

                                {/* Accrued interest */}
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                                        Accrued Interest
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="any"
                                        value={form.accruedInterest}
                                        onChange={(e) => update("accruedInterest", e.target.value)}
                                        placeholder="0.00"
                                        className={inputCls}
                                    />
                                    <p className="text-[10px] text-muted-foreground">
                                        Added to total ↓
                                    </p>
                                </div>
                            </div>

                            {/* Dirty price preview */}
                            {form.pricePerUnit && form.quantity && (
                                <div className="text-[11px] text-indigo-700 dark:text-indigo-300 font-mono bg-indigo-100/60 dark:bg-indigo-900/30 rounded-lg px-3 py-2 flex flex-wrap gap-x-4 gap-y-1">
                                    <span>
                                        Dirty price per unit:{" "}
                                        <strong>
                                            {(parseFloat(form.pricePerUnit) + (parseFloat(form.accruedInterest) || 0) / Math.max(parseFloat(form.quantity) || 1, 0.0000001)).toFixed(6)}
                                        </strong>
                                    </span>
                                    {nominalValue != null && form.percentOfNominal && (
                                        <span>
                                            Dirty %:{" "}
                                            <strong>
                                                {(
                                                    ((parseFloat(form.pricePerUnit) + (parseFloat(form.accruedInterest) || 0) / Math.max(parseFloat(form.quantity) || 1, 0.0000001)) / nominalValue) * 100
                                                ).toFixed(4)}%
                                            </strong>
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

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
                                    {isBond ? "(clean + accrued ± fee)" : "(auto)"}
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
// LotSubRows — renders the expandable lot breakdown inside the unrealized table
// ---------------------------------------------------------------------------

interface LotSubRowsProps {
    lots: TaxLotRow[];
    loading: boolean;
    parent: UnrealizedPnLRow;
    colSpan: number;
    formatCurrency: (val: number, currency?: string) => string;
    formatNumber: (val: number, decimals?: number) => string;
    baseCurrency: string;
}

function LotSubRows({ lots, loading, parent, colSpan, formatCurrency, formatNumber, baseCurrency }: LotSubRowsProps) {
    const qtyDp = parent.asset_type === "CRYPTO" ? 6 : 4;

    const cellCls = "px-3 py-2.5 text-right font-mono";

    return (
        <tr>
            <td colSpan={colSpan} className="p-0 border-b border-border">
                <div className="bg-muted/20 dark:bg-muted/10 border-l-4 border-emerald-500/40 dark:border-emerald-600/40">
                    {loading ? (
                        <div className="flex items-center gap-3 px-6 py-4">
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
                            <span className="text-xs text-muted-foreground">Loading lots…</span>
                        </div>
                    ) : lots.length === 0 ? (
                        <p className="text-xs text-muted-foreground px-6 py-4">
                            No open lots found for this asset.
                        </p>
                    ) : (
                        <table className="w-full text-xs border-collapse">
                            <thead>
                                <tr className="text-muted-foreground border-b border-border/60">
                                    {/* indent spacer to align with parent asset column */}
                                    <th className="pl-10 pr-3 py-2 text-left font-semibold w-8">#</th>
                                    <th className="px-3 py-2 text-left font-semibold">Acquired</th>
                                    <th className="px-3 py-2 text-right font-semibold">Age</th>
                                    <th className="px-3 py-2 text-right font-semibold">Qty Remaining</th>
                                    <th className="px-3 py-2 text-right font-semibold">Cost / Unit</th>
                                    <th className="px-3 py-2 text-right font-semibold">Cost Basis</th>
                                    <th className="px-3 py-2 text-right font-semibold">Current Value</th>
                                    <th className="px-3 py-2 text-right font-semibold">Unrealized P&amp;L</th>
                                    <th className="px-3 py-2 text-right font-semibold">P&amp;L %</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/40">
                                {lots.map((lot, idx) => {
                                    const acquiredDate = new Date(lot.acquired_at);
                                    const ageMs = Date.now() - acquiredDate.getTime();
                                    const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));

                                    // Per-lot P&L using current price from the parent unrealized row.
                                    // current_price is in local currency; cost_per_unit_base is in base.
                                    const currentPrice = parent.current_price;
                                    const currentValue = currentPrice != null
                                        ? lot.quantity_remaining * currentPrice * (1 / (lot.exchange_rate_at_acquisition || 1)) * (lot.exchange_rate_at_acquisition || 1)
                                        : null;
                                    // Simpler: use the exchange rates already baked into the parent view.
                                    // current_value_base / quantity_held gives current price per unit in base.
                                    const currentPriceBase = parent.quantity_held > 0 && parent.current_value_base != null
                                        ? parent.current_value_base / parent.quantity_held
                                        : null;
                                    const lotCurrentValueBase = currentPriceBase != null
                                        ? lot.quantity_remaining * currentPriceBase
                                        : null;
                                    const lotCostBasisBase = lot.quantity_remaining * lot.cost_per_unit_base;
                                    const lotPnlBase = lotCurrentValueBase != null
                                        ? lotCurrentValueBase - lotCostBasisBase
                                        : null;
                                    const lotPnlPct = lotPnlBase != null && lotCostBasisBase > 0
                                        ? (lotPnlBase / lotCostBasisBase) * 100
                                        : null;
                                    const isPositive = (lotPnlBase ?? 0) >= 0;

                                    return (
                                        <tr key={lot.id} className="hover:bg-muted/30 transition">
                                            <td className="pl-10 pr-3 py-2.5 text-muted-foreground font-semibold">
                                                {idx + 1}
                                            </td>
                                            <td className="px-3 py-2.5">
                                                <div className="text-foreground/80 font-medium">
                                                    {acquiredDate.toLocaleDateString(undefined, {
                                                        year: "numeric", month: "short", day: "numeric",
                                                    })}
                                                </div>
                                                <div className="text-muted-foreground/70 text-[10px]">
                                                    {acquiredDate.toLocaleTimeString(undefined, {
                                                        hour: "2-digit", minute: "2-digit",
                                                    })}
                                                </div>
                                            </td>
                                            <td className={cellCls + " text-muted-foreground"}>
                                                <span className={`inline-block px-1.5 py-0.5 rounded font-mono text-[10px] ${ageDays >= 365
                                                        ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400"
                                                        : "bg-muted text-muted-foreground"
                                                    }`}>
                                                    {ageDays >= 365
                                                        ? `${(ageDays / 365).toFixed(1)}y`
                                                        : `${ageDays}d`}
                                                </span>
                                            </td>
                                            <td className={cellCls + " text-foreground/80"}>
                                                {formatNumber(lot.quantity_remaining, qtyDp)}
                                                {lot.quantity_remaining < lot.quantity_acquired && (
                                                    <div className="text-[10px] text-muted-foreground/70 mt-0.5">
                                                        of {formatNumber(lot.quantity_acquired, qtyDp)}
                                                    </div>
                                                )}
                                            </td>
                                            <td className={cellCls + " text-foreground/80"}>
                                                {formatCurrency(lot.cost_per_unit, lot.currency)}
                                                <div className="text-[10px] text-muted-foreground/70 mt-0.5">
                                                    {formatCurrency(lot.cost_per_unit_base, baseCurrency)} base
                                                </div>
                                            </td>
                                            <td className={cellCls + " text-muted-foreground"}>
                                                {formatCurrency(lotCostBasisBase, baseCurrency)}
                                            </td>
                                            <td className={cellCls + " text-foreground/80"}>
                                                {lotCurrentValueBase != null
                                                    ? formatCurrency(lotCurrentValueBase, baseCurrency)
                                                    : <span className="text-muted-foreground/60">—</span>
                                                }
                                            </td>
                                            <td className={`${cellCls} font-semibold ${isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                                                {lotPnlBase != null
                                                    ? `${isPositive ? "+" : ""}${formatCurrency(lotPnlBase, baseCurrency)}`
                                                    : <span className="text-muted-foreground/60">—</span>
                                                }
                                            </td>
                                            <td className={`${cellCls} font-bold ${isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                                                {lotPnlPct != null
                                                    ? `${lotPnlPct >= 0 ? "+" : ""}${formatNumber(lotPnlPct)}%`
                                                    : <span className="text-muted-foreground/60">—</span>
                                                }
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            {lots.length > 1 && (
                                <tfoot>
                                    <tr className="border-t border-border/60 text-muted-foreground bg-muted/10">
                                        <td colSpan={3} className="pl-10 pr-3 py-2 text-[10px] font-semibold uppercase tracking-wider">
                                            {lots.length} lots
                                        </td>
                                        <td className={cellCls + " font-semibold text-foreground/70"}>
                                            {formatNumber(
                                                lots.reduce((s, l) => s + l.quantity_remaining, 0),
                                                qtyDp,
                                            )}
                                        </td>
                                        <td />
                                        <td className={cellCls + " font-semibold text-foreground/70"}>
                                            {formatCurrency(
                                                lots.reduce((s, l) => s + l.quantity_remaining * l.cost_per_unit_base, 0),
                                                baseCurrency,
                                            )}
                                        </td>
                                        <td className={cellCls + " font-semibold text-foreground/70"}>
                                            {parent.current_value_base != null
                                                ? formatCurrency(parent.current_value_base, baseCurrency)
                                                : "—"
                                            }
                                        </td>
                                        <td className={`${cellCls} font-semibold ${(parent.unrealized_pnl_base ?? 0) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                                            {parent.unrealized_pnl_base != null
                                                ? `${parent.unrealized_pnl_base >= 0 ? "+" : ""}${formatCurrency(parent.unrealized_pnl_base, baseCurrency)}`
                                                : "—"
                                            }
                                        </td>
                                        <td />
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    )}
                </div>
            </td>
        </tr>
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

    // ── Lot expansion state ───────────────────────────────────────────────────
    const [expandedAssets, setExpandedAssets] = useState<Set<string>>(new Set());
    const [lotsByAsset, setLotsByAsset] = useState<Record<string, TaxLotRow[]>>({});
    const [loadingLots, setLoadingLots] = useState<Set<string>>(new Set());

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

            // Stale lot cache: clear any expanded assets so data is re-fetched
            // if the user re-expands after recording a new trade.
            setExpandedAssets(new Set());
            setLotsByAsset({});
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

    // ── Lot toggle — lazy-fetches on first expand, then uses cache ────────────
    const toggleAsset = useCallback(async (assetId: string) => {
        // If already expanded, just collapse — no fetch needed.
        if (expandedAssets.has(assetId)) {
            setExpandedAssets((prev) => {
                const next = new Set(prev);
                next.delete(assetId);
                return next;
            });
            return;
        }

        // Expand immediately so the loading skeleton shows right away.
        setExpandedAssets((prev) => new Set(prev).add(assetId));

        // Skip the fetch if we already have the lots cached.
        if (lotsByAsset[assetId] !== undefined) return;

        setLoadingLots((prev) => new Set(prev).add(assetId));
        try {
            const { data, error } = await supabase
                .from("tax_lots")
                .select("*")
                .eq("asset_id", assetId)
                .gt("quantity_remaining", 0)
                .order("acquired_at", { ascending: true });

            if (error) throw error;
            setLotsByAsset((prev) => ({ ...prev, [assetId]: (data as TaxLotRow[]) ?? [] }));
        } catch (err: unknown) {
            console.error("Failed to load lots for asset", assetId, err);
            // Store empty array so we don't retry in an infinite loop,
            // and show the "no open lots" empty state instead.
            setLotsByAsset((prev) => ({ ...prev, [assetId]: [] }));
        } finally {
            setLoadingLots((prev) => {
                const next = new Set(prev);
                next.delete(assetId);
                return next;
            });
        }
    }, [expandedAssets, lotsByAsset]);

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
                                        {/* Expand toggle column */}
                                        <th className="w-10 p-4" aria-label="Expand" />
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
                                            <td colSpan={9} className="p-8 text-center text-muted-foreground text-sm">
                                                No active open positions found matching the selected asset class criteria.
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredUnrealized.map((row) => {
                                            const pnlBase = row.unrealized_pnl_base ?? 0;
                                            const isPositive = pnlBase >= 0;
                                            const qtyDp = row.asset_type === "CRYPTO" ? 6 : 4;
                                            const fxEffect = row.fx_effect ?? 0;
                                            const isExpanded = expandedAssets.has(row.asset_id);
                                            const isLoading = loadingLots.has(row.asset_id);
                                            const lots = lotsByAsset[row.asset_id];
                                            const lotCount = lots?.length ?? 0;

                                            return (
                                                <React.Fragment key={row.asset_id}>
                                                    <tr
                                                        key={row.asset_id}
                                                        onClick={() => void toggleAsset(row.asset_id)}
                                                        className={`cursor-pointer transition ${isExpanded ? "bg-muted/30 dark:bg-muted/20" : "hover:bg-muted/40"}`}
                                                    >
                                                        {/* Chevron */}
                                                        <td className="w-10 pl-4 pr-0">
                                                            <span
                                                                aria-hidden
                                                                className={`inline-block text-muted-foreground transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}
                                                            >
                                                                ›
                                                            </span>
                                                        </td>
                                                        <td className="p-4">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <span className="font-semibold text-foreground">{row.asset_name}</span>
                                                                <span
                                                                    className={`text-[10px] uppercase font-bold tracking-wide border px-1.5 py-0.5 rounded ${ASSET_TYPE_BADGES[row.asset_type] ?? ""}`}
                                                                >
                                                                    {ASSET_TYPE_LABELS[row.asset_type] ?? row.asset_type}
                                                                </span>
                                                                {isExpanded && !isLoading && lotCount > 0 && (
                                                                    <span className="text-[10px] text-muted-foreground/70">
                                                                        {lotCount} lot{lotCount !== 1 ? "s" : ""}
                                                                    </span>
                                                                )}
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
                                                    {isExpanded && (
                                                        <LotSubRows
                                                            key={`lots-${row.asset_id}`}
                                                            lots={lots ?? []}
                                                            loading={isLoading}
                                                            parent={row}
                                                            colSpan={9}
                                                            formatCurrency={formatCurrency}
                                                            formatNumber={formatNumber}
                                                            baseCurrency={baseCurrency}
                                                        />
                                                    )}
                                                </React.Fragment>
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
