"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { deleteAllPortfolioData } from "@/lib/delete-portfolio-data";
import { refreshPortfolioViews } from "@/lib/portfolio-refresh";

const CONFIRM_PHRASE = "DELETE IT ALL";

export default function DeleteAllDataAction() {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [confirmText, setConfirmText] = useState("");
    const [deleting, setDeleting] = useState(false);

    const canConfirm = confirmText === CONFIRM_PHRASE && !deleting;

    const closeDialog = () => {
        if (deleting) return;
        setOpen(false);
        setConfirmText("");
    };

    const handleDelete = async () => {
        if (!canConfirm) return;

        setDeleting(true);
        const result = await deleteAllPortfolioData();
        setDeleting(false);

        if (!result.ok) {
            alert(result.message);
            return;
        }

        closeDialog();
        refreshPortfolioViews();
        router.refresh();
        alert("All portfolio data has been permanently deleted.");
    };

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className={cn(
                    "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition",
                    "text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                )}
            >
                <Trash2 className="h-4 w-4 shrink-0" />
                <span>Delete all data</span>
            </button>

            {open && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="delete-all-data-title"
                >
                    <div className="w-full max-w-md rounded-xl border bg-card p-5 shadow-lg">
                        <div className="mb-4 flex items-start justify-between gap-3">
                            <div>
                                <h3
                                    id="delete-all-data-title"
                                    className="text-base font-semibold text-destructive"
                                >
                                    Delete all portfolio data
                                </h3>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    This permanently removes all asset types, assets, and transactions for your
                                    account. This cannot be undone.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={closeDialog}
                                disabled={deleting}
                                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                                aria-label="Close"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        <label className="flex flex-col gap-1.5 text-sm">
                            <span className="font-medium text-foreground">
                                Type <span className="font-mono text-destructive">{CONFIRM_PHRASE}</span> to confirm
                            </span>
                            <input
                                type="text"
                                value={confirmText}
                                onChange={(event) => setConfirmText(event.target.value)}
                                placeholder={CONFIRM_PHRASE}
                                disabled={deleting}
                                autoComplete="off"
                                className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-destructive/40 disabled:opacity-50"
                            />
                        </label>

                        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                            <button
                                type="button"
                                onClick={closeDialog}
                                disabled={deleting}
                                className="rounded-md border px-3 py-2 text-sm font-medium transition hover:bg-muted disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleDelete}
                                disabled={!canConfirm}
                                className="rounded-md bg-destructive px-3 py-2 text-sm font-medium text-white transition hover:bg-destructive/90 disabled:opacity-50"
                            >
                                {deleting ? "Deleting..." : "Delete everything"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
