"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Database } from "@/lib/database.types";
import { getUserSettings } from "@/lib/database";

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
    nominal_value?: number | null; // Fixed baseline face value for bonds
}

const TARGET_TYPES = ["STOCK", "CRYPTO", "FUND_ETF", "BOND"];

const TYPE_LABELS: Record<string, string> = {
    STOCK: "Stock",
    CRYPTO: "Cryptocurrency",
    FUND_ETF: "Fund / ETF",
    BOND: "Bond",
};

const TYPE_BADGES: Record<string, string> = {
    STOCK: "bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-900/50",
    CRYPTO: "bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-900/50",
    FUND_ETF: "bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-900/50",
    BOND: "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-900/50",
};

const formatDate = (dateStr: string, locale: string) => {
    if (!dateStr) return "";
    const [year, month, day] = dateStr.split("-").map(Number);
    return new Intl.DateTimeFormat(locale, { dateStyle: "short" }).format(new Date(year, month - 1, day));
};

export default function UpdatePricesPage() {
    const [assets, setAssets] = useState<EnhancedAssetItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Filter States
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedType, setSelectedType] = useState<string>("ALL");
    const [filterActiveOnly, setFilterActiveOnly] = useState(false);

    // Overlay Modal Managed States
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [activeAsset, setActiveAsset] = useState<EnhancedAssetItem | null>(null);
    const [modalPrice, setModalPrice] = useState("");
    const [modalPercentage, setModalPercentage] = useState("");

    // Fixed Nominal Value state (defaults to 100 if missing from asset configuration)
    const [fixedNominal, setFixedNominal] = useState(100);

    const [locale, setLocale] = useState("en-US");

    const [modalDate, setModalDate] = useState(() => {
        const today = new Date();
        return today.toISOString().split("T")[0];
    });
    const [submitting, setSubmitting] = useState(false);

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

            // 2. Fetch inventory status from tax lots to evaluate active holdings
            const { data: rawLots, error: lotErr } = await supabase
                .from("tax_lots")
                .select("asset_id, quantity_remaining");

            if (lotErr) throw lotErr;

            const activeAssetIds = new Set<string>(
                (rawLots || [])
                    .filter((lot) => lot.quantity_remaining > 0)
                    .map((lot) => lot.asset_id)
            );

            // 3. Fetch price history sorted by latest entry to pull current pricing benchmarks
            const { data: rawPrices, error: priceErr } = await supabase
                .from("asset_prices")
                .select("asset_id, price, price_date, currency")
                .order("price_date", { ascending: false });

            if (priceErr) throw priceErr;

            const latestPriceMap = new Map<string, PriceRow>();
            (rawPrices || []).forEach((p) => {
                if (!latestPriceMap.has(p.asset_id)) {
                    latestPriceMap.set(p.asset_id, p as PriceRow);
                }
            });

            // 4. Assemble matrix
            const parsedItems: EnhancedAssetItem[] = (rawAssets || []).map((asset: any) => {
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
                    nominal_value: asset.nominal_value ?? null,
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

    // ── Load user settings ────────────────────────────────────────────────────
    useEffect(() => {
        async function loadSettings() {
            const settings = await getUserSettings();
            if (settings?.locale) setLocale(settings.locale);
        }
        void loadSettings();
    }, []);

    useEffect(() => {
        loadPriceMatrix();
    }, []);

    // Open Overlay Handler
    const handleOpenModal = (item: EnhancedAssetItem) => {
        setActiveAsset(item);
        const currentPrice = item.last_price !== null ? item.last_price.toString() : "";
        setModalPrice(currentPrice);

        // Assign fixed nominal configuration (defaults to 100 if null/unconfigured)
        const nominalValue = item.nominal_value ? item.nominal_value : 100;
        setFixedNominal(nominalValue);

        // Calculate initial bond quote percentage if applicable
        if (item.type_slug === "BOND" && item.last_price !== null && nominalValue > 0) {
            setModalPercentage(((item.last_price / nominalValue) * 100).toString());
        } else {
            setModalPercentage("");
        }

        // Default date input back to present day
        const today = new Date();
        setModalDate(today.toISOString().split("T")[0]);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setActiveAsset(null);
        setModalPrice("");
        setModalPercentage("");
        setFixedNominal(100);
    };

    // Cross-linked calculation helpers using fixedNominal
    const handlePriceChange = (val: string) => {
        setModalPrice(val);
        const numPrice = parseFloat(val);

        if (activeAsset?.type_slug === "BOND" && fixedNominal > 0) {
            if (!isNaN(numPrice)) {
                // Price changed -> automatically recalculate percentage of nominal value
                setModalPercentage(((numPrice / fixedNominal) * 100).toString());
            } else {
                setModalPercentage("");
            }
        }
    };

    const handlePercentageChange = (val: string) => {
        setModalPercentage(val);
        const numPct = parseFloat(val);

        if (activeAsset?.type_slug === "BOND" && fixedNominal > 0) {
            if (!isNaN(numPct)) {
                // Percentage changed -> automatically recalculate absolute price
                setModalPrice(((fixedNominal * numPct) / 100).toString());
            } else {
                setModalPrice("");
            }
        }
    };

    // Submit Overlay Action
    const handleSubmitPrice = async () => {
        if (!activeAsset) return;

        const parsedPrice = parseFloat(modalPrice);
        if (isNaN(parsedPrice) || parsedPrice < 0) {
            alert("Please configure a valid numerical price entry.");
            return;
        }

        try {
            setSubmitting(true);

            // Upsert transaction utilizing composite primary keys or index combinations
            const { error: upsertErr } = await supabase
                .from("asset_prices")
                .upsert(
                    {
                        asset_id: activeAsset.id,
                        price: parsedPrice,
                        price_date: modalDate,
                        currency: activeAsset.currency,
                        source: "MANUAL",
                    },
                    { onConflict: "asset_id,price_date" }
                );

            if (upsertErr) throw upsertErr;

            // Sync parameters locally back into the listings matrix
            setAssets((prev) =>
                prev.map((asset) =>
                    asset.id === activeAsset.id
                        ? { ...asset, last_price: parsedPrice, last_price_date: modalDate }
                        : asset
                )
            );

            handleCloseModal();
        } catch (err: any) {
            console.error("Upsert price action failure:", err);
            alert(`Could not log price update: ${err.message}`);
        } finally {
            setSubmitting(false);
        }
    };

    // Filter pipelines
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
            <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
                <div className="text-center space-y-3">
                    <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent mx-auto"></div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Polling Asset Inventories...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background text-foreground p-6 sm:p-8">
            <div className="max-w-7xl mx-auto space-y-6">

                {/* Header Context Row */}
                <div className="border-b border-border pb-5">
                    <h1 className="text-2xl font-bold tracking-tight">Asset Price Manager</h1>
                    <p className="text-xs text-muted-foreground mt-1">
                        Log raw historical prices into <span className="font-mono bg-muted px-1 py-0.5 rounded text-foreground">asset_prices</span> to maintain valuation accuracy.
                    </p>
                </div>

                {/* Error Notifications */}
                {error && (
                    <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-lg p-4 text-xs text-red-600 dark:text-red-400 font-medium">
                        {error}
                    </div>
                )}

                {/* Filter Bar */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-card border border-border rounded-xl p-4">
                    <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Search Matrix</label>
                        <input
                            type="text"
                            placeholder="Filter by name, ticker, ISIN..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground placeholder-muted-foreground/60 outline-none focus:border-emerald-500 transition"
                        />
                    </div>

                    <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Asset Classification</label>
                        <div className="flex gap-1 bg-background p-1 rounded-lg border border-border">
                            <button
                                onClick={() => setSelectedType("ALL")}
                                className={`flex-1 text-center py-1 rounded text-[11px] font-semibold transition ${selectedType === "ALL" ? "bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950" : "text-muted-foreground hover:text-foreground"}`}
                            >
                                All
                            </button>
                            {TARGET_TYPES.map((t) => (
                                <button
                                    key={t}
                                    onClick={() => setSelectedType(t)}
                                    className={`flex-1 text-center py-1 rounded text-[11px] font-semibold transition ${selectedType === t ? "bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950" : "text-muted-foreground hover:text-foreground"}`}
                                >
                                    {TYPE_LABELS[t]}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex flex-col justify-end pb-1.5">
                        <label className="relative flex items-center gap-2.5 cursor-pointer select-none text-xs font-medium text-foreground/90">
                            <input
                                type="checkbox"
                                checked={filterActiveOnly}
                                onChange={(e) => setFilterActiveOnly(e.target.checked)}
                                className="sr-only peer"
                            />
                            <div className="w-8 h-4.5 bg-background border border-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:bg-muted-foreground/60 after:border-border after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:after:bg-emerald-500 peer-checked:border-emerald-500/50 peer-checked:bg-emerald-50 dark:peer-checked:bg-emerald-950/40"></div>
                            <span>Filter active inventory holdings only</span>
                        </label>
                    </div>
                </div>

                {/* Main Grid Table Container */}
                <div className="bg-card border border-border rounded-xl overflow-hidden shadow-xl">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs sm:text-sm">
                            <thead>
                                <tr className="bg-muted/50 border-b border-border text-muted-foreground font-medium">
                                    <th className="p-4 font-semibold">Asset Identity</th>
                                    <th className="p-4 font-semibold">Classification</th>
                                    <th className="p-4 font-semibold">Holding Status</th>
                                    <th className="p-4 text-right font-semibold">Last Recorded Price</th>
                                    <th className="p-4 text-right font-semibold">Last Verified Date</th>
                                    <th className="p-4 text-right font-semibold">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border bg-card">
                                {filteredAssets.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="p-8 text-center text-muted-foreground text-xs uppercase font-medium tracking-wide">
                                            No tracked asset entities matched your filter criteria.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredAssets.map((item) => (
                                        <tr key={item.id} className="hover:bg-muted/40 transition">
                                            <td className="p-4">
                                                <div className="font-semibold text-foreground">{item.name}</div>
                                                <div className="text-muted-foreground font-mono text-[11px] mt-0.5 flex items-center gap-1.5">
                                                    {item.ticker ? <span>{item.ticker}</span> : <span className="italic text-muted-foreground/60">No Ticker</span>}
                                                    {item.isin && <span className="text-muted-foreground/60">• {item.isin}</span>}
                                                    <span className="text-muted-foreground/60">• {item.institution}</span>
                                                </div>
                                            </td>

                                            <td className="p-4 whitespace-nowrap">
                                                <span className={`text-[10px] uppercase font-bold tracking-wide border px-2 py-0.5 rounded ${TYPE_BADGES[item.type_slug]}`}>
                                                    {TYPE_LABELS[item.type_slug]}
                                                </span>
                                            </td>

                                            <td className="p-4 whitespace-nowrap">
                                                {item.has_active_holding ? (
                                                    <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium text-xs">
                                                        <span className="h-2 w-2 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse"></span>
                                                        Active Position
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-1.5 text-muted-foreground/60 text-xs">
                                                        <span className="h-2 w-2 rounded-full bg-muted-foreground/30"></span>
                                                        No Balance
                                                    </div>
                                                )}
                                            </td>

                                            <td className="p-4 text-right font-mono text-foreground font-medium">
                                                {item.last_price !== null
                                                    ? new Intl.NumberFormat(locale, {
                                                        style: "currency",
                                                        currency: item.currency,
                                                        minimumFractionDigits: 2,
                                                        maximumFractionDigits: 8
                                                    }).format(item.last_price)
                                                    : "—"}
                                            </td>

                                            <td className="p-4 text-right font-mono text-muted-foreground">
                                                {item.last_price_date ? formatDate(item.last_price_date, locale) : "—"}
                                            </td>

                                            <td className="p-4 text-right">
                                                <button
                                                    onClick={() => handleOpenModal(item)}
                                                    className="px-3 py-1 bg-muted hover:bg-muted/80 hover:text-emerald-600 dark:hover:text-emerald-400 border border-border rounded text-xs font-medium transition"
                                                >
                                                    Update Price
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

            {/* High-Precision Price Update Overlay Modal */}
            {isModalOpen && activeAsset && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
                    <div className="bg-card border border-border rounded-xl max-w-lg w-full shadow-2xl overflow-hidden transform transition-all my-8">

                        {/* Modal Header */}
                        <div className="border-b border-border p-5 bg-muted/30">
                            <div className="flex justify-between items-start">
                                <div>
                                    <span className={`text-[9px] uppercase font-bold tracking-wider border px-2 py-0.5 rounded mb-2 inline-block ${TYPE_BADGES[activeAsset.type_slug]}`}>
                                        {TYPE_LABELS[activeAsset.type_slug]}
                                    </span>
                                    <h3 className="text-base font-bold text-foreground tracking-tight">{activeAsset.name}</h3>
                                    <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                                        {activeAsset.ticker || "No Ticker"} {activeAsset.isin ? `• ${activeAsset.isin}` : ""} • {activeAsset.institution}
                                    </p>
                                </div>
                                <button
                                    onClick={handleCloseModal}
                                    className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>

                        {/* Modal Form Content */}
                        <div className="p-6 space-y-5">

                            {/* Date Selector Container */}
                            <div>
                                <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                                    Price Metric Valuation Date
                                </label>
                                <input
                                    type="date"
                                    value={modalDate}
                                    onChange={(e) => setModalDate(e.target.value)}
                                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono text-foreground outline-none focus:border-emerald-500 transition"
                                />
                            </div>

                            {/* Linked Bond Input Metrics Layout */}
                            {activeAsset.type_slug === "BOND" && (
                                <div className="bg-muted/40 border border-border rounded-lg p-3.5 space-y-3">
                                    <div className="flex justify-between items-center">
                                        <p className="text-[11px] font-medium text-muted-foreground">
                                            Fixed Income Parameters
                                        </p>
                                        <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900/50 px-2 py-0.5 rounded">
                                            Fixed Nominal Value: {new Intl.NumberFormat("en-US", {
                                                style: "currency",
                                                currency: activeAsset.currency,
                                                minimumFractionDigits: 2,
                                                maximumFractionDigits: 2
                                            }).format(fixedNominal)}
                                        </span>
                                    </div>

                                    <div>
                                        <label className="block text-[10px] font-semibold text-muted-foreground mb-1">
                                            Quote Percentage (%)
                                        </label>
                                        <div className="relative flex items-center bg-background border border-border rounded-lg overflow-hidden focus-within:border-emerald-500 transition">
                                            <input
                                                type="number"
                                                step="0.01"
                                                placeholder="0.00"
                                                value={modalPercentage}
                                                onChange={(e) => handlePercentageChange(e.target.value)}
                                                className="w-full bg-transparent px-3 py-2 font-mono text-xs text-foreground outline-none"
                                            />
                                            <span className="bg-muted px-2.5 py-2 border-l border-border font-mono text-xs text-muted-foreground">%</span>
                                        </div>
                                        <p className="text-[10px] text-muted-foreground/60 mt-1 italic">
                                            Adjusting either field below automatically recalculates the other based on the fixed nominal value.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Main Numerical Input Container */}
                            <div>
                                <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                                    {activeAsset.type_slug === "BOND" ? "Absolute Price" : "Asset Price Entry"}
                                </label>
                                <div className="relative flex items-center bg-background border border-border rounded-lg overflow-hidden shadow-sm focus-within:border-emerald-500 transition">
                                    <span className="bg-muted px-3 py-2.5 border-r border-border font-mono text-xs text-muted-foreground font-semibold">
                                        {activeAsset.currency}
                                    </span>
                                    <input
                                        type="number"
                                        step="0.01"
                                        placeholder="0.00"
                                        value={modalPrice}
                                        onChange={(e) => handlePriceChange(e.target.value)}
                                        className="w-full bg-transparent px-4 py-2.5 font-mono text-sm text-foreground placeholder-muted-foreground/40 outline-none"
                                        autoFocus={activeAsset.type_slug !== "BOND"}
                                    />
                                </div>
                                {activeAsset.type_slug === "CRYPTO" && (
                                    <p className="text-[10px] text-muted-foreground/80 mt-1.5 italic">
                                        Field allows deep sub-penny asset precision decimals for fractional cryptocurrency tokens.
                                    </p>
                                )}
                            </div>

                        </div>

                        {/* Modal Action Footer */}
                        <div className="border-t border-border p-4 bg-muted/20 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                            <button
                                type="button"
                                onClick={handleCloseModal}
                                disabled={submitting}
                                className="px-4 py-2 bg-muted hover:bg-muted/80 text-foreground text-xs font-semibold rounded-lg transition border border-border disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleSubmitPrice}
                                disabled={submitting}
                                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600 text-white dark:text-slate-950 text-xs font-bold rounded-lg shadow-md transition disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {submitting ? (
                                    <>
                                        <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"></span>
                                        Saving Changes...
                                    </>
                                ) : (
                                    "Save Price"
                                )}
                            </button>
                        </div>

                    </div>
                </div>
            )}
        </div>
    );
}