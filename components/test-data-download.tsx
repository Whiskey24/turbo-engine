"use client";

import { useState } from "react";
import { Download, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import {
    smallAssetsTsv, smallValuationsTsv, smallTransactionsTsv,
    largeAssetsTsv, largeValuationsTsv, largeTransactionsTsv,
    SMALL_VALIDATION, LARGE_VALIDATION,
} from "@/lib/test-data";

function downloadTsv(filename: string, content: string) {
    const blob = new Blob([content], { type: "text/tab-separated-values" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function DownloadButton({ label, description, onClick }: {
    label: string; description: string; onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "flex w-full items-start gap-3 rounded-md px-3 py-2 text-left text-sm transition",
                "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
        >
            <Download className="h-4 w-4 shrink-0 mt-0.5" />
            <span className="flex flex-col">
                <span className="font-medium text-foreground">{label}</span>
                <span className="text-[10px]">{description}</span>
            </span>
        </button>
    );
}

function ResultsBox({ children }: { children: React.ReactNode }) {
    return (
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-[10px] text-muted-foreground space-y-0.5">
            {children}
        </div>
    );
}

function ResultRow({ label, value, note }: { label: string; value: string; note?: string }) {
    return (
        <p>
            {label}: <span className="font-mono text-foreground">{value}</span>
            {note && <span className="ml-2 opacity-70">{note}</span>}
        </p>
    );
}

const fmt = (n: number) =>
    new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n);

export default function TestDataDownload() {
    const [largeOpen, setLargeOpen] = useState(false);

    return (
        <div className="mt-4 border-t pt-4 space-y-4">

            {/* ── Small sample set ────────────────────────────────────── */}
            <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground mb-1">
                    Sample files — 7 assets across 5 categories
                </p>
                <p className="text-[10px] text-muted-foreground mb-2">
                    Covers all asset classifications. Shows an Emergency Fund draining to zero
                    and a Family Home acquired mid-dataset. Import assets first (categories
                    created automatically), then valuations, then stock transactions.
                </p>
                <DownloadButton
                    label="Sample assets"
                    description="7 assets: savings ×2, equities ×2, crypto, bond, real estate"
                    onClick={() => downloadTsv("sample-assets.tsv", smallAssetsTsv())}
                />
                <DownloadButton
                    label="Sample valuations"
                    description="Savings (quarterly) · Emergency Fund drains to €0 · Family Home (annual)"
                    onClick={() => downloadTsv("sample-valuations.tsv", smallValuationsTsv())}
                />
                <DownloadButton
                    label="Sample stock transactions"
                    description="9 transactions: buys, sells, bond coupon"
                    onClick={() => downloadTsv("sample-stock-transactions.tsv", smallTransactionsTsv())}
                />
                <ResultsBox>
                    <p className="font-semibold text-foreground">Expected results after import</p>
                    <ResultRow
                        label="Realized P&L"
                        value={fmt(SMALL_VALIDATION.realizedPnl)}
                        note={`(${SMALL_VALIDATION.breakdown})`}
                    />
                    <ResultRow
                        label="Coupon income"
                        value={fmt(SMALL_VALIDATION.couponIncome)}
                        note="(2 semi-annual payments)"
                    />
                </ResultsBox>
            </div>

            {/* ── Large 10-year test set ───────────────────────────────── */}
            <div className="border-t pt-3 space-y-1">
                <button
                    type="button"
                    onClick={() => setLargeOpen((v) => !v)}
                    className="flex w-full items-center justify-between rounded-md px-1 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition"
                >
                    <span>10-year test dataset — 14 assets across 8 categories</span>
                    {largeOpen
                        ? <ChevronUp className="h-3.5 w-3.5 shrink-0" />
                        : <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                    }
                </button>

                {largeOpen && (
                    <div className="space-y-1 pt-1">
                        <p className="text-[10px] text-muted-foreground px-1 mb-2">
                            Covers all 8 categories over 10 years ending in the current year.
                            Notable behaviours: High-Yield Savings opens with explicit zeros before
                            its first deposit; Joint Account closes to zero and stays zero; Ethereum
                            is fully sold then reopened; Gold is fully sold then reopened. Transactions
                            are ordered chronologically as required for FIFO lot sequencing.
                        </p>
                        <DownloadButton
                            label="Large test — assets"
                            description="14 assets: savings ×2, current accounts ×2, equities ×4, bond, crypto ×2, real estate, pension, gold ETC"
                            onClick={() => downloadTsv("large-test-assets.tsv", largeAssetsTsv())}
                        />
                        <DownloadButton
                            label="Large test — valuations"
                            description="~194 rows: quarterly for 5 accounts + annual real estate, with zero and near-zero periods"
                            onClick={() => downloadTsv("large-test-valuations.tsv", largeValuationsTsv())}
                        />
                        <DownloadButton
                            label="Large test — stock transactions"
                            description="~57 transactions over 10 years: buys, sells, dividends, coupons"
                            onClick={() => downloadTsv("large-test-stock-transactions.tsv", largeTransactionsTsv())}
                        />
                        <ResultsBox>
                            <p className="font-semibold text-foreground">Key validation figures</p>
                            <ResultRow
                                label="Total realized P&L"
                                value={fmt(LARGE_VALIDATION.totalRealizedPnl)}
                                note="(12 closed positions across 6 assets)"
                            />
                            <ResultRow
                                label="Open position cost basis"
                                value={fmt(LARGE_VALIDATION.totalOpenBasis)}
                                note="(15 open tax lots)"
                            />
                            <ResultRow
                                label="Bond coupon income"
                                value={fmt(LARGE_VALIDATION.couponIncome)}
                                note="(6×€200 + 4×€100)"
                            />
                            <ResultRow
                                label="MSFT dividend income"
                                value={fmt(LARGE_VALIDATION.dividendIncome)}
                                note="(9 annual payments)"
                            />
                            <p className="pt-0.5 font-semibold text-foreground">
                                Year-end asset_valuations totals (savings + pension + real estate)
                            </p>
                            <div className="grid grid-cols-3 gap-x-4 pt-0.5">
                                {LARGE_VALIDATION.yearEndTotals.map(({ year, total }) => (
                                    <p key={year}>
                                        <span className="font-mono text-foreground/70">{year}:</span>
                                        {" "}<span className="font-mono text-foreground">{fmt(total)}</span>
                                    </p>
                                ))}
                            </div>
                        </ResultsBox>
                    </div>
                )}
            </div>
        </div>
    );
}
