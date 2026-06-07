"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

interface UnrealizedPnLRow {
    asset_id: string;
    asset_name: string;
    ticker: string | null;
    isin: string | null;
    asset_type: string;
    local_currency: string;
    base_currency: string;
    quantity_held: number;
    avg_cost_per_unit_local: number;
    avg_cost_per_unit_base: number;
    total_cost_local: number;
    total_cost_base: number;
    current_price: number;
    price_as_of: string | null;
    current_fx_rate: number;
    current_value_local: number;
    current_value_base: number;
    unrealized_pnl_local: number;
    unrealized_pnl_base: number;
    fx_effect: number;
    unrealized_pnl_pct: number | null;
}

interface RealizedPnLRow {
    asset_id: string;
    asset_name: string;
    ticker: string | null;
    isin: string | null;
    asset_type: string;
    sell_transaction_id: string;
    lot_id: string;
    quantity_sold: number;
    acquired_at: string;
    sold_at: string;
    held_days: number;
    is_long_term: boolean;
    local_currency: string;
    cost_basis: number;
    proceeds: number;
    realized_pnl: number;
    cost_basis_base: number;
    proceeds_base: number;
    realized_pnl_base: number;
    realized_pnl_pct: number | null;
    fx_effect: number;
}

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

const TARGET_ASSET_TYPES = ["STOCK", "CRYPTO", "FUND_ETF", "BOND"];

