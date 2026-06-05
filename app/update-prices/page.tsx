"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Database } from "@/lib/database.types";

type AssetRow = Database["public"]["Tables"]["portfolio_assets"]["Row"];
type PriceRow = Database["public"]["Tables"]["asset_prices"]["Row"];

interface EnhancedAssetItem {
    id: string;
    name: string;
    ticker: string | null;
    isin: string | null;
    type_slug: string;
    institution: string;
    has_active_holding: boolean;
    last_price: number | null;
    last_price_date: string | null;
    currency: string;
}

const TARGET_TYPES = ["STOCK", "CRYPTO", "FUND_ETF", "BOND"];

const TYPE_LABELS: Record<string, string> = {
    STOCK: "Stock",
    CRYPTO: "Cryptocurrency",
    FUND_ETF: "Fund / ETF",
    BOND: "Bond",
};

const TYPE_BADGES: Record<string, string> = {
    STOCK: "bg-blue-950/60 text-blue-400 border-blue-900/50",
    CRYPTO: "bg-purple-950/60 text-purple-400 border-purple-900/50",
    FUND_ETF: "bg-amber-950/60 text-amber-400 border-amber-900/50",
    BOND: "bg-indigo-950/60 text-indigo-400 border-indigo-900/50",
};

export default function UpdatePricesPage() {
    const [assets, setAssets] = useState<EnhancedAssetItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Filter States
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedType, setSelectedType] = useState<string>("ALL");
    const [filterActiveOnly, setFilterActiveOnly] = useState(false);

    // Update Modal/Form Inline States
    const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
    const [inputPrice, setInputPrice] = useState("");
    const [inputDate, setInputDate] = useState(() => {
        const today = new Date();
        return today.toISOString().split("T")[0];
    });
    const [submittingId, setSubmittingId] = useState<string | null>(null);

    async function loadPriceMatrix() {
        try {
            setLoading(true);
            setError(null);

            // 1. Fetch relevant assets
            const { data: rawAssets, error: assetErr } = await supabase
                .from("portfolio_assets")
                .select("*")
                .in("type_slug", TARGET_TYPES);

            if (assetErr) throw assetErr;

            // 2. Fetch inventory status from tax lots to evaluate current holdings
            const { data: rawLots, error: lotErr } = await supabase
                .from("tax_lots")
                .select("asset_id, quantity_remaining");

            if (lotErr) throw lotErr;

            // Map active holdings (quantity_remaining > 0)
            const activeAssetIds = new Set<string>(
                (rawLots || [])
                    .filter((lot) => lot.quantity_remaining > 0)
                    .map((lot) => lot.asset_id)
            );

            // 3. Fetch price history sorted by latest entry to pull current ticker baseline
            const { data: rawPrices, error: priceErr } = await supabase
                .from("asset_prices")
                .select("asset_id, price, price_date, currency")
                .order("price_date", { ascending: false });

            if (priceErr) throw priceErr;

            // Map unique historical prices to pick out the absolute latest date row per asset index
            const latestPriceMap = new Map<string, PriceRow>();
            (rawPrices || []).forEach((p) => {
                if (!latestPriceMap.has(p.asset_id)) {
                    latestPriceMap.set(p.asset_id, p as PriceRow);
                }
            });

            // 4. Assemble matrix
            const parsedItems: EnhancedAssetItem[] = (rawAssets || []).map((asset) => {
                const matchingPriceRecord = latestPriceMap.get(asset.id);
                return {
                    id: asset.id,
                    name: asset.name,
                    ticker: asset.ticker,
                    isin: asset.isin,
                    type_slug: asset.type_slug,
                    institution: asset.institution,
                    has_active_holding: activeAssetIds.has(asset.id),
                    last_price: matchingPriceRecord ? matchingPriceRecord.price : null,
                    last_price_date: matchingPriceRecord ? matchingPriceRecord.price_date : null,
                    currency: matchingPriceRecord ? matchingPriceRecord.currency : "EUR",
                };
            });

            setAssets(parsedItems);
        } catch (err: any) {
            console.error("Price Engine Query Error:", err);
            setError(err.message || "Failed to parse target pricing matrices.");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadPriceMatrix();
    }, []);

    const handleOpenUpdateInline = (item: EnhancedAssetItem) => {
        setEditingAssetId(item.id);
        setInputPrice(item.last_price !== null ? item.last_price.toString() : "");
    };

    const handleCancelInline = () => {
        setEditingAssetId(null);
        setInputPrice("");
    };

    const handleSubmitPrice = async (item: EnhancedAssetItem) => {
        const parsedPrice = parseFloat(inputPrice);
        if (isNaN(parsedPrice) || parsedPrice < 0) {
            alert("Please configure a valid numerical price entry.");
            return;
        }

        try {
            setSubmittingId(item.id);

            const { error: insertErr } = await supabase
                .from("asset_prices")
                .insert({
                    asset_id: item.id,
                    price: parsedPrice,
                    price_date: inputDate,
                    currency: item.currency,
                    source: "MANUAL",
                });

            if (insertErr) throw insertErr;

            // Sync data changes back to layout locally
            setAssets((prev) =>
                prev.map((asset) =>
                    asset.id === item.id
                        ? { ...asset, last_price: parsedPrice, last_price_date: inputDate }
                        : asset
                )
            );
            setEditingAssetId(null);
        } catch (err: any) {
            console.error("Insert price action failure:", err);
            alert(`Could not log price update: ${err.message}`);
        } finally {
            setSubmittingId(null);
        }
    };

    // List processing pipelines
    const filteredAssets = assets.filter((item) => {
        const matchesSearch =
            item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (item.ticker && item.ticker.toLowerCase().includes(searchQuery.toLowerCase())) ||
            (item.isin && item.isin.toLowerCase().includes(searchQuery.toLowerCase()));

        const matchesType = selectedType === "ALL" || item.type_slug === selectedType;
        const matchesHolding = !filterActiveOnly || item.has_active_holding;

        return matchesSearch && matchesType && matchesHolding;
    });

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
                <div className="text-center space-y-3">
                    <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent mx-auto"></div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Polling Asset Inventories...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 p-6 sm:p-8">
            <div className="max-w-7xl mx-auto space-y-6">

                {/* Top Content Row */}
                <div className="border-b border-slate-800 pb-5">
                    <h1 className="text-2xl font-bold tracking-tight">Asset Price Manager</h1>
                    <p className="text-xs text-slate-400 mt-1">
                        Log raw historical prices into <span className="font-mono bg-slate-900 px-1 py-0.5 rounded text-slate-200">asset_prices</span> to maintain unrealized portfolio sub-ledger valuation accuracy.
                    </p>
                </div>

                {/* Messaging Interface */}
                {error && (
                    <div className="bg-red-950/40 border border-red-900/50 rounded-lg p-4 text-xs text-red-400 font-medium">
                        {error}
                    </div>
                )}

                {/* Parameter Filtering Bar */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-900 border border-slate-800 rounded-xl p-4">
                    <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Search Matrix</label>
                        <input
                            type="text"
                            placeholder="Filter by name, ticker, ISIN..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-emerald-500 transition"
                        />
                    </div>

                    <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Asset Classification</label>
                        <div className="flex gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                            <button
                                onClick={() => setSelectedType("ALL")}
                                className={`flex-1 text-center py-1 rounded text-[11px] font-semibold transition ${selectedType === "ALL" ? "bg-emerald-500 text-slate-950" : "text-slate-400 hover:text-slate-200"}`}
                            >
                                All
                            </button>
                            {TARGET_TYPES.map((t) => (
                                <button
                                    key={t}
                                    onClick={() => setSelectedType(t)}
                                    className={`flex-1 text-center py-1 rounded text-[11px] font-semibold transition ${selectedType === t ? "bg-emerald-500 text-slate-950" : "text-slate-400 hover:text-slate-200"}`}
                                >
                                    {TYPE_LABELS[t]}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex flex-col justify-end pb-1.5">
                        <label className="relative flex items-center gap-2.5 cursor-pointer select-none text-xs font-medium text-slate-300">
                            <input
                                type="checkbox"
                                checked={filterActiveOnly}
                                onChange={(e) => setFilterActiveOnly(e.target.checked)}
                                className="sr-only peer"
                            />
                            <div className="w-8 h-4.5 bg-slate-950 border border-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:bg-slate-500 after:border-slate-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:after:bg-emerald-400 peer-checked:border-emerald-900/50 peer-checked:bg-emerald-950/40"></div>
                            <span>Filter active inventory holdings only</span>
                        </label>
                    </div>
                </div>

                {/* Data Output Matrix */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs sm:text-sm">
                            <thead>
                                <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 font-medium">
                                    <th className="p-4 font-semibold">Asset Identity</th>
                                    <th className="p-4 font-semibold">Classification</th>
                                    <th className="p-4 font-semibold">Holding Status</th>
                                    <th className="p-4 text-right font-semibold">Last Recorded Price</th>
                                    <th className="p-4 text-right font-semibold">Last Verified Date</th>
                                    <th className="p-4 text-center font-semibold max-w-[240px]">Modify Pricing Ticker</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60 bg-slate-950/10">
                                {filteredAssets.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="p-8 text-center text-slate-500 text-xs uppercase font-medium tracking-wide">
                                            No tracked asset entities matched your filter criteria.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredAssets.map((item) => {
                                        const isEditing = editingAssetId === item.id;
                                        return (
                                            <tr key={item.id} className="hover:bg-slate-900/40 transition">
                                                {/* Identity */}
                                                <td className="p-4">
                                                    <div className="font-semibold text-slate-100">{item.name}</div>
                                                    <div className="text-slate-400 font-mono text-[11px] mt-0.5 flex items-center gap-1.5">
                                                        {item.ticker ? <span>{item.ticker}</span> : <span className="italic text-slate-600">No Ticker</span>}
                                                        {item.isin && <span className="text-slate-600">• {item.isin}</span>}
                                                        <span className="text-slate-600">• {item.institution}</span>
                                                    </div>
                                                </td>

                                                {/* Class */}
                                                <td className="p-4 whitespace-nowrap">
                                                    <span className={`text-[10px] uppercase font-bold tracking-wide border px-2 py-0.5 rounded ${TYPE_BADGES[item.type_slug]}`}>
                                                        {TYPE_LABELS[item.type_slug]}
                                                    </span>
                                                </td>

                                                {/* Holding Indicator */}
                                                <td className="p-4 whitespace-nowrap">
                                                    {item.has_active_holding ? (
                                                        <div className="flex items-center gap-1.5 text-emerald-400 font-medium text-xs">
                                                            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
                                                            Active Position
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-1.5 text-slate-500 text-xs">
                                                            <span className="h-2 w-2 rounded-full bg-slate-700"></span>
                                                            No Balance
                                                        </div>
                                                    )}
                                                </td>

                                                {/* Last Price */}
                                                <td className="p-4 text-right font-mono text-slate-200 font-medium">
                                                    {item.last_price !== null
                                                        ? new Intl.NumberFormat("en-US", { style: "currency", currency: item.currency }).format(item.last_price)
                                                        : "—"}
                                                </td>

                                                {/* Last Date */}
                                                <td className="p-4 text-right font-mono text-slate-400">
                                                    {item.last_price_date || "—"}
                                                </td>

                                                {/* Dynamic Controls Column */}
                                                <td className="p-4 text-center max-w-[280px]">
                                                    {isEditing ? (
                                                        <div className="flex flex-col sm:flex-row items-center gap-2 justify-end">
                                                            <div className="flex items-center bg-slate-950 border border-slate-800 rounded-md overflow-hidden w-full sm:w-auto">
                                                                <span className="px-2 font-mono text-[11px] text-slate-500 bg-slate-900 border-r border-slate-800 h-full py-1">
                                                                    {item.currency}
                                                                </span>
                                                                <input
                                                                    type="number"
                                                                    step="any"
                                                                    placeholder="0.00"
                                                                    value={inputPrice}
                                                                    onChange={(e) => setInputPrice(e.target.value)}
                                                                    className="bg-transparent text-xs font-mono text-slate-100 px-2 py-1 outline-none w-20"
                                                                    autoFocus
                                                                />
                                                            </div>
                                                            <input
                                                                type="date"
                                                                value={inputDate}
                                                                onChange={(e) => setInputDate(e.target.value)}
                                                                className="bg-slate-950 border border-slate-800 rounded-md text-[11px] font-mono text-slate-300 px-2 py-1 outline-none w-full sm:w-auto"
                                                            />
                                                            <div className="flex gap-1 w-full sm:w-auto justify-end">
                                                                <button
                                                                    onClick={() => handleSubmitPrice(item)}
                                                                    disabled={submittingId === item.id}
                                                                    className="px-2.5 py-1 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-slate-950 font-semibold text-xs rounded transition"
                                                                >
                                                                    {submittingId === item.id ? "..." : "Save"}
                                                                </button>
                                                                <button
                                                                    onClick={handleCancelInline}
                                                                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded transition"
                                                                >
                                                                    X
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="flex justify-end">
                                                            <button
                                                                onClick={() => handleOpenUpdateInline(item)}
                                                                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 hover:text-emerald-400 border border-slate-700/60 rounded text-xs font-medium transition"
                                                            >
                                                                Update Price
                                                            </button>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}