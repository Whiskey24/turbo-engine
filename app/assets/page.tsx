"use client";
export const dynamic = "force-dynamic";
import { useState, useCallback, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { LayoutGrid, Table, ArrowUp, ArrowDown, ChevronsUpDown } from "lucide-react";

import { supabase } from "@/lib/supabase";
import type { AssetType, PortfolioAssetWithType } from "@/lib/database";
import { ASSET_TYPE_SLUGS, getUserSettings } from "@/lib/database";
import { usePortfolioDataRefresh } from "@/lib/portfolio-refresh";
import { formatIBAN } from "@/lib/utils";

const ASSET_TYPE_LABELS: Record<typeof ASSET_TYPE_SLUGS[number], string> = {
    BANK_ACCOUNT: "Bank Account",
    STOCK: "Individual Stocks",
    CRYPTO: "Cryptocurrency",
    FUND_ETF: "Mutual Funds & ETFs",
    REAL_ESTATE: "Real Estate Property",
    OTHER: "Other Assets / Miscellaneous",
};

const formatDate = (dateStr: string, locale: string) => {
    if (!dateStr) return "";
    const [year, month, day] = dateStr.split("-").map(Number);
    return new Intl.DateTimeFormat(locale, { dateStyle: "short" }).format(new Date(year, month - 1, day));
};

const formatCurrency = (value: number, locale: string) => {
    return new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(value);
};

interface LatestValuation {
    balance_amount: number;
    valuation_date: string;
}

type SortField = "name" | "institution" | "type" | "valuation";
interface SortConfig {
    field: SortField;
    direction: "asc" | "desc";
}

export default function AssetsPage() {
    const [types, setTypes] = useState<AssetType[]>([]);
    const [assets, setAssets] = useState<PortfolioAssetWithType[]>([]);
    const [latestValuations, setLatestValuations] = useState<Record<string, LatestValuation>>({});
    const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
    const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
    const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
    const [locale, setLocale] = useState<string>("en-GB");

    const fetchData = useCallback(async () => {
        const { data: fetchTypes } = await supabase
            .from("asset_types")
            .select("*")
            .order("name", { ascending: true });

        // type_slug is now a direct column on portfolio_assets — no longer joined from asset_types
        const { data: fetchAssets } = await supabase
            .from("portfolio_assets")
            .select("*, asset_types(name)")
            .order("name", { ascending: true });

        const { data: fetchValuations } = await supabase
            .from("asset_valuations")
            .select("asset_id, balance_amount, valuation_date")
            .order("valuation_date", { ascending: false });

        if (fetchTypes) {
            setTypes(fetchTypes);
            setSelectedTypes((current) =>
                current.size === 0
                    ? new Set(fetchTypes.map((t) => t.id))
                    : current
            );
        }
        if (fetchAssets) {
            setAssets(fetchAssets);
        }
        if (fetchValuations) {
            const latest: Record<string, LatestValuation> = {};
            fetchValuations.forEach((row) => {
                if (!(row.asset_id in latest)) {
                    latest[row.asset_id] = {
                        balance_amount: Number(row.balance_amount),
                        valuation_date: row.valuation_date,
                    };
                }
            });
            setLatestValuations(latest);
        }
    }, []);

    usePortfolioDataRefresh(fetchData);

    useEffect(() => {
        getUserSettings().then((prefs) => { if (prefs.locale) setLocale(prefs.locale); });
    }, []);

    const handleSort = (field: SortField) => {
        setSortConfig((current) => {
            if (!current || current.field !== field) return { field, direction: "asc" };
            if (current.direction === "asc") return { field, direction: "desc" };
            return null;
        });
    };

    const renderSortIcon = (field: SortField) => {
        if (!sortConfig || sortConfig.field !== field)
            return <ChevronsUpDown className="ml-1 h-3 w-3 inline text-muted-foreground/50 group-hover:text-muted-foreground transition" />;
        return sortConfig.direction === "asc"
            ? <ArrowUp className="ml-1 h-3 w-3 inline text-primary" />
            : <ArrowDown className="ml-1 h-3 w-3 inline text-primary" />;
    };

    const sortedAssets = [...assets].sort((a, b) => {
        if (!sortConfig) return 0;
        const { field, direction } = sortConfig;
        let valA: string | number = "";
        let valB: string | number = "";

        if (field === "name") {
            valA = (a.name || "").toLowerCase();
            valB = (b.name || "").toLowerCase();
        } else if (field === "institution") {
            valA = (a.institution || "").toLowerCase();
            valB = (b.institution || "").toLowerCase();
        } else if (field === "type") {
            valA = (a.asset_types?.name || "").toLowerCase();
            valB = (b.asset_types?.name || "").toLowerCase();
        } else if (field === "valuation") {
            valA = latestValuations[a.id]?.balance_amount ?? -1;
            valB = latestValuations[b.id]?.balance_amount ?? -1;
        }

        if (valA < valB) return direction === "asc" ? -1 : 1;
        if (valA > valB) return direction === "asc" ? 1 : -1;
        return 0;
    });

    const allSelected = types.length > 0 && selectedTypes.size === types.length;

    const toggleType = (id: string) => {
        setSelectedTypes((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const toggleAll = () => {
        setSelectedTypes(allSelected ? new Set() : new Set(types.map((t) => t.id)));
    };

    const filteredAssets = sortedAssets.filter((a) => selectedTypes.has(a.type_id));

    return (
        <div className="space-y-6 p-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Assets</h1>
                <p className="text-sm text-muted-foreground">Overview of all registered assets and their latest valuations.</p>
            </div>

            <div className="space-y-3 w-full">

                {/* Toolbar: filter buttons + view switcher */}
                {assets.length > 0 && (
                    <div className="flex flex-wrap justify-between items-center gap-3 px-1">

                        {/* Type filter pills */}
                        {types.length > 1 && (
                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    onClick={toggleAll}
                                    className={`text-xs px-2.5 py-1 rounded-full border font-medium transition cursor-pointer ${allSelected
                                        ? "bg-primary text-primary-foreground border-primary"
                                        : "bg-muted text-muted-foreground border-border hover:text-foreground"
                                        }`}
                                >
                                    {allSelected ? "Deselect all" : "Select all"}
                                </button>
                                <div className="w-px h-4 bg-border" />
                                {types.map((type) => (
                                    <button
                                        key={type.id}
                                        onClick={() => toggleType(type.id)}
                                        className={`text-xs px-2.5 py-1 rounded-full border font-medium transition cursor-pointer ${selectedTypes.has(type.id)
                                            ? "bg-primary text-primary-foreground border-primary"
                                            : "bg-muted/40 text-muted-foreground/50 border-border/50 hover:text-muted-foreground"
                                            }`}
                                    >
                                        {type.name}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* View switcher */}
                        <div className="flex items-center gap-1 bg-muted p-1 rounded-lg border ml-auto">
                            <button
                                onClick={() => setViewMode("cards")}
                                className={`p-1.5 rounded-md transition text-xs flex items-center gap-1.5 cursor-pointer ${viewMode === "cards"
                                    ? "bg-card text-foreground shadow-sm font-medium"
                                    : "text-muted-foreground hover:text-foreground"
                                    }`}
                                title="Show Cards Layout"
                            >
                                <LayoutGrid className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">Cards</span>
                            </button>
                            <button
                                onClick={() => setViewMode("table")}
                                className={`p-1.5 rounded-md transition text-xs flex items-center gap-1.5 cursor-pointer ${viewMode === "table"
                                    ? "bg-card text-foreground shadow-sm font-medium"
                                    : "text-muted-foreground hover:text-foreground"
                                    }`}
                                title="Show Spreadsheet Table"
                            >
                                <Table className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">Table</span>
                            </button>
                        </div>
                    </div>
                )}

                {/* Empty states */}
                {assets.length === 0 ? (
                    <div className="border border-dashed rounded-xl h-32 flex items-center justify-center text-muted-foreground text-sm bg-card">
                        No assets registered.
                    </div>
                ) : filteredAssets.length === 0 ? (
                    <div className="border border-dashed rounded-xl h-32 flex items-center justify-center text-muted-foreground text-sm bg-card">
                        No assets match the selected filters.
                    </div>

                ) : viewMode === "cards" ? (

                    /* CARDS VIEW */
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredAssets.map((asset) => (
                            <Card key={asset.id} className="shadow-sm">
                                <CardHeader className="pb-2">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <CardTitle className="text-sm font-bold">{asset.name}</CardTitle>
                                            <CardDescription className="text-xs">{asset.institution}</CardDescription>
                                        </div>
                                        {/* Type group badge + per-asset classification label */}
                                        <div className="flex flex-col items-end gap-0.5 shrink-0 ml-2">
                                            <span className="text-[10px] font-bold bg-secondary text-secondary-foreground px-2 py-0.5 rounded tracking-wider">
                                                {asset.asset_types?.name || "Asset"}
                                            </span>
                                            {asset.type_slug && asset.type_slug in ASSET_TYPE_LABELS && (
                                                <span className="text-[9px] text-muted-foreground font-medium">
                                                    {ASSET_TYPE_LABELS[asset.type_slug as keyof typeof ASSET_TYPE_LABELS]}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="text-xs space-y-1.5 text-muted-foreground pt-0">
                                    {asset.iban && <p><span className="font-medium text-foreground">IBAN:</span> {formatIBAN(asset.iban)}</p>}
                                    {asset.ticker && <p><span className="font-medium text-foreground">Ticker:</span> {asset.ticker}</p>}
                                    {asset.isin && <p><span className="font-medium text-foreground">ISIN:</span> {asset.isin}</p>}
                                    {latestValuations[asset.id] ? (
                                        <div className="flex justify-between items-center border-t pt-1.5 mt-1.5 text-foreground">
                                            <span>Last Valuation: <strong className="font-medium">{formatDate(latestValuations[asset.id].valuation_date, locale)}</strong></span>
                                            <span className="font-bold text-primary">{formatCurrency(latestValuations[asset.id].balance_amount, locale)}</span>
                                        </div>
                                    ) : (
                                        <p className="italic border-t pt-1.5 mt-1.5">No valuation logged yet.</p>
                                    )}
                                    {asset.comments && (
                                        <p className="italic border-t pt-1.5 mt-1.5 text-muted-foreground/90 truncate max-w-full" title={asset.comments}>
                                            {asset.comments}
                                        </p>
                                    )}
                                </CardContent>
                            </Card>
                        ))}
                    </div>

                ) : (

                    /* TABLE VIEW */
                    <div className="border rounded-md bg-card shadow-sm overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                            <thead>
                                <tr className="bg-muted/60 border-b text-muted-foreground font-medium select-none">
                                    <th
                                        onClick={() => handleSort("name")}
                                        className="p-3 cursor-pointer hover:bg-muted/80 hover:text-foreground group transition w-1/4"
                                    >
                                        <div className="flex items-center">
                                            <span>Asset</span>
                                            {renderSortIcon("name")}
                                        </div>
                                    </th>
                                    <th
                                        onClick={() => handleSort("institution")}
                                        className="p-3 cursor-pointer hover:bg-muted/80 hover:text-foreground group transition w-1/6"
                                    >
                                        <div className="flex items-center">
                                            <span>Custodian Bank / Broker</span>
                                            {renderSortIcon("institution")}
                                        </div>
                                    </th>
                                    <th
                                        onClick={() => handleSort("type")}
                                        className="p-3 cursor-pointer hover:bg-muted/80 hover:text-foreground group transition w-1/5"
                                    >
                                        <div className="flex items-center">
                                            <span>Asset Category</span>
                                            {renderSortIcon("type")}
                                        </div>
                                    </th>
                                    <th className="p-3 text-muted-foreground font-medium w-1/5">Identifying Keys</th>
                                    <th
                                        onClick={() => handleSort("valuation")}
                                        className="p-3 cursor-pointer hover:bg-muted/80 hover:text-foreground group transition text-right w-1/6"
                                    >
                                        <div className="flex items-center justify-end">
                                            <span>Latest Valuation</span>
                                            {renderSortIcon("valuation")}
                                        </div>
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {filteredAssets.map((asset) => {
                                    const valuation = latestValuations[asset.id];
                                    return (
                                        <tr key={asset.id} className="hover:bg-muted/30 transition-colors">
                                            <td className="p-3 font-semibold text-foreground">
                                                <div className="flex flex-col">
                                                    <span>{asset.name}</span>
                                                    {asset.comments && (
                                                        <span className="text-[10px] text-muted-foreground/80 font-normal max-w-xs truncate" title={asset.comments}>
                                                            {asset.comments}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="p-3 text-muted-foreground">{asset.institution}</td>
                                            <td className="p-3">
                                                {/* Type group badge + per-asset classification label */}
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="text-[10px] font-medium bg-secondary text-secondary-foreground px-2 py-0.5 rounded w-fit">
                                                        {asset.asset_types?.name || "Asset"}
                                                    </span>
                                                    {asset.type_slug && asset.type_slug in ASSET_TYPE_LABELS && (
                                                        <span className="text-[9px] text-muted-foreground pl-0.5">
                                                            {ASSET_TYPE_LABELS[asset.type_slug as keyof typeof ASSET_TYPE_LABELS]}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="p-3 font-mono text-[11px] text-muted-foreground space-y-0.5">
                                                {asset.iban && <div><span className="text-[9px] font-sans font-medium text-foreground/70 mr-1">[IBAN]</span>{formatIBAN(asset.iban)}</div>}
                                                {asset.ticker && <div><span className="text-[9px] font-sans font-medium text-foreground/70 mr-1">[TICK]</span>{asset.ticker}</div>}
                                                {asset.isin && <div><span className="text-[9px] font-sans font-medium text-foreground/70 mr-1">[ISIN]</span>{asset.isin}</div>}
                                                {!asset.iban && !asset.ticker && !asset.isin && (
                                                    <span className="italic text-muted-foreground/60 font-sans text-xs">—</span>
                                                )}
                                            </td>
                                            <td className="p-3 text-right">
                                                {valuation ? (
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-primary">{formatCurrency(valuation.balance_amount, locale)}</span>
                                                        <span className="text-[10px] text-muted-foreground">{formatDate(valuation.valuation_date, locale)}</span>
                                                    </div>
                                                ) : (
                                                    <span className="italic text-muted-foreground/60">No records</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
