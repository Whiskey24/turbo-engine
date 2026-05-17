"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Wallet, Landmark, TrendingUp } from "lucide-react";

import { supabase } from "@/lib/supabase";

interface AggregatedChartData {
    name: string;
    value: number;
}

// Explicitly tell TypeScript how Supabase represents this singular join row
interface CleanedAssetRow {
    id: string;
    name: string;
    asset_types: {
        name: string;
    } | null;
}

interface CleanedValuationRow {
    asset_id: string;
    balance_amount: number;
    valuation_date: string;
}

// Tailored dashboard chart palette matrix
const CHART_COLORS = ["#2563eb", "#10b981", "#f59e0b", "#7c3aed", "#ec4899", "#06b6d4", "#ef4444"];

const formatEuro = (num: number) => {
    return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(num);
};

export default function DashboardAnalyticsPage() {
    const [chartData, setChartData] = useState<AggregatedChartData[]>([]);
    const [totalPortfolioValue, setTotalPortfolioValue] = useState(0);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function calculateLatestDistribution() {
            try {
                setLoading(true);

                // 1. Fetch assets joined with their structural type name template
                const { data: assets, error: assetErr } = await supabase
                    .from("portfolio_assets")
                    .select("id, name, asset_types(name)");

                if (assetErr || !assets) throw assetErr;

                // Cast the untyped Supabase array to our precise local interface matrix
                const typedAssets = assets as unknown as CleanedAssetRow[];

                // 2. Fetch entire history log ordered from newest to oldest
                const { data: valuations, error: valErr } = await supabase
                    .from("asset_valuations")
                    .select("asset_id, balance_amount, valuation_date")
                    .order("valuation_date", { ascending: false }) as { data: CleanedValuationRow[] | null; error: any }; // <-- Cast the type right here!

                if (valErr || !valuations) throw valErr;

                // 3. Keep ONLY the single latest balance for each asset ID
                const latestBalancesByAsset: Record<string, number> = {};
                valuations.forEach((row) => {
                    if (!(row.asset_id in latestBalancesByAsset)) {
                        latestBalancesByAsset[row.asset_id] = Number(row.balance_amount);
                    }
                });

                // 4. Group those latest valuations by Asset Type Name
                const typeSummationMap: Record<string, number> = {};
                let runningTotalSum = 0;

                typedAssets.forEach((asset) => {
                    const balance = latestBalancesByAsset[asset.id] || 0;

                    // TypeScript is completely happy now because it knows asset_types is an object or null!
                    const typeName = asset.asset_types?.name || "Unclassified Assets";

                    if (balance > 0) {
                        typeSummationMap[typeName] = (typeSummationMap[typeName] || 0) + balance;
                        runningTotalSum += balance;
                    }
                });

                // 5. Transform map object into standard Recharts format layout array
                const compiledData: AggregatedChartData[] = Object.entries(typeSummationMap).map(
                    ([name, value]) => ({ name, value })
                );

                setChartData(compiledData);
                setTotalPortfolioValue(runningTotalSum);
            } catch (err: any) {
                console.error("Aggregation analytics error:", err.message);
            } finally {
                setLoading(false);
            }
        }

        calculateLatestDistribution();
    }, []);

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
                    <CardContent className="pt-4 flex justify-center items-center">
                        {chartData.length === 0 ? (
                            <div className="h-64 flex flex-col justify-center items-center border border-dashed rounded-xl w-full text-muted-foreground text-xs italic">
                                Add valuation checkpoints inside the transactional ledger to generate data visualization layers.
                            </div>
                        ) : (
                            <div className="w-full h-72">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={chartData}
                                            dataKey="value"
                                            nameKey="name"
                                            cx="50%"
                                            cy="40%"
                                            innerRadius={65}
                                            outerRadius={95}
                                            paddingAngle={3}
                                        >
                                            {chartData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            formatter={(value: number) => [formatEuro(value), "Total Value"]}
                                            contentStyle={{ background: "hsl(var(--card))", borderRadius: "8px", border: "1px solid hsl(var(--border))", fontSize: "11px" }}
                                        />
                                        <Legend verticalAlign="bottom" height={40} iconType="circle" wrapperStyle={{ fontSize: "11px", paddingTop: "10px" }} />
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
        </div>
    );
}