"use client";
import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import BalanceForm from "@/components/balance-form";
import DashboardCharts from "@/components/dashboard-charts";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function Home() {
  const [data, setData] = useState<any[]>([]);

  const fetchLogs = async () => {
    const { data: logs } = await supabase
      .from("savings_logs")
      .select("account_name, balance, log_date")
      .order("log_date", { ascending: true });

    if (logs) setData(logs);
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  return (
    <main className="min-h-screen bg-background p-4 md:p-8 space-y-8 flex flex-col items-center">
      <div className="max-w-6xl w-full text-left">
        <h1 className="text-3xl font-extrabold tracking-tight">Net Worth Dashboard</h1>
        <p className="text-muted-foreground">Personal Finance Analytics Engine.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 w-full max-w-6xl items-start">
        <div className="lg:col-span-1">
          <BalanceForm onDataInserted={fetchLogs} />
        </div>
        <div className="lg:col-span-2 w-full">
          <DashboardCharts data={data} />
        </div>
      </div>
    </main>
  );
}