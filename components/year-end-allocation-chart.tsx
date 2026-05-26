"use client";

import { useCallback, useState } from "react";
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    Legend,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { buildYearEndAllocationByType, type YearEndChartRow } from "@/lib/year-end-allocation";
import { usePortfolioDataRefresh } from "@/lib/portfolio-refresh";
import { CHART_COLORS } from "@/lib/chart-colors";

const formatEuro = (value: number) =>
    new Intl.NumberFormat("nl-NL", {
        style: "currency",
        currency: "EUR",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(value);

type ChartVariant = "bar" | "area";

export default function YearEndAllocationChart() {
    const [chartData, setChartData] = useState<YearEndChartRow[]>([]);
    const [typeNames, setTypeNames] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [chartVariant, setChartVariant] = useState<ChartVariant>("bar");

    const loadChart = useCallback(async () => {
        try {
            setLoading(true);

            const [{ data: assets, error: assetError }, { data: valuations, error: valuationError }] =
                await Promise.all([
                    supabase.from("portfolio_assets").select("id, asset_types(name)"),
                    supabase
                        .from("asset_valuations")
                        .select("asset_id, valuation_date, balance_amount")
                        .order("valuation_date", { ascending: true }),
                ]);

            if (assetError) throw assetError;
            if (valuationError) throw valuationError;

            const assetsWithType = (assets ?? []).map((asset) => ({
                id: asset.id,
                typeName: asset.asset_types?.name ?? "Unclassified Assets",
            }));

            const result = buildYearEndAllocationByType(assetsWithType, valuations ?? []);
            setChartData(result.chartData);
            setTypeNames(result.typeNames);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Unknown error";
            console.error("Year-end allocation chart error:", message);
            setChartData([]);
            setTypeNames([]);
        } finally {
            setLoading(false);
        }
    }, []);

    usePortfolioDataRefresh(loadChart);

    return (
        <Card className="shadow-sm">
            <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <CardTitle className="text-base">Year-end allocation by asset type</CardTitle>
                    <CardDescription>
                        Total portfolio value per asset type on 31 December each year, using the latest
                        valuation on or before that date for every asset.
                    </CardDescription>
                </div>
                <div className="flex rounded-lg border p-0.5 text-xs shrink-0">
                    <button
                        type="button"
                        onClick={() => setChartVariant("bar")}
                        className={cn(
                            "rounded-md px-3 py-1.5 font-medium transition",
                            chartVariant === "bar"
                                ? "bg-primary text-primary-foreground"
                                : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        Stacked bar
                    </button>
                    <button
                        type="button"
                        onClick={() => setChartVariant("area")}
                        className={cn(
                            "rounded-md px-3 py-1.5 font-medium transition",
                            chartVariant === "area"
                                ? "bg-primary text-primary-foreground"
                                : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        Area
                    </button>
                </div>
            </CardHeader>
            <CardContent className="pt-2">
                {loading ? (
                    <div className="h-80 flex items-center justify-center text-sm text-muted-foreground animate-pulse">
                        Building year-end allocation timeline...
                    </div>
                ) : chartData.length === 0 || typeNames.length === 0 ? (
                    <div className="h-80 flex items-center justify-center border border-dashed rounded-xl text-muted-foreground text-sm italic">
                        Add valuation checkpoints in the transactional ledger to populate this chart.
                    </div>
                ) : (
                    <div className="h-80 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            {chartVariant === "bar" ? (
                                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} vertical={false} />
                                    <XAxis dataKey="label" tickLine={false} axisLine={false} className="text-xs" />
                                    <YAxis
                                        tickFormatter={(value) =>
                                            new Intl.NumberFormat("nl-NL", {
                                                notation: "compact",
                                                compactDisplay: "short",
                                            }).format(Number(value))
                                        }
                                        tickLine={false}
                                        axisLine={false}
                                        className="text-xs"
                                    />
                                    <Tooltip
                                        content={({ active, payload, label }) => {
                                            if (!active || !payload || payload.length === 0) return null;
                                            return (
                                                <div className="bg-card border rounded-lg p-3 text-xs shadow-md space-y-1">
                                                    <p className="font-semibold text-foreground">{label}</p>
                                                    {payload.map((entry) => (
                                                        <p key={entry.name} className="text-muted-foreground">
                                                            {entry.name}: {formatEuro(entry.value as number)}
                                                        </p>
                                                    ))}
                                                </div>
                                            );
                                        }}
                                    />
                                    <Legend iconType="circle" wrapperStyle={{ fontSize: "11px" }} />
                                    {typeNames.map((typeName, index) => (
                                        <Bar
                                            key={typeName}
                                            dataKey={typeName}
                                            stackId="yearEnd"
                                            fill={CHART_COLORS[index % CHART_COLORS.length]}
                                            radius={index === typeNames.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                                        />
                                    ))}
                                </BarChart>
                            ) : (
                                <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} vertical={false} />
                                    <XAxis dataKey="label" tickLine={false} axisLine={false} className="text-xs" />
                                    <YAxis
                                        tickFormatter={(value) =>
                                            new Intl.NumberFormat("nl-NL", {
                                                notation: "compact",
                                                compactDisplay: "short",
                                            }).format(Number(value))
                                        }
                                        tickLine={false}
                                        axisLine={false}
                                        className="text-xs"
                                    />
                                    <Tooltip
                                        content={({ active, payload, label }) => {
                                            if (!active || !payload || payload.length === 0) return null;
                                            return (
                                                <div className="bg-card border rounded-lg p-3 text-xs shadow-md space-y-1">
                                                    <p className="font-semibold text-foreground">{label}</p>
                                                    {payload.map((entry) => (
                                                        <p key={entry.name} className="text-muted-foreground">
                                                            {entry.name}: {formatEuro(entry.value as number)}
                                                        </p>
                                                    ))}
                                                </div>
                                            );
                                        }}
                                    />
                                    <Legend iconType="circle" wrapperStyle={{ fontSize: "11px" }} />
                                    {typeNames.map((typeName, index) => (
                                        <Area
                                            key={typeName}
                                            type="monotone"
                                            dataKey={typeName}
                                            stackId="yearEnd"
                                            fill={CHART_COLORS[index % CHART_COLORS.length]}
                                            stroke={CHART_COLORS[index % CHART_COLORS.length]}
                                            fillOpacity={0.7}
                                        />
                                    ))}
                                </AreaChart>
                            )}
                        </ResponsiveContainer>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
