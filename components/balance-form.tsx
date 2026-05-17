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
    const [logDate, setLogDate] = useState(new Date().toISOString().split("T")[0]);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        const { error } = await supabase.from("savings_logs").insert([
            { account_name: accountName, balance: parseFloat(balance), log_date: logDate }
        ]);

        setLoading(false);
        if (!error) {
            setAccountName("");
            setBalance("");
            onDataInserted();
        } else {
            alert(error.message);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="p-4 bg-card border rounded-xl space-y-4 shadow-sm max-w-md w-full">
            <h3 className="text-lg font-semibold">Log Savings Balance</h3>
            <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Account Name</label>
                <input type="text" value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="e.g., Chase High-Yield" className="border rounded-md p-2 bg-background" required />
            </div>
            <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Balance ($)</label>
                <input type="number" step="0.01" value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="0.00" className="border rounded-md p-2 bg-background" required />
            </div>
            <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Log Date</label>
                <input type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} className="border rounded-md p-2 bg-background" required />
            </div>
            <button type="submit" disabled={loading} className="w-full bg-primary text-primary-foreground font-medium py-2 rounded-md transition hover:opacity-90 disabled:opacity-50">
                {loading ? "Saving..." : "Log Balance"}
            </button>
        </form>
    );
}