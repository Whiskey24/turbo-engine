"use client";

import { useEffect, useState } from "react";
import { getUserSettings, upsertUserSettings } from "@/lib/database";

const LOCALE_OPTIONS = [
    { value: "en-US", label: "English (US)" },
    { value: "en-GB", label: "English (UK)" },
    { value: "nl-NL", label: "Dutch (Netherlands)" },
    { value: "de-DE", label: "German (Germany)" },
    { value: "fr-FR", label: "French (France)" },
    { value: "es-ES", label: "Spanish (Spain)" },
    { value: "it-IT", label: "Italian (Italy)" },
    { value: "pt-BR", label: "Portuguese (Brazil)" },
];

const THEME_OPTIONS = [
    { value: "light", label: "Light Mode" },
    { value: "dark", label: "Dark Mode" },
];

export default function LocaleSettings() {
    const [locale, setLocale] = useState<string>("");
    const [theme, setTheme] = useState<string>("light"); // ← State for theme tracker
    const [saved, setSaved] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Helper utility to sync the HTML root class with the state entry
    const applyThemeToDOM = (targetTheme: string) => {
        if (typeof window !== "undefined") {
            const root = window.document.documentElement;
            if (targetTheme === "dark") {
                root.classList.add("dark");
            } else {
                root.classList.remove("dark");
            }
        }
    };

    useEffect(() => {
        let isMounted = true;
        getUserSettings()
            .then((settings) => {
                if (!isMounted) return;
                if (settings?.locale) setLocale(settings.locale);
                if (settings?.theme) {
                    setTheme(settings.theme);
                    // Match the DOM class on entry initial validation pass
                    applyThemeToDOM(settings.theme);
                }
            })
            .catch((err) => {
                console.error("Failed to fetch settings metrics parameters:", err);
            })
            .finally(() => {
                if (isMounted) setLoading(false);
            });

        return () => {
            isMounted = false;
        };
    }, []);

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        setSaved(false);

        try {
            // 1. Commit layout adjustments to Supabase database
            await upsertUserSettings({ locale, theme });
            setSaved(true);

            // 2. LIVE SYNC EFFECT: Instantly switch styles dynamically on screen
            applyThemeToDOM(theme);
        } catch (err: any) {
            setError(err.message || "Failed to commit layout properties.");
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <p className="text-sm text-muted-foreground italic">Loading preference configurations...</p>;
    }

    return (
        <div className="space-y-4 max-w-md">
            {/* Locale Dropdown */}
            <div>
                <label htmlFor="locale-select" className="text-sm font-medium">
                    Regional Formatting & Language
                </label>
                <p className="text-xs text-muted-foreground mb-2">
                    Controls localization rules for timestamps, currencies, numbers and date-strings.
                </p>
                <select
                    id="locale-select"
                    value={locale}
                    onChange={(e) => setLocale(e.target.value)}
                    className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                >
                    <option value="" disabled>-- Select Regional Locale Setting --</option>
                    {LOCALE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                            {opt.label}
                        </option>
                    ))}
                </select>
            </div>

            {/* Regional State Validation Feedback Alert Box */}
            {locale && (
                <p className="text-[11px] bg-muted/60 text-muted-foreground px-2.5 py-1.5 rounded border border-border/60 font-mono">
                    Sample Format: {new Intl.DateTimeFormat(locale, { dateStyle: "long", timeStyle: "short" }).format(new Date())} • {new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(123456.78)}
                </p>
            )}

            {/* Dark Mode Dropdown */}
            <div>
                <label htmlFor="theme-select" className="text-sm font-medium">
                    Interface Theme
                </label>
                <p className="text-xs text-muted-foreground mb-2">
                    Select your preferred visual layout appearance.
                </p>
                <select
                    id="theme-select"
                    value={theme}
                    onChange={(e) => setTheme(e.target.value)}
                    className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                >
                    {THEME_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                            {opt.label}
                        </option>
                    ))}
                </select>
            </div>

            <div className="pt-1 flex items-center gap-3">
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 font-medium transition cursor-pointer"
                >
                    {saving ? "Saving…" : "Save Preferences"}
                </button>

                {saved && <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold animate-pulse">Preferences saved successfully!</p>}
                {error && <p className="text-xs text-destructive font-medium">{error}</p>}
            </div>
        </div>
    );
}
