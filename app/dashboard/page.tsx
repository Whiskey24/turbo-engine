"use client";
import { useCallback, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend, Label } from "recharts";
import { Wallet, Landmark, TrendingUp } from "lucide-react";

import { supabase } from "@/lib/supabase";
import type { PortfolioAssetWithTypeName } from "@/lib/database";
import { usePortfolioDataRefresh } from "@/lib/portfolio-refresh";

interface AggregatedChartData {
    name: string;
    value: number;
    percentage?: number;
}

interface AssetWithBalance {
    id: string;
    name: string;
    typeName: string;
    balance: number;
}

interface AssetTableRow {
    assetId: string;
    assetName: string;
    assetType: string;
    balance: number;
}

// Tailored dashboard chart palette matrix
const CHART_COLORS = ["#2563eb", "#10b981", "#f59e0b", "#7c3aed", "#ec4899", "#06b6d4", "#ef4444"];

const formatEuro = (num: number) => {
    return new Intl.NumberFormat("nl-NL", {
        style: "currency",
        currency: "EUR",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(num);
};

export default function DashboardAnalyticsPage() {
    const [chartData, setChartData] = useState<AggregatedChartData[]>([]);
    const [assetTableRows, setAssetTableRows] = useState<AssetTableRow[]>([]);
    const [assetTypes, setAssetTypes] = useState<string[]>([]);
    const [totalPortfolioValue, setTotalPortfolioValue] = useState(0);
    const [loading, setLoading] = useState(true);

    const loadDashboard = useCallback(async () => {
        try {
            setLoading(true);

            const { data: assets, error: assetErr } = await supabase
                .from("portfolio_assets")
                .select("id, name, asset_types(name)");

            if (assetErr || !assets) throw assetErr;

            const { data: valuations, error: valErr } = await supabase
                .from("asset_valuations")
                .select("asset_id, balance_amount, valuation_date")
                .order("valuation_date", { ascending: false });

            if (valErr || !valuations) throw valErr;

            const latestBalancesByAsset: Record<string, number> = {};
            valuations.forEach((row) => {
                if (!(row.asset_id in latestBalancesByAsset)) {
                    latestBalancesByAsset[row.asset_id] = Number(row.balance_amount);
                }
            });

            const typeSummationMap: Record<string, number> = {};
            const tableRows: AssetTableRow[] = [];
            const uniqueTypes = new Set<string>();
            let runningTotalSum = 0;

            assets.forEach((asset: PortfolioAssetWithTypeName) => {
                const balance = latestBalancesByAsset[asset.id] || 0;
                const typeName = asset.asset_types?.name || "Unclassified Assets";

                if (balance > 0) {
                    typeSummationMap[typeName] = (typeSummationMap[typeName] || 0) + balance;
                    runningTotalSum += balance;
                    uniqueTypes.add(typeName);

                    tableRows.push({
                        assetId: asset.id,
                        assetName: asset.name,
                        assetType: typeName,
                        balance
                    });
                }
            });

            const compiledData: AggregatedChartData[] = Object.entries(typeSummationMap).map(
                ([name, value]) => ({ name, value })
            );

            // Sort asset types by total value (descending)
            const sortedTypes = Array.from(uniqueTypes).sort((a, b) =>
                (typeSummationMap[b] || 0) - (typeSummationMap[a] || 0)
            );

            // Sort table rows by asset type (using sorted types order), then by asset name
            tableRows.sort((a, b) => {
                const typeIndexA = sortedTypes.indexOf(a.assetType);
                const typeIndexB = sortedTypes.indexOf(b.assetType);

                if (typeIndexA !== typeIndexB) {
                    return typeIndexA - typeIndexB;
                }
                return a.assetName.localeCompare(b.assetName);
            });

            setChartData(compiledData);
            setAssetTableRows(tableRows);
            setAssetTypes(sortedTypes);
            setTotalPortfolioValue(runningTotalSum);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Unknown error";
            console.error("Aggregation analytics error:", message);
        } finally {
            setLoading(false);
        }
    }, []);

    usePortfolioDataRefresh(loadDashboard);

    if (loading) {
        return (
            <div className="h-64 flex items-center justify-center text-sm text-muted-foreground animate-pulse">
                Compiling snapshot ledgers and parsing metric distribution matrices...
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Portfolio Analytics</h1>
                <p className="text-sm text-muted-foreground">
                    Real-time dynamic allocation metrics built from the latest valuation updates.
                </p>
            </div>

            {/* TOP METRIC HIGHLIGHT STRIP */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                        <CardTitle className="text-xs font-medium text-muted-foreground">Total Portfolio Net Worth</CardTitle>
                        <Wallet className="h-4 w-4 text-primary" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold tracking-tight text-foreground">
                            {formatEuro(totalPortfolioValue)}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Sum of all latest recorded points</p>
                    </CardContent>
                </Card>

                <Card className="shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                        <CardTitle className="text-xs font-medium text-muted-foreground">Active Asset Classes</CardTitle>
                        <Landmark className="h-4 w-4 text-emerald-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold tracking-tight text-foreground">{chartData.length}</div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Custom categories represented in capital</p>
                    </CardContent>
                </Card>

                <Card className="shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                        <CardTitle className="text-xs font-medium text-muted-foreground">Primary Sector Weight</CardTitle>
                        <TrendingUp className="h-4 w-4 text-amber-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold tracking-tight text-foreground">
                            {chartData.length > 0
                                ? `${Math.round((Math.max(...chartData.map((d) => d.value)) / (totalPortfolioValue || 1)) * 100)}%`
                                : "0%"}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Concentration risk in single largest type</p>
                    </CardContent>
                </Card>
            </div>

            {/* VISUALIZATION SPLIT CARD PLATFORM */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                {/* INTERACTIVE GRAPH INTERFACE */}
                <Card className="lg:col-span-2 shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-base">Asset Type Allocation</CardTitle>
                        <CardDescription>Visual breakdown of portfolio exposure weights.</CardDescription>
                    </CardHeader>
                    <CardContent className="flex justify-center items-center p-3">
                        {chartData.length === 0 ? (
                            <div className="h-64 flex flex-col justify-center items-center border border-dashed rounded-xl w-full text-muted-foreground text-xs italic">
                                Add valuation checkpoints inside the transactional ledger to generate data visualization layers.
                            </div>
                        ) : (
                            <div className="w-full h-96">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={chartData}
                                            dataKey="value"
                                            nameKey="name"
                                            cx="50%"
                                            cy="50%"
                                            outerRadius={130}
                                            paddingAngle={2}
                                        >
                                            {chartData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            content={({ active, payload }) => {
                                                if (!active || !payload || payload.length === 0) return null;
                                                const d = payload[0];
                                                const value = d.value as number;
                                                const percentage = ((value / totalPortfolioValue) * 100).toFixed(1);
                                                return (
                                                    <div className="bg-card border rounded-lg p-3 text-xs shadow-md space-y-1">
                                                        <p className="font-semibold text-foreground">{d.name}</p>
                                                        <p className="text-muted-foreground">
                                                            {percentage}% &middot; {formatEuro(value)}
                                                        </p>
                                                    </div>
                                                );
                                            }}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* LEDGER DATA ROW LEDGER METRICS */}
                <div className="lg:col-span-1 space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">Allocation Ledger Summary</h3>
                    <div className="border bg-card rounded-xl overflow-hidden shadow-sm text-xs divide-y">
                        {chartData.length === 0 ? (
                            <p className="p-4 text-center text-muted-foreground italic">No metrics generated.</p>
                        ) : (
                            chartData
                                .sort((a, b) => b.value - a.value)
                                .map((row, idx) => {
                                    const sharePercentage = ((row.value / totalPortfolioValue) * 100).toFixed(1);
                                    return (
                                        <div key={row.name} className="p-3 flex justify-between items-center bg-card hover:bg-muted/10 transition">
                                            <div className="flex items-center gap-2">
                                                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }} />
                                                <span className="font-semibold text-foreground">{row.name}</span>
                                            </div>
                                            <div className="text-right">
                                                <div className="font-bold text-foreground font-mono">{formatEuro(row.value)}</div>
                                                <div className="text-[10px] text-muted-foreground font-mono">{sharePercentage}%</div>
                                            </div>
                                        </div>
                                    );
                                })
                        )}
                    </div>
                </div>
            </div>

            {/* ASSET VALUATION TABLE BY TYPE */}
            {assetTableRows.length > 0 && (
                <Card className="shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-base">Asset Valuations by Type</CardTitle>
                        <CardDescription>Latest valuation breakdown with assets as rows and types as columns.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto overflow-y-auto max-h-[600px]">
                            <table className="w-full text-sm">
                                <thead className="sticky top-0 bg-card z-10">
                                    <tr className="border-b">
                                        <th className="text-left py-3 px-4 font-semibold text-muted-foreground">Asset Name</th>
                                        {assetTypes.map((typeName, idx) => (
                                            <th key={typeName} className="text-right py-3 px-4 font-semibold text-muted-foreground">
                                                <div className="flex items-center justify-end gap-2">
                                                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }} />
                                                    {typeName}
                                                </div>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {assetTableRows.map((row, index) => (
                                        <tr key={row.assetId} className={`border-b hover:bg-muted/30 transition ${index % 2 === 0 ? 'bg-muted/20' : ''}`}>
                                            <td className="py-2 px-4 text-foreground font-medium">
                                                {row.assetName}
                                            </td>
                                            {assetTypes.map((typeName) => (
                                                <td key={typeName} className="py-2 px-4 text-right font-mono text-foreground">
                                                    {row.assetType === typeName ? formatEuro(row.balance) : ''}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                    <tr className="border-t-2 bg-muted/20 font-bold">
                                        <td className="py-3 px-4 text-foreground">Total</td>
                                        {assetTypes.map((typeName) => {
                                            const total = assetTableRows
                                                .filter(row => row.assetType === typeName)
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
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
