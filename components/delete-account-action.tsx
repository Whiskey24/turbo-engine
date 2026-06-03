"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserX, X, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { deleteAccount } from "@/lib/delete-account";

export default function DeleteAccountAction() {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");

    const canConfirm = password.length > 0 && !deleting;

    const closeDialog = () => {
        if (deleting) return;
        setOpen(false);
        setPassword("");
        setErrorMsg("");
        setShowPassword(false);
    };

    const handleDelete = async () => {
        if (!canConfirm) return;
        setDeleting(true);
        setErrorMsg("");

        const result = await deleteAccount(password);
        setDeleting(false);

        if (!result.ok) {
            setErrorMsg(result.message);
            return;
        }

        // Account is gone — redirect to the sign-in page
        router.replace("/login");
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
                <UserX className="h-4 w-4 shrink-0" />
                <span>Delete my account</span>
            </button>

            {open && (
                <div
                    className="fixed inset-0 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
                    style={{ zIndex: 9999 }}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="delete-account-title"
                >
                    <div
                        className="relative w-full max-w-md rounded-xl border bg-card p-5 shadow-lg"
                        style={{ zIndex: 10000 }}
                    >
                        <div className="mb-4 flex items-start justify-between gap-3">
                            <div>
                                <h3
                                    id="delete-account-title"
                                    className="text-base font-semibold text-destructive"
                                >
                                    Delete my account
                                </h3>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    This permanently deletes all your portfolio data — categories, assets,
                                    valuations, stock transactions, tax lots, and price records — and then
                                    removes your account entirely. You will be signed out immediately and
                                    cannot sign in again. This cannot be undone.
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
                                Enter your password to confirm
                            </span>
                            <div className="relative">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(e) => { setPassword(e.target.value); setErrorMsg(""); }}
                                    placeholder="Your current password"
                                    disabled={deleting}
                                    autoComplete="current-password"
                                    className={cn(
                                        "w-full rounded-md border bg-background px-3 py-2 pr-10 text-sm",
                                        "focus:outline-none focus:ring-2 focus:ring-destructive/40 disabled:opacity-50",
                                        errorMsg && "border-destructive"
                                    )}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword((v) => !v)}
                                    tabIndex={-1}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                    aria-label={showPassword ? "Hide password" : "Show password"}
                                >
                                    {showPassword
                                        ? <EyeOff className="h-4 w-4" />
                                        : <Eye className="h-4 w-4" />
                                    }
                                </button>
                            </div>
                            {errorMsg && (
                                <p className="text-xs text-destructive">{errorMsg}</p>
                            )}
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
                                {deleting ? "Deleting account..." : "Delete my account"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