export default function TradingJournalPage() {
    const [activeTab, setActiveTab] = useState<"unrealized" | "realized">("unrealized");
    const [selectedType, setSelectedType] = useState<string>("ALL");

    const [unrealizedData, setUnrealizedData] = useState<UnrealizedPnLRow[]>([]);
    const [realizedData, setRealizedData] = useState<RealizedPnLRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchJournalData() {
            try {
                setLoading(true);
                setError(null);

                // Fetch Open Positions matching allowed asset scopes
                const { data: unrealized, error: unrealizedErr } = await supabase
                    .from("unrealized_pnl")
                    .select("*")
                    .in("asset_type", TARGET_ASSET_TYPES);

                if (unrealizedErr) throw unrealizedErr;

                // Fetch Closed FIFO Matches matching allowed asset scopes
                const { data: realized, error: realizedErr } = await supabase
                    .from("realized_pnl")
                    .select("*")
                    .in("asset_type", TARGET_ASSET_TYPES)
                    .order("sold_at", { ascending: false });

                if (realizedErr) throw realizedErr;

                setUnrealizedData((unrealized as unknown as UnrealizedPnLRow[]) || []);
                setRealizedData((realized as unknown as RealizedPnLRow[]) || []);
            } catch (err: any) {
                console.error("Error fetching trading journal data:", err);
                setError(err.message || "Failed to load ledger views.");
            } finally {
                setLoading(false);
            }
        }

        fetchJournalData();
    }, []);

    // Format Helpers
    const formatCurrency = (val: number, currency: string = "EUR") => {
        return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: currency,
        }).format(val);
    };

    const formatNumber = (val: number, decimals = 2) => {
        return new Intl.NumberFormat("en-US", {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
        }).format(val);
    };

    // Filter lists based on type selector menu
    const filteredUnrealized = unrealizedData.filter(
        (row) => selectedType === "ALL" || row.asset_type === selectedType
    );

    const filteredRealized = realizedData.filter(
        (row) => selectedType === "ALL" || row.asset_type === selectedType
    );

    const baseCurrency = unrealizedData[0]?.base_currency || "EUR";

    // Compute Aggregations dynamically based on currently applied type filter
    const totalUnrealizedBase = filteredUnrealized.reduce((acc, row) => acc + row.unrealized_pnl_base, 0);
    const totalCostBase = filteredUnrealized.reduce((acc, row) => acc + row.total_cost_base, 0);
    const totalCurrentValueBase = filteredUnrealized.reduce((acc, row) => acc + row.current_value_base, 0);
    const totalRealizedBase = filteredRealized.reduce((acc, row) => acc + row.realized_pnl_base, 0);

    const totalUnrealizedPct = totalCostBase > 0 ? (totalUnrealizedBase / totalCostBase) * 100 : 0;

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
                <div className="text-center space-y-4">
                    <div className="h-12 w-12 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent mx-auto"></div>
                    <p className="text-sm font-medium text-muted-foreground">Auditing historical transactions & market tickers...</p>
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
                    <button onClick={() => window.location.reload()} className="px-4 py-2 bg-red-600 hover:bg-red-700 dark:bg-red-900 dark:hover:bg-red-800 transition text-white text-xs font-semibold rounded-lg">
                        Retry Sync
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background text-foreground p-6 sm:p-8">
            <div className="max-w-7xl mx-auto space-y-8">

                {/* Header Block */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-6">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Trading Journal</h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            Multi-asset portfolio sub-ledger tracking performance under global base <span className="font-mono bg-muted text-muted-foreground px-1.5 py-0.5 rounded text-xs">{baseCurrency}</span>.
                        </p>
                    </div>

                    {/* Interactive Class Selector Dropdown */}
                    <div className="flex items-center gap-2 self-start sm:self-auto">
                        <label htmlFor="typeFilter" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Asset Class:</label>
                        <select
                            id="typeFilter"
                            value={selectedType}
                            onChange={(e) => setSelectedType(e.target.value)}
                            className="bg-background border border-border text-foreground text-xs font-medium rounded-lg px-3 py-2 outline-none focus:border-emerald-500 transition cursor-pointer"
                        >
                            <option value="ALL">All Mixed Assets</option>
                            {TARGET_ASSET_TYPES.map(type => (
                                <option key={type} value={type}>{ASSET_TYPE_LABELS[type]}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Dynamic Executive Scorecards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Open Value ({selectedType === "ALL" ? "Combined" : ASSET_TYPE_LABELS[selectedType]})</span>
                        <div className="text-2xl font-bold mt-2 text-foreground">{formatCurrency(totalCurrentValueBase, baseCurrency)}</div>
                        <p className="text-xs text-muted-foreground/80 mt-1">Total Cost Outlay: {formatCurrency(totalCostBase, baseCurrency)}</p>
                    </div>

                    <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Unrealized Performance</span>
                        <div className={`text-2xl font-bold mt-2 ${totalUnrealizedBase >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                            {totalUnrealizedBase >= 0 ? "+" : ""}{formatCurrency(totalUnrealizedBase, baseCurrency)}
                        </div>
                        <p className={`text-xs mt-1 font-medium ${totalUnrealizedBase >= 0 ? "text-emerald-600 dark:text-emerald-500" : "text-rose-600 dark:text-rose-500"}`}>
                            {totalUnrealizedPct >= 0 ? "+" : ""}{formatNumber(totalUnrealizedPct)}% ROI
                        </p>
                    </div>

                    <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Realized Performance Summary</span>
                        <div className={`text-2xl font-bold mt-2 ${totalRealizedBase >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                            {totalRealizedBase >= 0 ? "+" : ""}{formatCurrency(totalRealizedBase, baseCurrency)}
                        </div>
                        <p className="text-xs text-muted-foreground/80 mt-1">Net gains/losses from liquidated entries</p>
                    </div>
                </div>

                {/* Tab Links */}
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

                {/* Data View Grid */}
                <div className="bg-card border border-border rounded-xl overflow-hidden shadow-xl">
                    {activeTab === "unrealized" ? (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse text-xs sm:text-sm">
                                <thead>
                                    <tr className="bg-muted/50 border-b border-border text-muted-foreground font-medium">
                                        <th className="p-4 font-semibold">Asset Name / Class</th>
                                        <th className="p-4 text-right font-semibold">Qty Held</th>
                                        <th className="p-4 text-right font-semibold">Avg Cost (Local)</th>
                                        <th className="p-4 text-right font-semibold">Price Feed</th>
                                        <th className="p-4 text-right font-semibold">Market Value ({baseCurrency})</th>
                                        <th className="p-4 text-right font-semibold">Unrealized P&L ({baseCurrency})</th>
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
                                            const isPositive = row.unrealized_pnl_base >= 0;
                                            const quantityDecimals = row.asset_type === "CRYPTO" ? 6 : 4;
                                            return (
                                                <tr key={row.asset_id} className="hover:bg-muted/40 transition">
                                                    <td className="p-4">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-semibold text-foreground">{row.asset_name}</span>
                                                            <span className={`text-[10px] uppercase font-bold tracking-wide border px-1.5 py-0.2 rounded ${ASSET_TYPE_BADGES[row.asset_type]}`}>
                                                                {ASSET_TYPE_LABELS[row.asset_type]}
                                                            </span>
                                                        </div>
                                                        {row.ticker && <div className="text-xs text-muted-foreground font-mono mt-0.5">{row.ticker} {row.isin ? `• ${row.isin}` : ""}</div>}
                                                    </td>
                                                    <td className="p-4 text-right font-mono text-foreground/80">{formatNumber(row.quantity_held, quantityDecimals)}</td>
                                                    <td className="p-4 text-right font-mono text-foreground/80">
                                                        {formatCurrency(row.avg_cost_per_unit_local, row.local_currency)}
                                                    </td>
                                                    <td className="p-4 text-right font-mono text-foreground/80">
                                                        {formatCurrency(row.current_price, row.local_currency)}
                                                    </td>
                                                    <td className="p-4 text-right font-mono text-foreground font-medium">
                                                        {formatCurrency(row.current_value_base, row.base_currency)}
                                                    </td>
                                                    <td className={`p-4 text-right font-mono font-semibold ${isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                                                        {isPositive ? "+" : ""}{formatCurrency(row.unrealized_pnl_base, row.base_currency)}
                                                    </td>
                                                    <td className={`p-4 text-right font-mono text-xs ${row.fx_effect >= 0 ? "text-emerald-600 dark:text-emerald-500/90" : "text-rose-600 dark:text-rose-500/90"}`}>
                                                        {row.fx_effect >= 0 ? "▲ +" : "▼ "}{formatCurrency(row.fx_effect, row.base_currency)}
                                                    </td>
                                                    <td className={`p-4 text-right font-mono font-bold ${isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                                                        {row.unrealized_pnl_pct !== null ? `${row.unrealized_pnl_pct >= 0 ? "+" : ""}${formatNumber(row.unrealized_pnl_pct)}%` : "—"}
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse text-xs sm:text-sm">
                                <thead>
                                    <tr className="bg-muted/50 border-b border-border text-muted-foreground font-medium">
                                        <th className="p-4 font-semibold">Asset Details / Class</th>
                                        <th className="p-4 text-right font-semibold">Qty Match</th>
                                        <th className="p-4 font-semibold">Holding Duration</th>
                                        <th className="p-4 text-right font-semibold">Cost Basis ({baseCurrency})</th>
                                        <th className="p-4 text-right font-semibold">Net Proceeds ({baseCurrency})</th>
                                        <th className="p-4 text-right font-semibold">Realized P&L ({baseCurrency})</th>
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
                                            const isPositive = row.realized_pnl_base >= 0;
                                            const quantityDecimals = row.asset_type === "CRYPTO" ? 6 : 4;
                                            return (
                                                <tr key={`${row.sell_transaction_id}-${row.lot_id}`} className="hover:bg-muted/40 transition">
                                                    <td className="p-4">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-semibold text-foreground">{row.asset_name}</span>
                                                            <span className={`text-[10px] uppercase font-bold tracking-wide border px-1.5 py-0.2 rounded ${ASSET_TYPE_BADGES[row.asset_type]}`}>
                                                                {ASSET_TYPE_LABELS[row.asset_type]}
                                                            </span>
                                                        </div>
                                                        {row.ticker && <div className="text-xs text-muted-foreground font-mono mt-0.5">{row.ticker}</div>}
                                                    </td>
                                                    <td className="p-4 text-right font-mono text-foreground/80">{formatNumber(row.quantity_sold, quantityDecimals)}</td>
                                                    <td className="p-4">
                                                        <div className="text-foreground/80 text-xs font-medium">
                                                            {row.acquired_at} → {row.sold_at}
                                                        </div>
                                                        <div className="text-[10px] text-muted-foreground mt-0.5 flex gap-1.5 items-center">
                                                            <span className="bg-muted px-1.5 py-0.5 rounded font-mono">{row.held_days} Days</span>
                                                            {row.is_long_term && (
                                                                <span className="bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50 px-1 py-0.2 rounded font-semibold scale-95 origin-left">
                                                                    Long-Term Horizon
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="p-4 text-right font-mono text-muted-foreground">{formatCurrency(row.cost_basis_base, baseCurrency)}</td>
                                                    <td className="p-4 text-right font-mono text-foreground/80">{formatCurrency(row.proceeds_base, baseCurrency)}</td>
                                                    <td className={`p-4 text-right font-mono font-semibold ${isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                                                        {isPositive ? "+" : ""}{formatCurrency(row.realized_pnl_base, baseCurrency)}
                                                    </td>
                                                    <td className={`p-4 text-right font-mono text-xs ${row.fx_effect >= 0 ? "text-emerald-600 dark:text-emerald-500/90" : "text-rose-600 dark:text-rose-500/90"}`}>
                                                        {row.fx_effect >= 0 ? "▲ +" : "▼ "}{formatCurrency(row.fx_effect, baseCurrency)}
                                                    </td>
                                                    <td className={`p-4 text-right font-mono font-bold ${isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                                                        {row.realized_pnl_pct !== null ? `${row.realized_pnl_pct >= 0 ? "+" : ""}${formatNumber(row.realized_pnl_pct)}%` : "—"}
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