"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { User } from "@supabase/supabase-js";
import SidebarNav from "@/components/sidebar-nav";

import { supabase } from "@/lib/supabase";

// 10 minutes in milliseconds
const IDLE_TIMEOUT = 10 * 60 * 1000;

export default function AuthProviderGate({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [mounted, setMounted] = useState(false); // Prevents hydration mismatches
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        setMounted(true); // Signifies that server HTML and client are synced

        const syncSecuritySession = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session && pathname !== "/") {
                router.push("/");
            } else if (session) {
                setUser(session.user);
            }
            setLoading(false);
        };

        syncSecuritySession();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (!session) {
                setUser(null);
                if (pathname !== "/") router.push("/");
            } else {
                setUser(session.user);
            }
        });

        return () => subscription.unsubscribe();
    }, [router, pathname]);

    // --- IDLE TIMER LOGIC ---
    useEffect(() => {
        // Only track activity if a user is actively logged in
        if (!user) return;

        let timeoutId: ReturnType<typeof setTimeout>;

        const handleLogout = async () => {
            console.log("User idle for 10 minutes. Logging out secure session...");
            // Calling signOut triggers onAuthStateChange above, handles resetting user state and redirecting to "/"
            await supabase.auth.signOut();
        };

        const resetTimer = () => {
            if (timeoutId) clearTimeout(timeoutId);
            timeoutId = setTimeout(handleLogout, IDLE_TIMEOUT);
        };

        // User actions that reset the 10-minute countdown
        const activityEvents = ["mousemove", "keydown", "mousedown", "touchstart", "scroll"];

        // Start the timer immediately upon login/mount
        resetTimer();

        // Attach listeners for user activity
        activityEvents.forEach((event) => {
            window.addEventListener(event, resetTimer);
        });

        // Cleanup event listeners and timers if user logs out or leaves
        return () => {
            if (timeoutId) clearTimeout(timeoutId);
            activityEvents.forEach((event) => {
                window.removeEventListener(event, resetTimer);
            });
        };
    }, [user]);
    // ------------------------

    // If we haven't mounted on the client yet, render an empty structure 
    // that matches the server's static body exactly.
    if (!mounted) {
        return <div className="min-h-screen bg-background" />;
    }

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground bg-background">
                Initializing Secure Matrix Link...
            </div>
        );
    }

    // Clear render paths based on security token state
    if (!user) {
        return (
            <div className="w-full min-h-screen flex items-center justify-center">
                {children}
            </div>
        );
    }

    return (
        <div className="flex flex-col md:flex-row min-h-screen w-full">
            <SidebarNav />
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8">
                <div className="max-w-6xl mx-auto w-full">
                    {children}
                </div>
            </div>
        </div>
    );
}