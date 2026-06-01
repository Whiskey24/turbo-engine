"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Upload, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { refreshPortfolioViews } from "@/lib/portfolio-refresh";
import {
    exportPortfolioData,
    importAssetTypesFromTsv,
    importAssetsFromTsv,
    importTransactionsFromTsv,
} from "@/lib/portfolio-import-export";

type ImportKind = "asset_types" | "assets" | "transactions";

// ---------------------------------------------------------------------------
// Import option descriptors
//
// asset_types: type_slug removed — it is no longer stored on the type
// assets:      type_slug added  — each asset now carries its own classification
// ---------------------------------------------------------------------------
const importOptions: { kind: ImportKind; label: string; description: string }[] = [
    {
        kind: "asset_types",
        label: "Asset types",
        description: "name",
    },
    {
        kind: "assets",
        label: "Assets",
        description: "type_name, type_slug, name, institution, login_url, comments, iban, ticker, isin",
    },
    {
        kind: "transactions",
        label: "Transactions",
        description: "asset_name, valuation_date, balance_amount (institution column ignored if present)",
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
        alert("Exported 3 tab-separated files: asset types, assets, and transactions.");
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
            kind === "asset_types"
                ? await importAssetTypesFromTsv(content)
                : kind === "assets"
                    ? await importAssetsFromTsv(content)
                    : await importTransactionsFromTsv(content);

        setBusy(null);

        if (!result.ok) {
            alert(result.message);
            return;
        }

        const label =
            kind === "asset_types" ? "asset type" : kind === "assets" ? "asset" : "transaction";

        refreshPortfolioViews();
        router.refresh();

        // Re-check whether we now have data so the export button enables
        onDataChanged();

        if (result.skipped > 0) {
            alert(
                `Imported ${result.imported} ${label} record(s). Skipped ${result.skipped} duplicate or invalid row(s).`
            );
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
                <span className="flex-1 text-left">{busy && busy !== "export" ? "Importing..." : "Import data"}</span>
                {importOpen ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
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
                        Tab-separated (.tsv) files. Import asset types before assets, then transactions.
                        Duplicate names and asset/date pairs are skipped. Transaction imports match assets by name only.
                    </p>
                </div>
            )}
        </div>
    );
}
