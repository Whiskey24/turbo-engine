"use client";
export const dynamic = "force-dynamic";
import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Trash2, Pencil, X } from "lucide-react";

import { supabase } from "@/lib/supabase";
import type { AssetType, PortfolioAssetWithType } from "@/lib/database";
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

const formatToEuroDate = (dateStr: string) => {
    if (!dateStr) return "";
    const [year, month, day] = dateStr.split("-");
    return `${day}-${month}-${year}`;
};

const formatToEuroCurrency = (value: number) => {
    return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(value);
};

interface LatestValuation {
    balance_amount: number;
    valuation_date: string;
}

export default function MasterDataPage() {
    const [types, setTypes] = useState<AssetType[]>([]);
    const [assets, setAssets] = useState<PortfolioAssetWithType[]>([]);
    const [latestValuations, setLatestValuations] = useState<Record<string, LatestValuation>>({});

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

    const [loadingType, setLoadingType] = useState(false);
    const [loadingAsset, setLoadingAsset] = useState(false);

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
                isin: reqs.requires_isin ? isin.toUpperCase() : null,
            },
        ]);

        setLoadingAsset(false);
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

    // --- SAFE DELETION ROUTINES ---
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

    // --- EDIT DIALOG HANDLERS ---
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

    const createReqs = requiresForType(currentActiveRuleSet);
    const editReqs = requiresForType(editRuleSet);

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Master Data Workspace</h1>
                <p className="text-sm text-muted-foreground">Maintain custom structural classification blueprints and assign accounts parameters dynamically.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">

                {/* TYPE CONFIGURATION FRAME */}
                <div className="space-y-6 lg:col-span-1">
                    <Card className="shadow-sm">
                        <CardHeader>
                            <CardTitle className="text-base">1. Maintain Asset Types</CardTitle>
                            <CardDescription>Define system categories rules constraints.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleCreateType} className="space-y-4">
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-medium text-muted-foreground">Type Category Label</label>
                                    <input
                                        type="text" value={newTypeName} onChange={(e) => setNewTypeName(e.target.value)}
                                        placeholder="e.g., Cash, Crypto Tokens" className="border rounded-md p-2 bg-background text-sm" required
                                    />
                                </div>

                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-medium text-muted-foreground">Asset Type Slug</label>
                                    <select
                                        value={typeSlug}
                                        onChange={(e) => setTypeSlug(e.target.value)}
                                        className="border rounded-md p-2 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary w-full"
                                        required
                                    >
                                        <option value="" disabled>-- Select a classification --</option>
                                        {VALID_TYPE_SLUGS.map((slug) => (
                                            <option key={slug} value={slug}>{slug}</option>
                                        ))}
                                    </select>
                                </div>

                                {typeSlug && (
                                    <div className="space-y-2 border rounded-md p-3 bg-muted/40">
                                        <p className="text-xs font-semibold text-muted-foreground mb-1.5">Required Data Parameters (auto-derived):</p>
                                        {(() => {
                                            const reqs = getSlugRequirements(typeSlug);
                                            const hasAny = reqs.requires_iban || reqs.requires_ticker || reqs.requires_isin;
                                            if (!hasAny) {
                                                return <p className="text-xs text-muted-foreground italic">None — no additional parameters required.</p>;
                                            }
                                            return (
                                                <>
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
                                                </>
                                            );
                                        })()}
                                    </div>
                                )}

                                <button type="submit" disabled={loadingType} className="w-full bg-secondary text-secondary-foreground font-medium py-2 rounded-md transition hover:opacity-90 text-sm">
                                    {loadingType ? "Processing..." : "Register Type Template"}
                                </button>
                            </form>
                        </CardContent>
                    </Card>

                    {/* ACTIVE TEMPLATES SHELF */}
                    <div className="space-y-2">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">Active Structural Blueprint Matrix</h4>
                        <div className="bg-card border rounded-md divide-y text-xs">
                            {types.length === 0 ? (
                                <p className="p-3 text-muted-foreground text-center">No categories registered.</p>
                            ) : types.map(t => {
                                const tReqs = requiresForType(t);
                                return (
                                    <div key={t.id} className="p-2.5 flex justify-between items-center group">
                                        <div className="flex flex-col gap-0.5">
                                            <span className="font-semibold text-foreground">{t.name}</span>
                                            <span className="text-[10px] font-mono text-muted-foreground">
                                                {t.type_slug ?? "NO_SLUG"}
                                            </span>
                                            <div className="flex gap-1 text-[9px] font-mono text-muted-foreground">
                                                {tReqs.requires_iban && <span>[IBAN]</span>}
                                                {tReqs.requires_ticker && <span>[TICKER]</span>}
                                                {tReqs.requires_isin && <span>[ISIN]</span>}
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleDeleteType(t.id, t.name)}
                                            className="text-muted-foreground hover:text-destructive p-1 rounded transition opacity-60 hover:opacity-100"
                                            title="Remove Type classification"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* ACCOUNT PROFILE MATRIX FRAME */}
                <div className="lg:col-span-2 space-y-6">
                    <Card className="shadow-sm">
                        <CardHeader>
                            <CardTitle className="text-base">2. Register Asset Accounts</CardTitle>
                            <CardDescription>Setup specific financial accounts tied to database structural rules types.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {types.length === 0 ? (
                                <div className="text-center py-6 text-sm text-muted-foreground">
                                    Register at least one Asset Type template rule on the left before allocating accounts.
                                </div>
                            ) : (
                                <form onSubmit={handleCreateAsset} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-xs font-medium text-muted-foreground">Mapped Asset Type Definition</label>
                                        <select
                                            value={selectedTypeId} onChange={(e) => setSelectedTypeId(e.target.value)}
                                            className="border rounded-md p-2 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary w-full"
                                        >
                                            {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                        </select>
                                    </div>

                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-xs font-medium text-muted-foreground">Account Description Name</label>
                                        <input type="text" value={assetName} onChange={(e) => setAssetName(e.target.value)} placeholder="e.g., Personal Portfolio Reserve" className="border rounded-md p-2 bg-background text-sm" required />
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
                                        <label className="text-xs font-medium text-muted-foreground">Comments / Internal Allocation Directives</label>
                                        <textarea value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Add structural terms or maturity notes here..." className="border rounded-md p-2 bg-background text-sm min-h-16" />
                                    </div>

                                    <div className="md:col-span-2 pt-2">
                                        <button type="submit" disabled={loadingAsset} className="w-full bg-primary text-primary-foreground font-medium py-2 rounded-md transition hover:opacity-90 text-sm">
                                            {loadingAsset ? "Registering Asset Account..." : "Save Configured Asset Profile"}
                                        </button>
                                    </div>
                                </form>
                            )}
                        </CardContent>
                    </Card>

                    {/* ACTIVE REGISTRY ENTITIES CARDS */}
                    <div className="space-y-3">
                        <h3 className="text-base font-semibold px-1">Registered Active Assets</h3>
                        {assets.length === 0 ? (
                            <div className="border border-dashed rounded-xl h-32 flex items-center justify-center text-muted-foreground text-sm bg-card">
                                No active accounts structural matrix mapped yet.
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {assets.map((asset) => (
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
                                            {/* Floating Hover Action buttons */}
                                            <div className="absolute top-4 right-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition">
                                                <button
                                                    onClick={() => openEditDialog(asset)}
                                                    className="text-muted-foreground hover:text-primary p-1 rounded transition"
                                                    title="Edit asset profile"
                                                >
                                                    <Pencil className="h-4 w-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteAsset(asset.id, asset.name)}
                                                    className="text-muted-foreground hover:text-destructive p-1 rounded transition"
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
                                                    <span>Last Valuation: <strong className="font-medium">{formatToEuroDate(latestValuations[asset.id].valuation_date)}</strong></span>
                                                    <span className="font-bold text-primary">{formatToEuroCurrency(latestValuations[asset.id].balance_amount)}</span>
                                                </div>
                                            ) : (
                                                <p className="italic border-t pt-1.5 mt-1.5">No valuation logged yet.</p>
                                            )}
                                            {asset.comments && <p className="italic border-t pt-1.5 mt-1.5">{asset.comments}</p>}
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

            </div>

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
                                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
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
                                    className="rounded-md border px-3 py-2 text-sm font-medium transition hover:bg-muted disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={loadingEdit}
                                    className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
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