"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    LabelList,
    Legend,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { getUserSettings } from "@/lib/database";
import { buildYearEndAllocationByType, type YearEndChartRow } from "@/lib/year-end-allocation";
import { usePortfolioDataRefresh } from "@/lib/portfolio-refresh";
import { CHART_COLORS } from "@/lib/chart-colors";

const formatEuro = (value: number, locale: string) =>
    new Intl.NumberFormat(locale, {
        style: "currency",
        currency: "EUR",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(value);

const formatCompact = (value: number, locale: string) =>
    new Intl.NumberFormat(locale, {
        notation: "compact",
        compactDisplay: "short",
    }).format(value);

type ChartVariant = "bar" | "area";

export default function YearEndAllocationChart() {
    const [chartData, setChartData] = useState<YearEndChartRow[]>([]);
    const [typeNames, setTypeNames] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [locale, setLocale] = useState<string>("en-GB");
    const [chartVariant, setChartVariant] = useState<ChartVariant>("bar");

    // Dimensions state to store calculated container size
    const containerRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);

    const loadChart = useCallback(async () => {
        try {
            setLoading(true);

            const [{ data: assets, error: assetError }, { data: valuations, error: valuationError }] =
                await Promise.all([
                    supabase.from("portfolio_assets").select("id, asset_categories(name)"),
                    supabase
                        .from("asset_valuations")
                        .select("asset_id, valuation_date, balance_amount")
                        .order("valuation_date", { ascending: true }),
                ]);

            if (assetError) throw assetError;
            if (valuationError) throw valuationError;

            const assetsWithType = (assets ?? []).map((asset) => ({
                id: asset.id,
                typeName: asset.asset_categories?.name ?? "Unclassified Assets",
            }));

            const result = buildYearEndAllocationByType(assetsWithType, valuations ?? []);

            const today = new Date();
            const currentYear = today.getFullYear();
            const isDec31 = today.getMonth() === 11 && today.getDate() === 31;
            const hasCurrentYearEndData = (valuations ?? []).some((v) =>
                v.valuation_date.startsWith(`${currentYear}-12-31`)
            );

            const chartDataWithTotals = result.chartData
                .filter((row) => {
                    const rowLabel = String(row.label);
                    const rowYear = Number.parseInt(rowLabel.slice(-4), 10);

                    if (rowYear === currentYear) {
                        return isDec31 && hasCurrentYearEndData;
                    }
                    return true;
                })
                .map((row) => {
                    const total = result.typeNames.reduce((sum, typeName) => {
                        const val = row[typeName];
                        return sum + (typeof val === "number" ? val : 0);
                    }, 0);
                    return { ...row, total };
                });

            setChartData(chartDataWithTotals);
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

    useEffect(() => {
        getUserSettings().then((prefs) => { if (prefs.locale) setLocale(prefs.locale); });
    }, []);

    // Explicitly track container width and height when it paints on screen
    useEffect(() => {
        if (!containerRef.current) return;

        const observer = new ResizeObserver((entries) => {
            if (!entries || entries.length === 0) return;
            const { width, height } = entries[0].contentRect;
            if (width > 0 && height > 0) {
                setDimensions({ width, height });
            }
        });

        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, [loading]); // Re-observe right after loading finishes

    return (
        <Card className="shadow-sm">
            <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <CardTitle className="text-base">Year-end allocation by asset category</CardTitle>
                    <CardDescription>
                        Total portfolio value per asset category on 31 December each year, using the latest
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
                    /* The container ref records layout changes */
                    <div ref={containerRef} className="h-80 w-full">
                        {dimensions && (
                            chartVariant === "bar" ? (
                                <BarChart
                                    width={dimensions.width}
                                    height={dimensions.height}
                                    data={chartData}
                                    margin={{ top: 20, right: 8, left: 0, bottom: 0 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} vertical={false} />
                                    <XAxis
                                        dataKey="label"
                                        tickLine={false}
                                        axisLine={false}
                                        className="text-xs"
                                        style={{ fontSize: 10 }}
                                        tickFormatter={(label) => String(label).slice(-4)}
                                    />
                                    <YAxis
                                        tickFormatter={(value) => formatCompact(Number(value), locale)}
                                        tickLine={false}
                                        axisLine={false}
                                        className="text-xs"
                                        style={{ fontSize: 10 }}
                                    />
                                    <Tooltip
                                        content={({ active, payload, label }) => {
                                            if (!active || !payload || payload.length === 0) return null;
                                            return (
                                                <div className="bg-card border rounded-lg p-3 text-xs shadow-md space-y-1">
                                                    <p className="font-semibold text-foreground">{String(label).slice(-4)}</p>
                                                    {payload.map((entry) => (
                                                        <p key={entry.name} className="text-muted-foreground">
                                                            {entry.name}: {formatEuro(entry.value as number, locale)}
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
                                            isAnimationActive={false}
                                        >
                                            {index === typeNames.length - 1 && (
                                                <LabelList
                                                    dataKey="total"
                                                    position="top"
                                                    content={({ x, y, width, value }) => {
                                                        if (!value) return null;
                                                        return (
                                                            <text
                                                                x={(x as number) + (width as number) / 2}
                                                                y={(y as number) - 6}
                                                                textAnchor="middle"
                                                                className="text-xs fill-muted-foreground"
                                                                style={{ fontSize: 11 }}
                                                            >
                                                                {formatEuro(value as number, locale)}
                                                            </text>
                                                        );
                                                    }}
                                                />
                                            )}
                                        </Bar>
                                    ))}
                                </BarChart>
                            ) : (
                                <AreaChart
                                    width={dimensions.width}
                                    height={dimensions.height}
                                    data={chartData}
                                    margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} vertical={false} />
                                    <XAxis
                                        dataKey="label"
                                        tickLine={false}
                                        axisLine={false}
                                        className="text-xs"
                                        style={{ fontSize: 10 }}
                                        tickFormatter={(label) => String(label).slice(-4)}
                                    />
                                    <YAxis
                                        tickFormatter={(value) => formatCompact(Number(value), locale)}
                                        tickLine={false}
                                        axisLine={false}
                                        className="text-xs"
                                        style={{ fontSize: 10 }}
                                    />
                                    <Tooltip
                                        content={({ active, payload, label }) => {
                                            if (!active || !payload || payload.length === 0) return null;
                                            return (
                                                <div className="bg-card border rounded-lg p-3 text-xs shadow-md space-y-1">
                                                    <p className="font-semibold text-foreground">{String(label).slice(-4)}</p>
                                                    {payload.map((entry) => (
                                                        <p key={entry.name} className="text-muted-foreground">
                                                            {entry.name}: {formatEuro(entry.value as number, locale)}
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
                            )
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}