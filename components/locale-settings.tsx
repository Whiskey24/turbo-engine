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
    const [theme, setTheme] = useState<string>("light"); // ← New state for theme tracker
    const [saved, setSaved] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Helper utility to sync the HTML root class with the state entry
    const applyThemeToDOM = (targetTheme: string) => {
        if (typeof window !== "undefined") {
            if (targetTheme === "dark") {
                document.documentElement.classList.add("dark");
            } else {
                document.documentElement.classList.remove("dark");
            }
        }
    };

    useEffect(() => {
        getUserSettings()
            .then((prefs) => {
                const fetchedLocale = prefs.locale ?? "en-US";
                const fetchedTheme = prefs.theme ?? "light";

                setLocale(fetchedLocale);
                setTheme(fetchedTheme);
                applyThemeToDOM(fetchedTheme);
            })
            .catch(() => {
                setLocale("en-US");
                setTheme("light");
            })
            .finally(() => setLoading(false));
    }, []);

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        setSaved(false);
        try {
            // Save both configuration items simultaneously inside preferences JSON payload
            await upsertUserSettings({ locale, theme });
            applyThemeToDOM(theme);

            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch {
            setError("Failed to save preferences. Please try again.");
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <p className="text-sm text-muted-foreground">Loading...</p>;
    }

    return (
        <div className="space-y-4">
            {/* Locale Dropdown */}
            <div>
                <label htmlFor="locale-select" className="text-sm font-medium">
                    Display locale
                </label>
                <p className="text-xs text-muted-foreground mb-2">
                    Used for number and date formatting throughout the app.
                </p>
                <select
                    id="locale-select"
                    value={locale}
                    onChange={(e) => setLocale(e.target.value)}
                    className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                >
                    {LOCALE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                            {opt.label}
                        </option>
                    ))}
                </select>
            </div>

            {locale && (
                <p className="text-xs text-muted-foreground">
                    Number: {new Intl.NumberFormat(locale).format(1234567.89)}
                    {" \u00A0·\u00A0 "}
                    Date: {new Intl.DateTimeFormat(locale, { dateStyle: "short" }).format(new Date())}
                    {" \u00A0·\u00A0 "}
                    Time: {new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(new Date(2000, 0, 1, 15, 30))}
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

            <div className="pt-1">
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                    {saving ? "Saving…" : "Save Preferences"}
                </button>
            </div>

            {saved && <p className="text-sm text-green-600">Preferences saved successfully!</p>}
            {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
    );
}