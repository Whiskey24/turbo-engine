"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import {
    LayoutDashboard,
    Database,
    History,
    TrendingUp,
    BarChart3,
    LogOut,
    User,
    BookOpen
} from "lucide-react";

import { supabase } from "@/lib/supabase";

const navigationItems = [
    { name: "Asset Overview", href: "/asset-overview", icon: LayoutDashboard },
    { name: "Trading Overview", href: "/trading-overview", icon: TrendingUp },
    { name: "Valuation Ledger", href: "/valuation-ledger", icon: History },
    { name: "Trading Journal", href: "/trading-journal", icon: BookOpen },
    { name: "Historical Timelines", href: "/historical-timelines", icon: BarChart3 },
    { name: "Asset configuration", href: "/asset-configuration", icon: Database },
    { name: "Settings", href: "/settings", icon: User },
];

export default function SidebarNav() {
    const pathname = usePathname();
    const [userEmail, setUserEmail] = useState<string | null>(null);

    useEffect(() => {
        const getUserEmail = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            setUserEmail(user?.email || null);
        };
        getUserEmail();
    }, []);

    const handleLogout = async () => {
        if (confirm("Are you sure you want to sign out of your profile session?")) {
            await supabase.auth.signOut();
            // Supabase auth state listeners on your root page will automatically intercept this and show the login wall.
        }
    };

    return (
        <aside className="w-full md:w-64 border-r bg-card flex flex-col h-auto md:h-screen sticky top-0 px-4 py-6 text-card-foreground z-10">
            <div className="mb-8 px-2">
                <h2 className="text-lg font-bold tracking-tight text-foreground">Turbo Engine</h2>
                <p className="text-xs text-muted-foreground">Asset Portfolio Console</p>
            </div>

            <nav className="flex flex-row md:flex-col flex-1 gap-1 overflow-x-auto md:overflow-visible pb-2 md:pb-0">
                {navigationItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = pathname === item.href;

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                "flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition dynamic-whitespace-nowrap whitespace-nowrap",
                                isActive
                                    ? "bg-primary text-primary-foreground shadow-sm"
                                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                            )}
                        >
                            <Icon className="h-4 w-4 shrink-0" />
                            <span>{item.name}</span>
                        </Link>
                    );
                })}
            </nav>

            <div className="mt-auto space-y-1">
                <button
                    onClick={handleLogout}
                    className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition text-muted-foreground hover:bg-destructive/10 hover:text-destructive whitespace-nowrap cursor-pointer"
                >
                    <LogOut className="h-4 w-4 shrink-0" />
                    <span>Sign Out</span>
                </button>
                {userEmail && (
                    <div className="flex items-center gap-2 px-3 pt-2 text-xs text-muted-foreground/70 truncate">
                        <User className="h-3 w-3 shrink-0" />
                        <span className="truncate" title={userEmail}>{userEmail}</span>
                    </div>
                )}
            </div>
        </aside>
    );
}
