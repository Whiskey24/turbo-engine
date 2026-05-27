"use client";

import { useCallback, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import type { PortfolioAssetWithTypeName } from "@/lib/database";
import { usePortfolioDataRefresh } from "@/lib/portfolio-refresh";
import { CHART_COLORS } from "@/lib/chart-colors";
import { formatIBAN } from "@/lib/utils";
import YearEndAllocationChart from "@/components/year-end-allocation-chart";

interface AssetTableRow {
    assetId: string;
    assetName: string;
    assetType: string;
    balance: number;
    institution: string;
    iban: string | null;
    ticker: string | null;
    isin: string | null;
}

const formatEuro = (num: number) => {
    return new Intl.NumberFormat("nl-NL", {
        style: "currency",
        currency: "EUR",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(num);
};

function yearEndDate(year: number): string {
    return `${year}-12-31`;
}

export default function ChartsHistoryPage() {
    const [allYearData, setAllYearData] = useState<Map<number, AssetTableRow[]>>(new Map());
    const [availableYears, setAvailableYears] = useState<number[]>([]);
    const [selectedYear, setSelectedYear] = useState<number | null>(null);
    const [assetTypes, setAssetTypes] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);

    const loadYearEndData = useCallback(async () => {
        try {
            setLoading(true);

            const { data: assets, error: assetErr } = await supabase
                .from("portfolio_assets")
                .select("id, name, institution, iban, ticker, isin, asset_types(name)");

            if (assetErr || !assets) throw assetErr;

            const { data: valuations, error: valErr } = await supabase
                .from("asset_valuations")
                .select("asset_id, balance_amount, valuation_date")
                .order("valuation_date", { ascending: true });

            if (valErr || !valuations) throw valErr;

            // Group valuations by asset, sorted by date
            const valuationsByAsset = new Map<string, { date: string; amount: number }[]>();
            for (const v of valuations) {
                const history = valuationsByAsset.get(v.asset_id) ?? [];
                history.push({ date: v.valuation_date, amount: Number(v.balance_amount) });
                valuationsByAsset.set(v.asset_id, history);
            }

            // Collect unique years from valuations
            const yearsSet = new Set<number>();
            for (const v of valuations) {
                yearsSet.add(Number.parseInt(v.valuation_date.slice(0, 4), 10));
            }

            // Only add the current calendar year if we have already crossed Dec 31st of this year
            const today = new Date();
            const currentYear = today.getFullYear();
            const currentYearEnd = new Date(`${currentYear}-12-31`);
            if (today >= currentYearEnd) {
                yearsSet.add(currentYear);
            }

            const sortedYears = Array.from(yearsSet).sort((a, b) => b - a);

            // Collect all unique asset types across all assets
            const allTypes = new Set<string>();

            // Build per-year data
            const yearDataMap = new Map<number, AssetTableRow[]>();

            for (const year of sortedYears) {
                const cutoff = yearEndDate(year);
                const rows: AssetTableRow[] = [];

                for (const asset of (assets as PortfolioAssetWithTypeName[])) {
                    const history = valuationsByAsset.get(asset.id) ?? [];
                    let latestBalance = 0;

                    for (const point of history) {
                        if (point.date <= cutoff) {
                            latestBalance = point.amount;
                        } else {
                            break;
                        }
                    }

                    if (latestBalance <= 0) continue;

                    const typeName = asset.asset_types?.name || "Unclassified Assets";
                    allTypes.add(typeName);

                    rows.push({
                        assetId: asset.id,
                        assetName: asset.name,
                        assetType: typeName,
                        balance: latestBalance,
                        institution: asset.institution,
                        iban: asset.iban,
                        ticker: asset.ticker,
                        isin: asset.isin
                    });
                }

                if (rows.length > 0) {
                    yearDataMap.set(year, rows);
                }
            }

            setAllYearData(yearDataMap);
            setAvailableYears(sortedYears.filter(y => yearDataMap.has(y)));
            setAssetTypes(Array.from(allTypes).sort((a, b) => a.localeCompare(b)));

            // Default to latest year that has data
            const latest = sortedYears.find(y => yearDataMap.has(y)) ?? null;
            setSelectedYear((prev) => prev ?? latest);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Unknown error";
            console.error("Year-end table error:", message);
        } finally {
            setLoading(false);
        }
    }, []);

    usePortfolioDataRefresh(loadYearEndData);

    const currentTableRows = selectedYear ? (allYearData.get(selectedYear) ?? []) : [];

    // Sort table rows by asset type (alphabetically), then by asset name
    const sortedRows = [...currentTableRows].sort((a, b) => {
        const typeCompare = a.assetType.localeCompare(b.assetType);
        if (typeCompare !== 0) return typeCompare;
        return a.assetName.localeCompare(b.assetName);
    });

    // Get sorted asset types for the current year, preserving the global type order
    const currentYearTypes = [...new Set(sortedRows.map(r => r.assetType))]
        .sort((a, b) => {
            const idxA = assetTypes.indexOf(a);
            const idxB = assetTypes.indexOf(b);
            if (idxA === -1 && idxB === -1) return a.localeCompare(b);
            if (idxA === -1) return 1;
            if (idxB === -1) return -1;
            return idxA - idxB;
        });

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Historical Timelines</h1>
                <p className="text-sm text-muted-foreground">
                    Compounded timeline valuation growth trend maps over time.
                </p>
            </div>

            <YearEndAllocationChart />

            {/* YEAR-END ASSET VALUATION TABLE */}
            <Card className="shadow-sm">
                <CardHeader>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <CardTitle className="text-base">Asset Valuations by Year-End</CardTitle>
                            <CardDescription>
                                Individual asset balances as of 31 December for the selected year.
                            </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                            <label htmlFor="year-select" className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                                Year-end date
                            </label>
                            <select
                                id="year-select"
                                value={selectedYear ?? ""}
                                onChange={(e) => setSelectedYear(e.target.value ? Number.parseInt(e.target.value, 10) : null)}
                                className="rounded-lg border bg-card px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                            >
                                {availableYears.length === 0 && (
                                    <option value="" disabled>No data available</option>
                                )}
                                {availableYears.map((year) => (
                                    <option key={year} value={year}>
                                        31 December {year}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="h-32 flex items-center justify-center text-sm text-muted-foreground animate-pulse">
                            Crunching year-end valuation matrices...
                        </div>
                    ) : sortedRows.length === 0 ? (
                        <div className="h-32 flex items-center justify-center border border-dashed rounded-xl text-muted-foreground text-sm italic">
                            No valuation data available for this year.
                        </div>
                    ) : (
                        <div className="overflow-x-auto overflow-y-auto max-h-[600px]">
                            <table className="w-full text-sm">
                                <thead className="sticky top-0 bg-card z-10">
                                    <tr className="border-b">
                                        <th className="text-left py-3 px-4 font-semibold text-muted-foreground">Asset Name</th>
                                        {currentYearTypes.map((typeName, idx) => (
                                            <th key={typeName} className="text-right py-3 px-4 font-semibold text-muted-foreground">
                                                <div className="flex items-center justify-end gap-2">
                                                    <span
                                                        className="h-2.5 w-2.5 rounded-full shrink-0"
                                                        style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
                                                    />
                                                    {typeName}
                                                </div>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedRows.map((row, index) => (
                                        <tr
                                            key={row.assetId}
                                            className={`border-b hover:bg-muted/30 transition ${index % 2 === 0 ? "bg-muted/20" : ""}`}
                                        >
                                            <td className="py-2 px-4 text-foreground font-medium group/cell relative">
                                                <span className="cursor-pointer border-b border-dotted border-muted-foreground/40 hover:border-foreground/60 transition-colors">
                                                    {row.assetName}
                                                </span>
                                                {/* Card details tooltip on hover */}
                                                <div className="pointer-events-none absolute left-4 top-full mt-1 z-50 w-64 opacity-0 group-hover/cell:opacity-100 transition-opacity duration-150">
                                                    <div className="bg-popover border border-border rounded-lg shadow-lg p-3 text-xs space-y-1.5">
                                                        <p className="font-semibold text-foreground text-sm border-b pb-1 mb-1">{row.assetName}</p>
                                                        <div className="space-y-1 text-muted-foreground">
                                                            {row.institution && (
                                                                <p><span className="font-medium text-foreground">Bank:</span> {row.institution}</p>
                                                            )}
                                                            {row.iban && (
                                                                <p className="font-mono"><span className="font-medium text-foreground">IBAN:</span> {formatIBAN(row.iban)}</p>
                                                            )}
                                                            {row.ticker && (
                                                                <p className="font-mono"><span className="font-medium text-foreground">Ticker:</span> {row.ticker}</p>
                                                            )}
                                                            {row.isin && (
                                                                <p className="font-mono"><span className="font-medium text-foreground">ISIN:</span> {row.isin}</p>
                                                            )}
                                                            {!row.institution && !row.iban && !row.ticker && !row.isin && (
                                                                <p className="italic text-muted-foreground">No additional card details</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            {currentYearTypes.map((typeName) => (
                                                <td key={typeName} className="py-2 px-4 text-right font-mono text-foreground">
                                                    {row.assetType === typeName ? formatEuro(row.balance) : ""}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                    <tr className="border-t-2 bg-muted/20 font-bold">
                                        <td className="py-3 px-4 text-foreground">Total</td>
                                        {currentYearTypes.map((typeName) => {
                                            const total = sortedRows
                                                .filter((row) => row.assetType === typeName)
                                                .reduce((sum, row) => sum + row.balance, 0);
                                            return (
                                                <td key={typeName} className="py-3 px-4 text-right font-mono text-foreground">
                                                    {formatEuro(total)}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}