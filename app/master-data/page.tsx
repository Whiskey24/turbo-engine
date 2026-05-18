"use client";
import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Trash2 } from "lucide-react"; // Imported for cleanup actions

import { supabase } from "@/lib/supabase";
import type { AssetType, PortfolioAssetWithType } from "@/lib/database";
import { usePortfolioDataRefresh } from "@/lib/portfolio-refresh";

export default function MasterDataPage() {
    const [types, setTypes] = useState<AssetType[]>([]);
    const [assets, setAssets] = useState<PortfolioAssetWithType[]>([]);

    // Form States
    const [newTypeName, setNewTypeName] = useState("");
    const [reqIban, setReqIban] = useState(false);
    const [reqTicker, setReqTicker] = useState(false);
    const [reqIsin, setReqIsin] = useState(false);

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

    const fetchData = useCallback(async () => {
        const { data: fetchTypes } = await supabase
            .from("asset_types")
            .select("*")
            .order("name", { ascending: true });

        const { data: fetchAssets } = await supabase
            .from("portfolio_assets")
            .select("*, asset_types(name)")
            .order("name", { ascending: true });

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
    }, []);

    usePortfolioDataRefresh(fetchData);

    const handleCreateType = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoadingType(true);

        const { error } = await supabase.from("asset_types").insert([
            { name: newTypeName, requires_iban: reqIban, requires_ticker: reqTicker, requires_isin: reqIsin },
        ]);

        setLoadingType(false);
        if (!error) {
            setNewTypeName("");
            setReqIban(false);
            setReqTicker(false);
            setReqIsin(false);
            fetchData();
        } else {
            alert(`Error creating type: ${error.message}`);
        }
    };

    const handleCreateAsset = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoadingAsset(true);
        const activeType = types.find(t => t.id === selectedTypeId);

        const { error } = await supabase.from("portfolio_assets").insert([
            {
                type_id: selectedTypeId,
                name: assetName,
                institution,
                login_url: loginUrl || null,
                comments: comments || null,
                iban: activeType?.requires_iban ? iban : null,
                ticker: activeType?.requires_ticker ? ticker.toUpperCase() : null,
                isin: activeType?.requires_isin ? isin.toUpperCase() : null,
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
            // Catch foreign key constraint violation code
            if (error.code === "23503") {
                alert(`Deletion Denied: Cannot delete type "${name}" because active portfolio asset records are currently mapping to it. Remove those accounts first.`);
            } else {
                alert(`Error executing drop operation: ${error.message}`);
            }
        } else {
            fetchData();
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

    const currentActiveRuleSet = types.find(t => t.id === selectedTypeId);

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

                                <div className="space-y-2 border rounded-md p-3 bg-muted/40">
                                    <p className="text-xs font-semibold text-muted-foreground mb-1.5">Required Data Parameters:</p>
                                    <label className="flex items-center gap-2.5 text-sm font-normal cursor-pointer">
                                        <input type="checkbox" checked={reqIban} onChange={(e) => setReqIban(e.target.checked)} className="rounded accent-primary" />
                                        <span>Requires IBAN</span>
                                    </label>
                                    <label className="flex items-center gap-2.5 text-sm font-normal cursor-pointer">
                                        <input type="checkbox" checked={reqTicker} onChange={(e) => setReqTicker(e.target.checked)} className="rounded accent-primary" />
                                        <span>Requires Ticker</span>
                                    </label>
                                    <label className="flex items-center gap-2.5 text-sm font-normal cursor-pointer">
                                        <input type="checkbox" checked={reqIsin} onChange={(e) => setReqIsin(e.target.checked)} className="rounded accent-primary" />
                                        <span>Requires ISIN</span>
                                    </label>
                                </div>

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
                            ) : types.map(t => (
                                <div key={t.id} className="p-2.5 flex justify-between items-center group">
                                    <div className="flex flex-col gap-0.5">
                                        <span className="font-semibold text-foreground">{t.name}</span>
                                        <div className="flex gap-1 text-[9px] font-mono text-muted-foreground">
                                            {t.requires_iban && <span>[IBAN]</span>}
                                            {t.requires_ticker && <span>[TICKER]</span>}
                                            {t.requires_isin && <span>[ISIN]</span>}
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
                            ))}
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

                                    {currentActiveRuleSet?.requires_iban && (
                                        <div className="flex flex-col gap-1.5 md:col-span-2">
                                            <label className="text-xs font-medium text-muted-foreground">IBAN Number</label>
                                            <input type="text" value={iban} onChange={(e) => setIban(e.target.value)} placeholder="NL00 BANK 0123 4567 89" className="border rounded-md p-2 bg-background text-sm uppercase" required />
                                        </div>
                                    )}

                                    {currentActiveRuleSet?.requires_ticker && (
                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-xs font-medium text-muted-foreground">Ticker Symbol</label>
                                            <input type="text" value={ticker} onChange={(e) => setTicker(e.target.value)} placeholder="e.g., AAPL, BTC" className="border rounded-md p-2 bg-background text-sm uppercase" required />
                                        </div>
                                    )}

                                    {currentActiveRuleSet?.requires_isin && (
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
                                            <div className="flex justify-between items-start pr-6">
                                                <div>
                                                    <CardTitle className="text-sm font-bold">{asset.name}</CardTitle>
                                                    <CardDescription className="text-xs">{asset.institution}</CardDescription>
                                                </div>
                                                <span className="text-[10px] font-bold bg-secondary text-secondary-foreground px-2 py-0.5 rounded tracking-wider">
                                                    {asset.asset_types?.name || "Asset"}
                                                </span>
                                            </div>
                                            {/* Floating Trash Action button */}
                                            <button
                                                onClick={() => handleDeleteAsset(asset.id, asset.name)}
                                                className="absolute top-4 right-4 text-muted-foreground hover:text-destructive p-1 rounded transition opacity-0 group-hover:opacity-100"
                                                title="Remove account entry profile"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </CardHeader>
                                        <CardContent className="text-xs space-y-1.5 text-muted-foreground pt-0">
                                            {asset.iban && <p><span className="font-medium text-foreground">IBAN:</span> {asset.iban}</p>}
                                            {asset.ticker && <p><span className="font-medium text-foreground">Ticker:</span> {asset.ticker}</p>}
                                            {asset.isin && <p><span className="font-medium text-foreground">ISIN:</span> {asset.isin}</p>}
                                            {asset.comments && <p className="italic border-t pt-1.5 mt-1.5">{asset.comments}</p>}
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}