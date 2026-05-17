"use client";
import { useEffect, useState } from "react";
import { createClient, User } from "@supabase/supabase-js";
import BalanceForm from "@/components/balance-form";
import DashboardCharts from "@/components/dashboard-charts";
import AuthScreen from "@/components/auth-screen";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [data, setData] = useState<any[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);

  const fetchLogs = async () => {
    const { data: logs, error } = await supabase
      .from("savings_logs")
      .select("account_name, balance, log_date")
      .order("log_date", { ascending: true });

    if (!error && logs) {
      setData(logs);
    }
  };

  // Monitor Auth sessions on state mounts
  useEffect(() => {
    const checkUserSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
      setInitialLoading(false);
    };

    checkUserSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch metrics data when an authenticated user session is active
  useEffect(() => {
    if (user) {
      fetchLogs();
    } else {
      setData([]);
    }
  }, [user]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  if (initialLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Initializing Secure Connection...
      </div>
    );
  }

  // If user is not authenticated, render the registration/login workflow card
  if (!user) {
    return <AuthScreen onAuthSuccess={fetchLogs} />;
  }

  return (
    <main className="min-h-screen bg-background text-foreground p-4 sm:p-6 md:p-8 flex flex-col items-center">
      <div className="max-w-6xl w-full border-b pb-5 mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Turbo Engine Portfolio</h1>
          <p className="text-sm text-muted-foreground mt-1">Logged securely as: {user.email}</p>
        </div>
        <button
          onClick={handleLogout}
          className="text-xs bg-muted border hover:bg-accent px-3 py-1.5 rounded-md font-medium"
        >
          Sign Out
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 w-full max-w-6xl items-start">
        <div className="lg:col-span-1 w-full">
          <BalanceForm onDataInserted={fetchLogs} />
        </div>

        <div className="lg:col-span-2 w-full">
          <DashboardCharts data={data} />
        </div>
      </div>
    </main>
  );
}