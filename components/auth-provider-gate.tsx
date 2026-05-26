"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { User } from "@supabase/supabase-js";
import SidebarNav from "@/components/sidebar-nav";

import { supabase } from "@/lib/supabase";

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
                if (event === "SIGNED_IN") {
                    console.log("User signed in, logging geolocation...");
                    fetch("/api/log-location", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({ userId: session.user.id }),
                    }).catch((err) => console.error("Failed to log geolocation:", err));
                }
            }
        });

        return () => subscription.unsubscribe();
    }, [router, pathname]);

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