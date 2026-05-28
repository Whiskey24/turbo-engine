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

export default function LocaleSettings() {
    const [locale, setLocale] = useState<string>("");
    const [saved, setSaved] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        getUserSettings()
            .then((prefs) => setLocale(prefs.locale ?? "en-US"))
            .catch(() => setLocale("en-US"))
            .finally(() => setLoading(false));
    }, []);

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        setSaved(false);
        try {
            await upsertUserSettings({ locale });
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch {
            setError("Failed to save. Please try again.");
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <p className="text-sm text-muted-foreground">Loading...</p>;
    }

    return (
        <div className="space-y-3">
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

            <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
                {saving ? "Saving…" : "Save"}
            </button>

            {saved && <p className="text-sm text-green-600">Saved!</p>}
            {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
    );
}