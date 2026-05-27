"use client";
export const dynamic = "force-dynamic";
import { useEffect, useState } from "react";
import { redirect } from "next/navigation"; // Added for routing mechanics
import { User } from "@supabase/supabase-js";
import AuthScreen from "@/components/auth-screen";

import { supabase } from "@/lib/supabase";

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);

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

  if (initialLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Initializing Secure Connection...
      </div>
    );
  }

  // 1. If user is NOT authenticated, render the login shield right here on the landing URL
  if (!user) {
    return <AuthScreen onAuthSuccess={() => { }} />;
  }

  // 2. If user IS authenticated, instantly bounce them straight into the new dashboard layout!
  redirect("/asset-overview");
}