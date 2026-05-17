"use client";
import { useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function BalanceForm({ onDataInserted }: { onDataInserted: () => void }) {
    const [accountName, setAccountName] = useState("");
    const [balance, setBalance] = useState("");
    // Default to today's date in local European formatting timezone
    const [logDate, setLogDate] = useState(new Date().toLocaleDateString('sv-SE')); // sv-SE outputs YYYY-MM-DD which HTML inputs require natively
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        const { error } = await supabase.from("savings_logs").insert([
            {
                account_name: accountName,
                balance: parseFloat(balance),
                log_date: logDate
            }
        ]);

        setLoading(false);
        if (!error) {
            setAccountName("");
            setBalance("");
            onDataInserted();
        } else {
            alert(`Error logging data: ${error.message}`);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="p-5 bg-card border rounded-xl space-y-4 shadow-sm w-full">
            <div>
                <h3 className="text-lg font-semibold tracking-tight">Log Savings Balance</h3>
                <p className="text-xs text-muted-foreground">Add historical or current account metrics.</p>
            </div>

            <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">Account Name</label>
                <input
                    type="text"
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    placeholder="e.g., ABN AMRO Savings"
                    className="border rounded-md p-2 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    required
                />
            </div>

            <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">Balance (€)</label>
                <div className="relative flex items-center">
                    <span className="absolute left-3 text-muted-foreground text-sm">€</span>
                    <input
                        type="number"
                        step="0.01"
                        value={balance}
                        onChange={(e) => setBalance(e.target.value)}
                        placeholder="0,00"
                        className="border rounded-md p-2 pl-7 bg-background text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary"
                        required
                    />
                </div>
            </div>

            <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">Log Date</label>
                <input
                    type="date"
                    value={logDate}
                    onChange={(e) => setLogDate(e.target.value)}
                    className="border rounded-md p-2 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    required
                />
            </div>

            <button
                type="submit"
                disabled={loading}
                className="w-full bg-primary text-primary-foreground font-medium py-2 rounded-md transition hover:opacity-90 disabled:opacity-50 text-sm"
            >
                {loading ? "Processing..." : "Log Balance"}
            </button>
        </form>
    );
}