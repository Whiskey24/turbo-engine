"use client";
export const dynamic = "force-dynamic";
import { useState, useCallback, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Trash2, Pencil, X, LayoutGrid, Table, ArrowUp, ArrowDown, ChevronsUpDown } from "lucide-react";

import { supabase } from "@/lib/supabase";
import type { AssetType, PortfolioAssetWithType } from "@/lib/database";
import { getUserSettings } from "@/lib/database";
import { usePortfolioDataRefresh } from "@/lib/portfolio-refresh";
import { formatIBAN } from "@/lib/utils";

const VALID_TYPE_SLUGS = [
    "BANK_ACCOUNT",
    "STOCK",
    "CRYPTO",
    "FUND_ETF",
    "REAL_ESTATE",
    "OTHER",
] as const;

const ASSET_TYPE_LABELS: Record<typeof VALID_TYPE_SLUGS[number], string> = {
    BANK_ACCOUNT: "Bank Account / Cash",
    STOCK: "Individual Stocks",
    CRYPTO: "Cryptocurrency",
    FUND_ETF: "Mutual Funds & ETFs",
    REAL_ESTATE: "Real Estate Property",
    OTHER: "Other Assets / Miscellaneous",
};

type SlugRequirements = {
    requires_iban: boolean;
    requires_ticker: boolean;
    requires_isin: boolean;
};

function getSlugRequirements(slug: string): SlugRequirements {
    switch (slug) {
        case "BANK_ACCOUNT":
            return { requires_iban: true, requires_ticker: false, requires_isin: false };
        case "STOCK":
            return { requires_iban: false, requires_ticker: true, requires_isin: false };
        case "CRYPTO":
            return { requires_iban: false, requires_ticker: true, requires_isin: false };
        case "FUND_ETF":
            return { requires_iban: false, requires_ticker: false, requires_isin: true };
        case "REAL_ESTATE":
            return { requires_iban: false, requires_ticker: false, requires_isin: false };
        case "OTHER":
            return { requires_iban: false, requires_ticker: false, requires_isin: false };
        default:
            return { requires_iban: false, requires_ticker: false, requires_isin: false };
    }
}

function requiresForType(type: Pick<AssetType, "type_slug"> | undefined): SlugRequirements {
    return getSlugRequirements(type?.type_slug ?? "");
}

const formatDate = (dateStr: string, locale: string) => {
    if (!dateStr) return "";
    const [year, month, day] = dateStr.split("-").map(Number);
    return new Intl.DateTimeFormat(locale, { dateStyle: "short" }).format(new Date(year, month - 1, day));
};

const formatCurrency = (value: number, locale: string) => {
    return new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(value);
};

interface LatestValuation {
    balance_amount: number;
    valuation_date: string;
}

type SortField = "name" | "institution" | "type" | "valuation";
interface SortConfig {
    field: SortField;
    direction: "asc" | "desc";
}

