export const dynamic = "force-dynamic";
export default function ChartsAllocationPage() {
    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Current Asset Allocation</h1>
                <p className="text-sm text-muted-foreground">Filterable allocation breakdowns (Total Net Worth vs. Savings vs. Investments).</p>
            </div>
            <div className="border border-dashed rounded-xl h-64 flex items-center justify-center text-muted-foreground bg-card text-sm">
                Segmentation charts configuration matrix coming soon...
            </div>
        </div>
    );
}