"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
    LayoutDashboard,
    Database,
    History,
    TrendingUp,
    PieChart,
    BarChart3,
    LogOut // Added the logout action icon
} from "lucide-react";

import { supabase } from "@/lib/supabase";

const navigationItems = [
    { name: "Overview", href: "/dashboard", icon: LayoutDashboard },
    { name: "Master Data Config", href: "/master-data", icon: Database },
    { name: "Transactional Logs", href: "/transactions", icon: History },
    { name: "Live Market Prices", href: "/market-prices", icon: TrendingUp },
    { name: "Current Allocations", href: "/charts-allocation", icon: PieChart },
    { name: "Historical Timelines", href: "/charts-history", icon: BarChart3 },
];

export default function SidebarNav() {
    const pathname = usePathname();

    const handleLogout = async () => {
        if (confirm("Are you sure you want to sign out of your profile session?")) {
            await supabase.auth.signOut();
            // Supabase auth state listeners on your root page will automatically intercept this and show the login wall.
        }
    };

    return (
        <aside className="w-full md:w-64 border-r bg-card flex flex-col h-auto md:h-screen sticky top-0 px-4 py-6 text-card-foreground">
            <div className="mb-8 px-2">
                <h2 className="text-lg font-bold tracking-tight text-foreground">Turbo Engine</h2>
                <p className="text-xs text-muted-foreground">Asset Portfolio Console</p>
            </div>

            {/* Added flex-1 to the navigation element container to push items down appropriately */}
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

                {/* DYNAMIC LOGOUT COMPONENT ROW */}
                <button
                    onClick={handleLogout}
                    className="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition text-muted-foreground hover:bg-destructive/10 hover:text-destructive md:mt-auto ml-4 md:ml-0 whitespace-nowrap cursor-pointer"
                >
                    <LogOut className="h-4 w-4 shrink-0" />
                    <span>Sign Out</span>
                </button>
            </nav>
        </aside>
    );
}