"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { getUserSettings } from "@/lib/database";

export default function ThemeSyncProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    // 1. Core function to retrieve preferences from Supabase and apply them to the DOM
    const syncTheme = async () => {
      try {
        const prefs = await getUserSettings();
        const activeTheme = prefs.theme ?? "light";
        
        const root = window.document.documentElement;
        if (activeTheme === "dark") {
          root.classList.add("dark");
        } else {
          root.classList.remove("dark");
        }
      } catch (err) {
        console.error("Failed to synchronize application theme preferences:", err);
      }
    };

    // 2. Sync theme immediately when the application layout initializes
    syncTheme();

    // 3. Listen to Supabase authentication event changes (e.g., SIGNED_IN, SIGNED_OUT)
    // This catches when a user logs in, logs out, or changes their user identity session.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        syncTheme();
      } else if (event === "SIGNED_OUT") {
        // Fallback to default styling configuration upon session detachment
        window.document.documentElement.classList.remove("dark");
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return <>{children}</>;
}
