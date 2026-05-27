"use client";
export const dynamic = "force-dynamic";
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Trash2, History, Filter, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

import { supabase } from "@/lib/supabase";
import type { PortfolioAssetSummary, ValuationLedgerRow, ValuationReference } from "@/lib/database";
import { usePortfolioDataRefresh } from "@/lib/portfolio-refresh";

// Formatting helpers
const formatToEuroDate = (dateStr: string) => {
    if (!dateStr) return "";
    const [year, month, day] = dateStr.split("-");
    return `${day}-${month}-${year}`;
};

const formatToEuroCurrency = (value: number) => {
    return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(value);
};

export default function ValuationLedgerPage() {
    const [assets, setAssets] = useState<PortfolioAssetSummary[]>([]);
    const [ledger, setLedger] = useState<ValuationLedgerRow[]>([]);

    // Form State
    const [selectedAssetId, setSelectedAssetId] = useState("");
    const [valuationDate, setValuationDate] = useState(() => {
        const local = new Date();
        const offset = local.getTimezoneOffset();
        const adjusted = new Date(local.getTime() - (offset * 60 * 1000));
        return adjusted.toISOString().split("T")[0];
    });
    const [balanceAmount, setBalanceAmount] = useState("");
    const [loading, setLoading] = useState(false);

    // Interactive Sorting and Multi-Column Filtering Controls
    const [selectedFilterAssetId, setSelectedFilterAssetId] = useState("ALL");
    const [selectedFilterType, setSelectedFilterType] = useState("ALL");
    const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");

    // Reference Cache State for context visibility
    const [lastValuation, setLastValuation] = useState<ValuationReference | null>(null);

    // --- Core Sync Engines ---
    const fetchLedger = useCallback(async () => {
        // We traverse: asset_valuations -> portfolio_assets -> asset_types(name)
        const { data: logs } = await supabase
            .from("asset_valuations")
            .select(`
            id, 
            asset_id, 
            valuation_date, 
            balance_amount, 
            portfolio_assets(
                name, 
                institution, 
                asset_types(name, type_slug)
            )
        `)
            .order("valuation_date", { ascending: false });

        if (logs) setLedger(logs);
    }, []);

    const fetchInitialData = useCallback(async () => {
        const { data: { session } } = await supabase.auth.getSession();
        const currentUserId = session?.user?.id;

        if (!currentUserId) return;

        const { data: fetchedAssets } = await supabase
            .from("portfolio_assets")
            .select("id, name, institution")
            .eq("user_id", currentUserId)
            .order("name", { ascending: true });

        if (fetchedAssets) {
            setAssets(fetchedAssets);
            setSelectedAssetId((current) => {
                if (fetchedAssets.length === 0) return "";
                if (current && fetchedAssets.some((asset) => asset.id === current)) return current;
                return fetchedAssets[0].id;
            });
        } else {
            setAssets([]);
            setSelectedAssetId("");
        }

        await fetchLedger();
    }, [fetchLedger]);

    usePortfolioDataRefresh(fetchInitialData);

    const fetchLastValuationReference = async (assetId: string) => {
        if (!assetId) {
            setLastValuation(null);
            return;
        }

        const { data, error } = await supabase
            .from("asset_valuations")
            .select("valuation_date, balance_amount")
            .eq("asset_id", assetId)
            .order("valuation_date", { ascending: false })
            .limit(1);

        if (!error && data && data.length > 0) {
            setLastValuation(data[0]);
        } else {
            setLastValuation(null);
        }
    };

    useEffect(() => {
        fetchLastValuationReference(selectedAssetId);
    }, [selectedAssetId]);

    // --- Form Handlers ---
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // DUPLICATE GUARDRAIL
        const isDuplicate = ledger.some(
            (log) => log.asset_id === selectedAssetId && log.valuation_date === valuationDate
        );

        if (isDuplicate) {
            const targetAsset = assets.find(a => a.id === selectedAssetId);
            const assetName = targetAsset ? targetAsset.name : "this asset";

            alert(
                `Validation Error: A valuation checkpoint already exists for "${assetName}" on this exact date.\n\nPlease select a different date or delete the existing entry first.`
            );
            return;
        }

        setLoading(true);

        const { error } = await supabase.from("asset_valuations").insert([
            {
                asset_id: selectedAssetId,
                valuation_date: valuationDate,
                balance_amount: parseFloat(balanceAmount),
            },
        ]);

        setLoading(false);
        if (!error) {
            setBalanceAmount("");
            fetchLedger();
            fetchLastValuationReference(selectedAssetId);
        } else {
            alert(`Error recording valuation: ${error.message}`);
        }
    };

    const handleDeleteLog = async (id: string) => {
        if (!confirm("Are you sure you want to delete this historical valuation point?")) return;

        const { error } = await supabase.from("asset_valuations").delete().eq("id", id);
        if (!error) {
            fetchLedger();
            fetchLastValuationReference(selectedAssetId);
        } else {
            alert(`Error purging valuation row: ${error.message}`);
        }
    };

    const toggleSortDirection = () => {
        setSortOrder(prev => (prev === "desc" ? "asc" : "desc"));
    };

    // Extract unique asset types present inside the database dynamically for dropdown availability
    const uniqueAssetTypes = Array.from(
        new Set(
            ledger
                .map((log) => log.portfolio_assets?.asset_types?.name)
                .filter((name): name is string => Boolean(name))
        )
    ).sort();

    // Derived Matrix Layer: Process compound column filters followed by timeline sequence sorting rules
    const processedLedger = ledger
        .filter((log) => {
            const matchesAsset = selectedFilterAssetId === "ALL" || log.asset_id === selectedFilterAssetId;
            // Matches against the text category name instead of the raw type_id parameter
            const matchesType = selectedFilterType === "ALL" || log.portfolio_assets?.asset_types?.name === selectedFilterType;
            return matchesAsset && matchesType;
        })
        .sort((a, b) => {
            const dateA = new Date(a.valuation_date).getTime();
            const dateB = new Date(b.valuation_date).getTime();
            return sortOrder === "desc" ? dateB - dateA : dateA - dateB;
        });

    const isAnyFilterActive = selectedFilterAssetId !== "ALL" || selectedFilterType !== "ALL";

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Valuation Ledger</h1>
                <p className="text-sm text-muted-foreground">Log or manage asset valuations and liquid account checkpoints across targeted timelines.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

                {/* INPUT DATA CONSOLE CARD */}
                <Card className="lg:col-span-1 shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-base">Record Balance Point</CardTitle>
                        <CardDescription>Capture currency valuation snapshot metrics.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {assets.length === 0 ? (
                            <div className="text-center py-4 text-xs text-muted-foreground">
                                No target accounts registered. Setup structural master data components first.
                            </div>
                        ) : (
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-medium text-muted-foreground">Target Portfolio Asset</label>
                                    <select
                                        value={selectedAssetId}
                                        onChange={(e) => setSelectedAssetId(e.target.value)}
                                        className="border rounded-md p-2 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary w-full cursor-pointer"
                                    >
                                        {assets.map(a => (
                                            <option key={a.id} value={a.id}>{a.name} ({a.institution})</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="p-3 border rounded-md text-xs bg-muted/40 transition duration-150">
                                    <p className="font-semibold text-muted-foreground mb-1">Previous Account Benchmark:</p>
                                    {lastValuation ? (
                                        <div className="flex justify-between items-center text-foreground mt-0.5">
                                            <span>Last Logged: <strong className="font-medium">{formatToEuroDate(lastValuation.valuation_date)}</strong></span>
                                            <span className="font-bold text-primary">{formatToEuroCurrency(lastValuation.balance_amount)}</span>
                                        </div>
                                    ) : (
                                        <p className="text-muted-foreground italic mt-0.5">No historical timeline coordinates present for this profile asset.</p>
                                    )}
                                </div>

                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-medium text-muted-foreground">Valuation Checkpoint Date</label>
                                    <input
                                        type="date"
                                        value={valuationDate}
                                        onChange={(e) => setValuationDate(e.target.value)}
                                        className="border rounded-md p-2 bg-background text-sm cursor-pointer"
                                        required
                                    />
                                </div>

                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-medium text-muted-foreground">Current Valuation Amount (€)</label>
                                    <div className="relative flex items-center">
                                        <span className="absolute left-3 text-muted-foreground text-sm">€</span>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={balanceAmount}
                                            onChange={(e) => setBalanceAmount(e.target.value)}
                                            placeholder="0,00"
                                            className="border rounded-md p-2 pl-7 bg-background text-sm w-full"
                                            required
                                        />
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full bg-primary text-primary-foreground font-medium py-2 rounded-md transition hover:opacity-90 text-sm disabled:opacity-50 cursor-pointer"
                                >
                                    {loading ? "Recording Value..." : "Commit Valuation Point"}
                                </button>
                            </form>
                        )}
                    </CardContent>
                </Card>

                {/* LEDGER HISTORICAL ARCHIVE INDEX TABLE */}
                <div className="lg:col-span-2 space-y-3">
                    <h3 className="text-base font-semibold px-1 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <History className="h-4 w-4 text-muted-foreground" />
                            Accounting Transaction History Log
                        </div>
                        {isAnyFilterActive && (
                            <button
                                onClick={() => {
                                    setSelectedFilterAssetId("ALL");
                                    setSelectedFilterType("ALL");
                                }}
                                className="text-[10px] bg-muted border px-2 py-0.5 rounded text-muted-foreground hover:bg-accent transition cursor-pointer"
                            >
                                Clear All Filters
                            </button>
                        )}
                    </h3>

                    <div className="border rounded-xl bg-card overflow-hidden shadow-sm">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse text-xs">
                                <thead>
                                    <tr className="border-b bg-muted/40 font-medium text-muted-foreground select-none">

                                        <th className="p-3 align-middle">
                                            <button
                                                onClick={toggleSortDirection}
                                                className="flex items-center gap-1.5 font-medium text-muted-foreground hover:text-foreground transition cursor-pointer focus:outline-none"
                                                title={`Sorted ${sortOrder === "desc" ? "Newest First" : "Oldest First"}. Click to toggle.`}
                                            >
                                                <span>Valuation Date</span>
                                                {sortOrder === "desc" ? (
                                                    <ArrowDown className="h-3.5 w-3.5 text-primary" />
                                                ) : (
                                                    <ArrowUp className="h-3.5 w-3.5 text-primary" />
                                                )}
                                            </button>
                                        </th>

                                        <th className="p-3 align-middle">
                                            <div className="flex items-center gap-2 min-w-[180px]">
                                                <span>Asset Profile Account</span>
                                                <div className="relative flex items-center group text-foreground">
                                                    <Filter className="absolute left-1.5 h-3 w-3 text-muted-foreground pointer-events-none group-hover:text-primary transition" />
                                                    <select
                                                        value={selectedFilterAssetId}
                                                        onChange={(e) => setSelectedFilterAssetId(e.target.value)}
                                                        className="pl-5 pr-2 py-0.5 text-[10px] bg-background border rounded font-normal text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary max-w-[140px] cursor-pointer hover:border-muted-foreground/50 transition appearance-none"
                                                    >
                                                        <option value="ALL">All Accounts ▾</option>
                                                        {assets.map(a => (
                                                            <option key={a.id} value={a.id}>{a.name}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>
                                        </th>

                                        {/* NEW ASSET TYPE FILTER COLUMN */}
                                        <th className="p-3 align-middle">
                                            <div className="flex items-center gap-2 min-w-[140px]">
                                                <span>Asset Type</span>
                                                <div className="relative flex items-center group text-foreground">
                                                    <Filter className="absolute left-1.5 h-3 w-3 text-muted-foreground pointer-events-none group-hover:text-primary transition" />
                                                    <select
                                                        value={selectedFilterType}
                                                        onChange={(e) => setSelectedFilterType(e.target.value)}
                                                        className="pl-5 pr-2 py-0.5 text-[10px] bg-background border rounded font-normal text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary max-w-[120px] cursor-pointer hover:border-muted-foreground/50 transition appearance-none"
                                                    >
                                                        <option value="ALL">All Types ▾</option>
                                                        {uniqueAssetTypes.map(type => (
                                                            <option key={type} value={type}>{type}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>
                                        </th>

                                        <th className="p-3 text-right align-middle">Balance Metrics (€)</th>
                                        <th className="p-3 text-center w-12 align-middle">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {processedLedger.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="p-8 text-center text-muted-foreground italic">
                                                No records found matching your combined filtering adjustments.
                                            </td>
                                        </tr>
                                    ) : (
                                        processedLedger.map((log) => (
                                            <tr key={log.id} className="hover:bg-muted/20 transition">
                                                <td className="p-3 whitespace-nowrap font-medium font-mono text-foreground">
                                                    {formatToEuroDate(log.valuation_date)}
                                                </td>
                                                <td className="p-3">
                                                    <div className="font-semibold text-foreground">{log.portfolio_assets?.name}</div>
                                                    <div className="text-[10px] text-muted-foreground">{log.portfolio_assets?.institution}</div>
                                                </td>
                                                {/* RENDERING ROW VALUE CELL */}
                                                <td className="p-3 whitespace-nowrap">
                                                    <span className="px-2 py-0.5 bg-muted border text-[10px] font-medium rounded-full text-muted-foreground uppercase tracking-wider">
                                                        {log.portfolio_assets?.asset_types?.name || "Unclassified"}
                                                    </span>
                                                </td>
                                                <td className="p-3 text-right font-bold text-foreground font-mono whitespace-nowrap">
                                                    {formatToEuroCurrency(log.balance_amount)}
                                                </td>
                                                <td className="p-3 text-center">
                                                    <button
                                                        onClick={() => handleDeleteLog(log.id)}
                                                        className="text-muted-foreground hover:text-destructive p-1 rounded transition opacity-70 hover:opacity-100 cursor-pointer"
                                                        title="Remove log entry points"
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}