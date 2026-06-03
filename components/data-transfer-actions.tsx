"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Upload, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { refreshPortfolioViews } from "@/lib/portfolio-refresh";
import {
    exportPortfolioData,
    importAssetsFromTsv,
    importValuationsFromTsv,
    importStockTransactionsFromTsv,
} from "@/lib/portfolio-import-export";

// ---------------------------------------------------------------------------
// Import kinds
//
// "asset_types" removed — categories are created automatically from the
// type_name column inside the assets file.
// "stock_transactions" added — covers asset_transactions (BUY / SELL / etc.).
// "valuations" replaces "transactions" — covers asset_valuations (balance
//   snapshots used for bank accounts, real estate, etc.).
// ---------------------------------------------------------------------------

type ImportKind = "assets" | "valuations" | "stock_transactions";

const importOptions: { kind: ImportKind; label: string; description: string }[] = [
    {
        kind: "assets",
        label: "Assets",
        description:
            "type_name, type_slug, name, institution, login_url, comments, iban, ticker, isin" +
            " [bond extras: nominal_value, coupon_rate, coupon_frequency, maturity_date, first_coupon_date, day_count_basis]",
    },
    {
        kind: "valuations",
        label: "Valuations",
        description: "asset_name, valuation_date, balance_amount",
    },
    {
        kind: "stock_transactions",
        label: "Stock transactions",
        description:
            "asset_name, transaction_type, transacted_at, quantity, price_per_unit, total_amount, fee, tax_amount, currency, exchange_rate" +
            " [bond extra: accrued_interest]",
    },
];

interface DataTransferActionsProps {
    hasData: boolean | null;
    onDataChanged: () => void;
}

export default function DataTransferActions({ hasData, onDataChanged }: DataTransferActionsProps) {
    const router = useRouter();
    const [importOpen, setImportOpen] = useState(false);
    const [busy, setBusy] = useState<"export" | ImportKind | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const pendingImportKind = useRef<ImportKind | null>(null);

    const handleExport = async () => {
        setBusy("export");
        const result = await exportPortfolioData();
        setBusy(null);
        if (!result.ok) {
            alert(result.message);
            return;
        }
        alert(
            "Exported 3 tab-separated files:\n" +
            "• portfolio-assets — all assets including bond parameters\n" +
            "• portfolio-valuations — manual balance snapshots\n" +
            "• portfolio-stock-transactions — buy / sell / coupon / dividend records"
        );
    };

    const startImport = (kind: ImportKind) => {
        pendingImportKind.current = kind;
        fileInputRef.current?.click();
    };

    const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        const kind = pendingImportKind.current;
        event.target.value = "";
        pendingImportKind.current = null;

        if (!file || !kind) return;

        setBusy(kind);
        const content = await file.text();

        const result =
            kind === "assets"
                ? await importAssetsFromTsv(content)
                : kind === "valuations"
                    ? await importValuationsFromTsv(content)
                    : await importStockTransactionsFromTsv(content);

        setBusy(null);

        if (!result.ok) {
            alert(result.message);
            return;
        }

        const label =
            kind === "assets" ? "asset"
                : kind === "valuations" ? "valuation"
                    : "stock transaction";

        refreshPortfolioViews();
        router.refresh();
        onDataChanged();

        if (result.skipped > 0) {
            alert(`Imported ${result.imported} ${label} record(s). Skipped ${result.skipped} duplicate or invalid row(s).`);
            return;
        }

        alert(`Imported ${result.imported} ${label} record(s).`);
    };

    return (
        <div className="mt-4 border-t pt-4 space-y-2">
            <input
                ref={fileInputRef}
                type="file"
                accept=".tsv,.txt,.tab"
                className="hidden"
                onChange={handleFileSelected}
            />

            <button
                type="button"
                onClick={handleExport}
                disabled={busy !== null || hasData === false}
                className={cn(
                    "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition",
                    "text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
                )}
            >
                <Download className="h-4 w-4 shrink-0" />
                <span>{busy === "export" ? "Exporting..." : "Export data"}</span>
            </button>

            <button
                type="button"
                onClick={() => setImportOpen((open) => !open)}
                disabled={busy !== null}
                className={cn(
                    "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition",
                    "text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
                )}
            >
                <Upload className="h-4 w-4 shrink-0" />
                <span className="flex-1 text-left">
                    {busy && busy !== "export" ? "Importing..." : "Import data"}
                </span>
                {importOpen
                    ? <ChevronUp className="h-4 w-4 shrink-0" />
                    : <ChevronDown className="h-4 w-4 shrink-0" />
                }
            </button>

            {importOpen && (
                <div className="space-y-1 pl-2">
                    {importOptions.map((option) => (
                        <button
                            key={option.kind}
                            type="button"
                            onClick={() => startImport(option.kind)}
                            disabled={busy !== null}
                            title={option.description}
                            className={cn(
                                "flex w-full flex-col items-start rounded-md px-3 py-2 text-left text-xs transition",
                                "text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
                            )}
                        >
                            <span className="font-medium text-foreground">{option.label}</span>
                            <span className="text-[10px] text-muted-foreground line-clamp-1">{option.description}</span>
                        </button>
                    ))}
                    <p className="px-3 pt-1 text-[10px] text-muted-foreground">
                        Tab-separated (.tsv) files. Import assets first — asset categories are created
                        automatically from the type_name column. Import valuations and stock transactions
                        after the assets they reference. Stock transactions are inserted in file order to
                        preserve FIFO lot sequencing; duplicate asset/timestamp pairs are skipped.
                    </p>
                </div>
            )}
        </div>
    );
}