export default function AssetConfigurationPage() {
    const [types, setTypes] = useState<AssetType[]>([]);
    const [assets, setAssets] = useState<PortfolioAssetWithType[]>([]);
    const [latestValuations, setLatestValuations] = useState<Record<string, LatestValuation>>({});

    // Layout and Sorting States
    const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
    const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);

    // Form States
    const [newTypeName, setNewTypeName] = useState("");
    const [typeSlug, setTypeSlug] = useState<string>("");

    const [selectedTypeId, setSelectedTypeId] = useState("");
    const [assetName, setAssetName] = useState("");
    const [institution, setInstitution] = useState("");
    const [loginUrl, setLoginUrl] = useState("");
    const [comments, setComments] = useState("");
    const [iban, setIban] = useState("");
    const [isin, setIsin] = useState("");
    const [ticker, setTicker] = useState("");

    const [locale, setLocale] = useState<string>("en-GB");
    const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());

    const [loadingType, setLoadingType] = useState(false);
    const [loadingAsset, setLoadingAsset] = useState(false);

    // Edit Asset Type Dialog State
    const [editingType, setEditingType] = useState<AssetType | null>(null);
    const [editTypeName, setEditTypeName] = useState("");
    const [editTypeSlug, setEditTypeSlug] = useState<string>("");
    const [loadingEditType, setLoadingEditType] = useState(false);

    // Edit Asset Dialog State
    const [editingAsset, setEditingAsset] = useState<PortfolioAssetWithType | null>(null);
    const [editTypeId, setEditTypeId] = useState("");
    const [editName, setEditName] = useState("");
    const [editInstitution, setEditInstitution] = useState("");
    const [editLoginUrl, setEditLoginUrl] = useState("");
    const [editComments, setEditComments] = useState("");
    const [editIban, setEditIban] = useState("");
    const [editTicker, setEditTicker] = useState("");
    const [editIsin, setEditIsin] = useState("");
    const [loadingEdit, setLoadingEdit] = useState(false);

    const currentActiveRuleSet = types.find(t => t.id === selectedTypeId);
    const editRuleSet = types.find(t => t.id === editTypeId);

    const fetchData = useCallback(async () => {
        const { data: fetchTypes } = await supabase
            .from("asset_types")
            .select("*")
            .order("name", { ascending: true });

        const { data: fetchAssets } = await supabase
            .from("portfolio_assets")
            .select("*, asset_types(name, type_slug)")
            .order("name", { ascending: true });

        const { data: fetchValuations } = await supabase
            .from("asset_valuations")
            .select("asset_id, balance_amount, valuation_date")
            .order("valuation_date", { ascending: false });

        if (fetchTypes) {
            setTypes(fetchTypes);
            setSelectedTypes((current) =>
                current.size === 0
                    ? new Set(fetchTypes.map((t) => t.id))
                    : current
            );
            setSelectedTypeId((current) => {
                if (fetchTypes.length === 0) return "";
                if (current && fetchTypes.some((type) => type.id === current)) return current;
                return fetchTypes[0].id;
            });
        }
        if (fetchAssets) {
            setAssets(fetchAssets);
        }
        if (fetchValuations) {
            const latest: Record<string, LatestValuation> = {};
            fetchValuations.forEach((row) => {
                if (!(row.asset_id in latest)) {
                    latest[row.asset_id] = {
                        balance_amount: Number(row.balance_amount),
                        valuation_date: row.valuation_date,
                    };
                }
            });
            setLatestValuations(latest);
        }
    }, []);

    usePortfolioDataRefresh(fetchData);

    useEffect(() => {
        getUserSettings().then((prefs) => { if (prefs.locale) setLocale(prefs.locale); });
    }, []);

    const handleCreateType = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!typeSlug) {
            alert("Please select an asset type slug.");
            return;
        }
        setLoadingType(true);

        const { error } = await supabase.from("asset_types").insert([
            {
                name: newTypeName,
                type_slug: typeSlug,
            },
        ]);

        setLoadingType(false);
        if (!error) {
            setNewTypeName("");
            setTypeSlug("");
            fetchData();
        } else {
            alert(`Error creating type: ${error.message}`);
        }
    };

    const openEditTypeDialog = (type: AssetType) => {
        setEditingType(type);
        setEditTypeName(type.name);
        setEditTypeSlug(type.type_slug || "");
    };

    const closeEditTypeDialog = () => {
        if (loadingEditType) return;
        setEditingType(null);
    };

    const handleUpdateType = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingType) return;
        if (!editTypeSlug) {
            alert("Please select an asset type slug.");
            return;
        }
        setLoadingEditType(true);

        const { error } = await supabase
            .from("asset_types")
            .update({
                name: editTypeName,
                type_slug: editTypeSlug,
            })
            .eq("id", editingType.id);

        setLoadingEditType(false);
        if (!error) {
            setEditingType(null);
            fetchData();
        } else {
            alert(`Error updating type classification: ${error.message}`);
        }
    };

    const handleCreateAsset = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoadingAsset(true);
        const reqs = requiresForType(currentActiveRuleSet);

        const { error } = await supabase.from("portfolio_assets").insert([
            {
                type_id: selectedTypeId,
                name: assetName,
                institution,
                login_url: loginUrl || null,
                comments: comments || null,
                iban: reqs.requires_iban ? iban : null,
                ticker: reqs.requires_ticker ? ticker.toUpperCase() : null,
                isin: reqs.requires_isin ? editIsin.toUpperCase() : null,
            },
        ]);

        setLoadingAsset(false)
        if (!error) {
            setAssetName("");
            setInstitution("");
            setLoginUrl("");
            setComments("");
            setIban("");
            setTicker("");
            setIsin("");
            fetchData();
        } else {
            alert(`Error registering asset: ${error.message}`);
        }
    };

    const handleDeleteType = async (id: string, name: string) => {
        if (!confirm(`Are you sure you want to delete the "${name}" template classification?`)) return;

        const { error } = await supabase.from("asset_types").delete().eq("id", id);

        if (error) {
            if (error.code === "23503") {
                alert(`Deletion Denied: Cannot delete type "${name}" because active portfolio asset records are currently mapping to it. Remove those accounts first.`);
            } else {
                alert(`Error executing drop operation: ${error.message}`);
            }
        } else {
            fetchData();
        }
    };

    const openEditDialog = (asset: PortfolioAssetWithType) => {
        setEditingAsset(asset);
        setEditTypeId(asset.type_id);
        setEditName(asset.name);
        setEditInstitution(asset.institution);
        setEditLoginUrl(asset.login_url || "");
        setEditComments(asset.comments || "");
        setEditIban(asset.iban || "");
        setEditTicker(asset.ticker || "");
        setEditIsin(asset.isin || "");
    };

    const closeEditDialog = () => {
        if (loadingEdit) return;
        setEditingAsset(null);
    };

    const handleUpdateAsset = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingAsset) return;

        setLoadingEdit(true);
        const reqs = requiresForType(editRuleSet);

        const { error } = await supabase
            .from("portfolio_assets")
            .update({
                type_id: editTypeId,
                name: editName,
                institution: editInstitution,
                login_url: editLoginUrl || null,
                comments: editComments || null,
                iban: reqs.requires_iban ? editIban : null,
                ticker: reqs.requires_ticker ? editTicker.toUpperCase() : null,
                isin: reqs.requires_isin ? editIsin.toUpperCase() : null,
            })
            .eq("id", editingAsset.id);

        setLoadingEdit(false);
        if (!error) {
            setEditingAsset(null);
            fetchData();
        } else {
            alert(`Error updating asset: ${error.message}`);
        }
    };

    const handleDeleteAsset = async (id: string, name: string) => {
        if (!confirm(`Are you sure you want to remove the asset account profile: "${name}"?`)) return;

        const { error } = await supabase.from("portfolio_assets").delete().eq("id", id);

        if (error) {
            if (error.code === "23503") {
                alert(`Deletion Denied: Cannot delete "${name}" because it contains historical valuation logs inside your ledger. Clear those transactions first.`);
            } else {
                alert(`Error executing drop operation: ${error.message}`);
            }
        } else {
            fetchData();
        }
    };

    // Table Column Sorting Handler
    const handleSort = (field: SortField) => {
        setSortConfig((current) => {
            if (!current || current.field !== field) {
                return { field, direction: "asc" };
            }
            if (current.direction === "asc") {
                return { field, direction: "desc" };
            }
            return null; // Reset sort state on 3rd click cycle
        });
    };

    const renderSortIcon = (field: SortField) => {
        if (!sortConfig || sortConfig.field !== field) {
            return <ChevronsUpDown className="ml-1 h-3 w-3 inline text-muted-foreground/50 group-hover:text-muted-foreground transition" />;
        }
        return sortConfig.direction === "asc" ? (
            <ArrowUp className="ml-1 h-3 w-3 inline text-primary" />
        ) : (
            <ArrowDown className="ml-1 h-3 w-3 inline text-primary" />
        );
    };

    // Compute active runtime client sorted assets collection
    const sortedAssets = [...assets].sort((a, b) => {
        if (!sortConfig) return 0;
        const { field, direction } = sortConfig;
        let valA: string | number = "";
        let valB: string | number = "";

        if (field === "name") {
            valA = (a.name || "").toLowerCase();
            valB = (b.name || "").toLowerCase();
        } else if (field === "institution") {
            valA = (a.institution || "").toLowerCase();
            valB = (b.institution || "").toLowerCase();
        } else if (field === "type") {
            valA = (a.asset_types?.name || "").toLowerCase();
            valB = (b.asset_types?.name || "").toLowerCase();
        } else if (field === "valuation") {
            valA = latestValuations[a.id]?.balance_amount ?? -1;
            valB = latestValuations[b.id]?.balance_amount ?? -1;
        }

        if (valA < valB) return direction === "asc" ? -1 : 1;
        if (valA > valB) return direction === "asc" ? 1 : -1;
        return 0;
    });

    const createReqs = requiresForType(currentActiveRuleSet);
    const editReqs = requiresForType(editRuleSet);

    const allSelected = types.length > 0 && selectedTypes.size === types.length;

    const toggleType = (id: string) => {
        setSelectedTypes((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const toggleAll = () => {
        setSelectedTypes(allSelected ? new Set() : new Set(types.map((t) => t.id)));
    };

    const filteredAssets = sortedAssets.filter((a) => selectedTypes.has(a.type_id));

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Asset Configuration</h1>
                <p className="text-sm text-muted-foreground">Maintain asset types and assets.</p>
            </div>

            {/* BLOCK 1: ASSET TYPE ENGINE PANELS */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">

                {/* COLUMN 1: MAINTAIN ASSET TYPES */}
                <Card className="shadow-sm lg:col-span-1 min-h-[419px] max-h-[419px] flex flex-col justify-between">
                    <div>
                        <CardHeader>
                            <CardTitle className="text-base">Create Asset Types</CardTitle>
                            <CardDescription>Define asset types to group your assets.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleCreateType} className="space-y-4">
                                <div className="space-y-4">
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-xs font-medium text-muted-foreground">Asset type label</label>
                                        <input
                                            type="text" value={newTypeName} onChange={(e) => setNewTypeName(e.target.value)}
                                            placeholder="e.g., Cash, Crypto Tokens" className="border rounded-md p-2 bg-background text-sm" required
                                        />
                                    </div>

                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-xs font-medium text-muted-foreground">Asset classification</label>
                                        <select
                                            value={typeSlug}
                                            onChange={(e) => setTypeSlug(e.target.value)}
                                            className="border rounded-md p-2 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary w-full"
                                            required
                                        >
                                            <option value="" disabled>-- Select a classification --</option>
                                            {VALID_TYPE_SLUGS.map((slug) => (
                                                <option key={slug} value={slug}>
                                                    {ASSET_TYPE_LABELS[slug]}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {typeSlug && (
                                    <div className="space-y-2 border rounded-md p-3 bg-muted/40">
                                        <p className="text-xs font-semibold text-muted-foreground mb-1.5">Required Data Parameters:</p>
                                        {(() => {
                                            const reqs = getSlugRequirements(typeSlug);
                                            const hasAny = reqs.requires_iban || reqs.requires_ticker || reqs.requires_isin;
                                            if (!hasAny) {
                                                return <p className="text-xs text-muted-foreground italic">None — no additional parameters required.</p>;
                                            }
                                            return (
                                                <div className="grid grid-cols-1 gap-2">
                                                    {reqs.requires_iban && (
                                                        <div className="flex items-center gap-2.5 text-sm font-normal">
                                                            <span className="h-3 w-3 rounded-full bg-primary/60 shrink-0" />
                                                            <span>Requires IBAN</span>
                                                        </div>
                                                    )}
                                                    {reqs.requires_ticker && (
                                                        <div className="flex items-center gap-2.5 text-sm font-normal">
                                                            <span className="h-3 w-3 rounded-full bg-primary/60 shrink-0" />
                                                            <span>Requires Ticker</span>
                                                        </div>
                                                    )}
                                                    {reqs.requires_isin && (
                                                        <div className="flex items-center gap-2.5 text-sm font-normal">
                                                            <span className="h-3 w-3 rounded-full bg-primary/60 shrink-0" />
                                                            <span>Requires ISIN</span>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                )}

                                <button type="submit" disabled={loadingType} className="w-full bg-secondary text-secondary-foreground font-medium py-2 rounded-md transition hover:opacity-90 text-sm mt-2 cursor-pointer disabled:cursor-not-allowed">
                                    {loadingType ? "Processing..." : "Create Asset Type"}
                                </button>
                            </form>
                        </CardContent>
                    </div>
                </Card>

                {/* COLUMNS 2 & 3: DEFINED ASSET TYPES */}
                <div className="space-y-2 h-full lg:col-span-2">
                    {types.length === 0 ? (
                        <div className="bg-card border border-dashed rounded-md p-6 text-muted-foreground text-center text-sm min-h-[419px] flex items-center justify-center">
                            No asset types registered.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 min-h-[419px] max-h-[419px] overflow-y-auto pr-1 content-start">
                            {types.map(t => {
                                const tReqs = requiresForType(t);
                                return (
                                    <div key={t.id} className="bg-card border rounded-md p-3 relative group shadow-sm h-[71px]">
                                        <div className="flex flex-col gap-0.5 pr-8">
                                            <span className="font-semibold text-foreground text-xs truncate" title={t.name}>{t.name}</span>
                                            <span className="text-[10px] font-medium text-muted-foreground">
                                                {t.type_slug && t.type_slug in ASSET_TYPE_LABELS
                                                    ? ASSET_TYPE_LABELS[t.type_slug as keyof typeof ASSET_TYPE_LABELS]
                                                    : (t.type_slug ?? "Unclassified")}
                                            </span>
                                            <div className="flex gap-1 text-[9px] font-mono text-muted-foreground mt-0.5">
                                                {tReqs.requires_iban && <span>[IBAN]</span>}
                                                {tReqs.requires_ticker && <span>[TICKER]</span>}
                                                {tReqs.requires_isin && <span>[ISIN]</span>}
                                            </div>
                                        </div>
                                        <div className="absolute top-2 right-2 flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition">
                                            <button
                                                onClick={() => openEditTypeDialog(t)}
                                                className="text-muted-foreground hover:text-primary p-1 rounded transition cursor-pointer"
                                                title="Edit template configuration"
                                            >
                                                <Pencil className="h-3.5 w-3.5" />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteType(t.id, t.name)}
                                                className="text-muted-foreground hover:text-destructive p-1 rounded transition cursor-pointer"
                                                title="Remove Type classification"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* BLOCK 2: REGISTER ASSET ACCOUNTS (FULL PAGE WIDTH) */}
            <Card className="shadow-sm w-full">
                <CardHeader>
                    <CardTitle className="text-base">Create Assets</CardTitle>
                </CardHeader>
                <CardContent>
                    {types.length === 0 ? (
                        <div className="text-center py-6 text-sm text-muted-foreground">
                            Register at least one asset type above before registering assets.
                        </div>
                    ) : (
                        <form onSubmit={handleCreateAsset} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-medium text-muted-foreground">Account Name</label>
                                <input type="text" value={assetName} onChange={(e) => setAssetName(e.target.value)} placeholder="e.g., Personal Portfolio Reserve" className="border rounded-md p-2 bg-background text-sm" required />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-medium text-muted-foreground">Asset type</label>
                                <select
                                    value={selectedTypeId} onChange={(e) => setSelectedTypeId(e.target.value)}
                                    className="border rounded-md p-2 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary w-full"
                                >
                                    {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                </select>
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-medium text-muted-foreground">Custodian Bank / Broker</label>
                                <input type="text" value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="e.g., DEGIRO, ING Bank" className="border rounded-md p-2 bg-background text-sm" required />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-medium text-muted-foreground">Login Portal Url (Optional)</label>
                                <input type="url" value={loginUrl} onChange={(e) => setLoginUrl(e.target.value)} placeholder="https://login.bank.com" className="border rounded-md p-2 bg-background text-sm" />
                            </div>

                            {createReqs.requires_iban && (
                                <div className="flex flex-col gap-1.5 md:col-span-2">
                                    <label className="text-xs font-medium text-muted-foreground">IBAN Number</label>
                                    <input type="text" value={iban} onChange={(e) => setIban(e.target.value)} placeholder="NL00 BANK 0123 4567 89" className="border rounded-md p-2 bg-background text-sm uppercase" required />
                                </div>
                            )}

                            {createReqs.requires_ticker && (
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-medium text-muted-foreground">Ticker Symbol</label>
                                    <input type="text" value={ticker} onChange={(e) => setTicker(e.target.value)} placeholder="e.g., AAPL, BTC" className="border rounded-md p-2 bg-background text-sm uppercase" required />
                                </div>
                            )}

                            {createReqs.requires_isin && (
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-medium text-muted-foreground">ISIN Number</label>
                                    <input type="text" value={isin} onChange={(e) => setIsin(e.target.value)} placeholder="US0378331002" className="border rounded-md p-2 bg-background text-sm uppercase" required />
                                </div>
                            )}

                            <div className="flex flex-col gap-1.5 md:col-span-2">
                                <label className="text-xs font-medium text-muted-foreground">Notes</label>
                                <textarea value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Add any commments or notes here..." className="border rounded-md p-2 bg-background text-sm min-h-16" />
                            </div>

                            <div className="md:col-span-2 pt-2">
                                <button type="submit" disabled={loadingAsset} className="w-full bg-secondary text-secondary-foreground font-medium py-2 rounded-md transition hover:opacity-90 text-sm cursor-pointer disabled:cursor-not-allowed">
                                    {loadingAsset ? "Registering Asset Account..." : "Create Asset"}
                                </button>
                            </div>
                        </form>
                    )}
                </CardContent>
            </Card>

            {/* BLOCK 3: REGISTERED ACTIVE ASSETS GRID / TABLE VIEW */}
            <div className="space-y-3 w-full">
                <div className="flex justify-between items-center px-1">
                    <h3 className="text-base font-semibold">Registered Assets</h3>

                    {/* View Switcher Controls */}
                    {assets.length > 0 && (
                        <div className="flex items-center gap-1 bg-muted p-1 rounded-lg border">
                            <button
                                onClick={() => setViewMode("cards")}
                                className={`p-1.5 rounded-md transition text-xs flex items-center gap-1.5 cursor-pointer ${viewMode === "cards"
                                    ? "bg-card text-foreground shadow-sm font-medium"
                                    : "text-muted-foreground hover:text-foreground"
                                    }`}
                                title="Show Cards Layout"
                            >
                                <LayoutGrid className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">Cards</span>
                            </button>
                            <button
                                onClick={() => setViewMode("table")}
                                className={`p-1.5 rounded-md transition text-xs flex items-center gap-1.5 cursor-pointer ${viewMode === "table"
                                    ? "bg-card text-foreground shadow-sm font-medium"
                                    : "text-muted-foreground hover:text-foreground"
                                    }`}
                                title="Show Spreadsheet Table"
                            >
                                <Table className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">Table</span>
                            </button>
                        </div>
                    )}
                </div>

                {assets.length > 0 && types.length > 1 && (
                    <div className="flex flex-wrap items-center gap-2 px-1">
                        <button
                            onClick={toggleAll}
                            className={`text-xs px-2.5 py-1 rounded-full border font-medium transition cursor-pointer ${allSelected
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-muted text-muted-foreground border-border hover:text-foreground"
                                }`}
                        >
                            {allSelected ? "Deselect all" : "Select all"}
                        </button>
                        <div className="w-px h-4 bg-border" />
                        {types.map((type) => (
                            <button
                                key={type.id}
                                onClick={() => toggleType(type.id)}
                                className={`text-xs px-2.5 py-1 rounded-full border font-medium transition cursor-pointer ${selectedTypes.has(type.id)
                                    ? "bg-secondary text-secondary-foreground border-secondary"
                                    : "bg-muted text-muted-foreground border-border hover:text-foreground"
                                    }`}
                            >
                                {type.name}
                            </button>
                        ))}
                    </div>
                )}

                {assets.length === 0 ? (
                    <div className="border border-dashed rounded-xl h-32 flex items-center justify-center text-muted-foreground text-sm bg-card">
                        No assets registered.
                    </div>
                ) : filteredAssets.length === 0 ? (
                    <div className="border border-dashed rounded-xl h-32 flex items-center justify-center text-muted-foreground text-sm bg-card">
                        No assets match the selected filters.
                    </div>
                ) : viewMode === "cards" ? (
                    /* ORIGINAL CARDS VIEW MODE */
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredAssets.map((asset) => (
                            <Card key={asset.id} className="shadow-sm relative group">
                                <CardHeader className="pb-2">
                                    <div className="flex justify-between items-start pr-8">
                                        <div>
                                            <CardTitle className="text-sm font-bold">{asset.name}</CardTitle>
                                            <CardDescription className="text-xs">{asset.institution}</CardDescription>
                                        </div>
                                        <span className="text-[10px] font-bold bg-secondary text-secondary-foreground px-2 py-0.5 rounded tracking-wider">
                                            {asset.asset_types?.name || "Asset"}
                                        </span>
                                    </div>
                                    <div className="absolute top-4 right-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition">
                                        <button
                                            onClick={() => openEditDialog(asset)}
                                            className="text-muted-foreground hover:text-primary p-1 rounded transition cursor-pointer"
                                            title="Edit asset profile"
                                        >
                                            <Pencil className="h-4 w-4" />
                                        </button>
                                        <button
                                            onClick={() => handleDeleteAsset(asset.id, asset.name)}
                                            className="text-muted-foreground hover:text-destructive p-1 rounded transition cursor-pointer"
                                            title="Remove account entry profile"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                </CardHeader>
                                <CardContent className="text-xs space-y-1.5 text-muted-foreground pt-0">
                                    {asset.iban && <p><span className="font-medium text-foreground">IBAN:</span> {formatIBAN(asset.iban)}</p>}
                                    {asset.ticker && <p><span className="font-medium text-foreground">Ticker:</span> {asset.ticker}</p>}
                                    {asset.isin && <p><span className="font-medium text-foreground">ISIN:</span> {asset.isin}</p>}
                                    {latestValuations[asset.id] ? (
                                        <div className="flex justify-between items-center border-t pt-1.5 mt-1.5 text-foreground">
                                            <span>Last Valuation: <strong className="font-medium">{formatDate(latestValuations[asset.id].valuation_date, locale)}</strong></span>
                                            <span className="font-bold text-primary">{formatCurrency(latestValuations[asset.id].balance_amount, locale)}</span>                                        </div>
                                    ) : (
                                        <p className="italic border-t pt-1.5 mt-1.5">No valuation logged yet.</p>
                                    )}
                                    {asset.comments && <p className="italic border-t pt-1.5 mt-1.5 text-muted-foreground/90 truncate max-w-full" title={asset.comments}>{asset.comments}</p>}
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                ) : (
                    /* SPREADSHEET TABLE VIEW MODE (WITH INTERACTIVE SORTING HEADERS) */
                    <div className="border rounded-md bg-card shadow-sm overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                            <thead>
                                <tr className="bg-muted/60 border-b text-muted-foreground font-medium select-none">
                                    <th
                                        onClick={() => handleSort("name")}
                                        className="p-3 cursor-pointer hover:bg-muted/80 hover:text-foreground group transition w-1/4"
                                    >
                                        <div className="flex items-center">
                                            <span>Asset</span>
                                            {renderSortIcon("name")}
                                        </div>
                                    </th>
                                    <th
                                        onClick={() => handleSort("institution")}
                                        className="p-3 cursor-pointer hover:bg-muted/80 hover:text-foreground group transition w-1/6"
                                    >
                                        <div className="flex items-center">
                                            <span>Custodian Bank / Broker</span>
                                            {renderSortIcon("institution")}
                                        </div>
                                    </th>
                                    <th
                                        onClick={() => handleSort("type")}
                                        className="p-3 cursor-pointer hover:bg-muted/80 hover:text-foreground group transition w-1/5"
                                    >
                                        <div className="flex items-center">
                                            <span>Asset Type</span>
                                            {renderSortIcon("type")}
                                        </div>
                                    </th>
                                    <th className="p-3 text-muted-foreground font-medium w-1/5">Identifying Keys</th>
                                    <th
                                        onClick={() => handleSort("valuation")}
                                        className="p-3 cursor-pointer hover:bg-muted/80 hover:text-foreground group transition text-right w-1/6"
                                    >
                                        <div className="flex items-center justify-end">
                                            <span>Latest Valuation</span>
                                            {renderSortIcon("valuation")}
                                        </div>
                                    </th>
                                    <th className="p-3 text-center w-24">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {filteredAssets.map((asset) => {
                                    const valuation = latestValuations[asset.id];
                                    return (
                                        <tr key={asset.id} className="hover:bg-muted/30 transition-colors">
                                            <td className="p-3 font-semibold text-foreground">
                                                <div className="flex flex-col">
                                                    <span>{asset.name}</span>
                                                    {asset.comments && (
                                                        <span className="text-[10px] text-muted-foreground/80 font-normal max-w-xs truncate" title={asset.comments}>
                                                            {asset.comments}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="p-3 text-muted-foreground">{asset.institution}</td>
                                            <td className="p-3">
                                                <span className="text-[10px] font-medium bg-secondary text-secondary-foreground px-2 py-0.5 rounded">
                                                    {asset.asset_types?.name || "Asset"}
                                                </span>
                                            </td>
                                            <td className="p-3 font-mono text-[11px] text-muted-foreground space-y-0.5">
                                                {asset.iban && <div><span className="text-[9px] font-sans font-medium text-foreground/70 mr-1">[IBAN]</span>{formatIBAN(asset.iban)}</div>}
                                                {asset.ticker && <div><span className="text-[9px] font-sans font-medium text-foreground/70 mr-1">[TICK]</span>{asset.ticker}</div>}
                                                {asset.isin && <div><span className="text-[9px] font-sans font-medium text-foreground/70 mr-1">[ISIN]</span>{asset.isin}</div>}
                                                {!asset.iban && !asset.ticker && !asset.isin && <span className="italic text-muted-foreground/60 font-sans text-xs">—</span>}
                                            </td>
                                            <td className="p-3 text-right">
                                                {valuation ? (
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-primary">{formatCurrency(valuation.balance_amount, locale)}</span>
                                                        <span className="text-[10px] text-muted-foreground">{formatDate(valuation.valuation_date, locale)}</span>                                                    </div>
                                                ) : (
                                                    <span className="italic text-muted-foreground/60">No records</span>
                                                )}
                                            </td>
                                            <td className="p-3">
                                                <div className="flex justify-center items-center gap-1">
                                                    <button
                                                        onClick={() => openEditDialog(asset)}
                                                        className="text-muted-foreground hover:text-primary p-1 rounded transition cursor-pointer"
                                                        title="Edit asset profile"
                                                    >
                                                        <Pencil className="h-3.5 w-3.5" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteAsset(asset.id, asset.name)}
                                                        className="text-muted-foreground hover:text-destructive p-1 rounded transition cursor-pointer"
                                                        title="Remove account entry profile"
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* EDIT ASSET TYPE DIALOG OVERLAY */}
            {editingType && (
                <div
                    className="fixed inset-0 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
                    style={{ zIndex: 9999 }}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="edit-type-title"
                >
                    <div className="relative w-full max-w-md rounded-xl border bg-card p-5 shadow-lg" style={{ zIndex: 10000 }}>
                        <div className="mb-4 flex items-start justify-between gap-3">
                            <div>
                                <h3 id="edit-type-title" className="text-base font-semibold text-foreground">
                                    Edit Asset Type
                                </h3>

                            </div>
                            <button
                                type="button"
                                onClick={closeEditTypeDialog}
                                disabled={loadingEditType}
                                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50 cursor-pointer"
                                aria-label="Close"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        <form onSubmit={handleUpdateType} className="space-y-4">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-medium text-muted-foreground">Asset type label</label>
                                <input
                                    type="text" value={editTypeName} onChange={(e) => setEditTypeName(e.target.value)}
                                    className="border rounded-md p-2 bg-background text-sm" required
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <p className="mt-1 text-xs text-muted-foreground">
                                    Remember to update all the assets of this asset type when changing this classification!
                                </p>
                                <label className="text-xs font-medium text-muted-foreground">Asset classification</label>

                                <select
                                    value={editTypeSlug}
                                    onChange={(e) => setEditTypeSlug(e.target.value)}
                                    className="border rounded-md p-2 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary w-full"
                                    required
                                >
                                    <option value="" disabled>-- Select a classification --</option>
                                    {VALID_TYPE_SLUGS.map((slug) => (
                                        <option key={slug} value={slug}>
                                            {ASSET_TYPE_LABELS[slug]}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {editTypeSlug && (
                                <div className="space-y-2 border rounded-md p-3 bg-muted/40">
                                    <p className="text-xs font-semibold text-muted-foreground mb-1.5">Required Data Parameters:</p>
                                    {(() => {
                                        const reqs = getSlugRequirements(editTypeSlug);
                                        const hasAny = reqs.requires_iban || reqs.requires_ticker || reqs.requires_isin;
                                        if (!hasAny) {
                                            return <p className="text-xs text-muted-foreground italic">None — no additional parameters required.</p>;
                                        }
                                        return (
                                            <div className="grid grid-cols-1 gap-2">
                                                {reqs.requires_iban && (
                                                    <div className="flex items-center gap-2.5 text-sm font-normal">
                                                        <span className="h-3 w-3 rounded-full bg-primary/60 shrink-0" />
                                                        <span>Requires IBAN</span>
                                                    </div>
                                                )}
                                                {reqs.requires_ticker && (
                                                    <div className="flex items-center gap-2.5 text-sm font-normal">
                                                        <span className="h-3 w-3 rounded-full bg-primary/60 shrink-0" />
                                                        <span>Requires Ticker</span>
                                                    </div>
                                                )}
                                                {reqs.requires_isin && (
                                                    <div className="flex items-center gap-2.5 text-sm font-normal">
                                                        <span className="h-3 w-3 rounded-full bg-primary/60 shrink-0" />
                                                        <span>Requires ISIN</span>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })()}
                                </div>
                            )}

                            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end pt-2">
                                <button
                                    type="button"
                                    onClick={closeEditTypeDialog}
                                    disabled={loadingEditType}
                                    className="rounded-md border px-3 py-2 text-sm font-medium transition hover:bg-muted disabled:opacity-50 cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={loadingEditType}
                                    className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50 cursor-pointer"
                                >
                                    {loadingEditType ? "Saving..." : "Save changes"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* EDIT ASSET DIALOG OVERLAY */}
            {editingAsset && (
                <div
                    className="fixed inset-0 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
                    style={{ zIndex: 9999 }}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="edit-asset-title"
                >
                    <div className="relative w-full max-w-2xl rounded-xl border bg-card p-5 shadow-lg max-h-[90vh] overflow-y-auto" style={{ zIndex: 10000 }}>
                        <div className="mb-4 flex items-start justify-between gap-3">
                            <div>
                                <h3 id="edit-asset-title" className="text-base font-semibold text-foreground">
                                    Edit Asset Profile
                                </h3>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    Update structural and identifying parameters for this account.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={closeEditDialog}
                                disabled={loadingEdit}
                                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50 cursor-pointer"
                                aria-label="Close"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        <form onSubmit={handleUpdateAsset} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-medium text-muted-foreground">Mapped Asset Type Definition</label>
                                <select
                                    value={editTypeId} onChange={(e) => setEditTypeId(e.target.value)}
                                    className="border rounded-md p-2 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary w-full"
                                >
                                    {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                </select>
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-medium text-muted-foreground">Account Description Name</label>
                                <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="border rounded-md p-2 bg-background text-sm" required />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-medium text-muted-foreground">Custodian Bank / Broker</label>
                                <input type="text" value={editInstitution} onChange={(e) => setEditInstitution(e.target.value)} className="border rounded-md p-2 bg-background text-sm" required />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-medium text-muted-foreground">Login Portal Url (Optional)</label>
                                <input type="url" value={editLoginUrl} onChange={(e) => setEditLoginUrl(e.target.value)} placeholder="https://login.bank.com" className="border rounded-md p-2 bg-background text-sm" />
                            </div>

                            {editReqs.requires_iban && (
                                <div className="flex flex-col gap-1.5 md:col-span-2">
                                    <label className="text-xs font-medium text-muted-foreground">IBAN Number</label>
                                    <input type="text" value={editIban} onChange={(e) => setEditIban(e.target.value)} placeholder="NL00 BANK 0123 4567 89" className="border rounded-md p-2 bg-background text-sm uppercase" required />
                                </div>
                            )}

                            {editReqs.requires_ticker && (
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-medium text-muted-foreground">Ticker Symbol</label>
                                    <input type="text" value={editTicker} onChange={(e) => setEditTicker(e.target.value)} placeholder="e.g., AAPL, BTC" className="border rounded-md p-2 bg-background text-sm uppercase" required />
                                </div>
                            )}

                            {editReqs.requires_isin && (
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-medium text-muted-foreground">ISIN Number</label>
                                    <input type="text" value={editIsin} onChange={(e) => setEditIsin(e.target.value)} placeholder="US0378331002" className="border rounded-md p-2 bg-background text-sm uppercase" required />
                                </div>
                            )}

                            <div className="flex flex-col gap-1.5 md:col-span-2">
                                <label className="text-xs font-medium text-muted-foreground">Comments / Internal Allocation Directives</label>
                                <textarea value={editComments} onChange={(e) => setEditComments(e.target.value)} className="border rounded-md p-2 bg-background text-sm min-h-16" />
                            </div>

                            <div className="md:col-span-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end pt-2">
                                <button
                                    type="button"
                                    onClick={closeEditDialog}
                                    disabled={loadingEdit}
                                    className="rounded-md border px-3 py-2 text-sm font-medium transition hover:bg-muted disabled:opacity-50 cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={loadingEdit}
                                    className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50 cursor-pointer"
                                >
                                    {loadingEdit ? "Saving..." : "Save changes"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}