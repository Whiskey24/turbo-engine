import YearEndAllocationChart from "@/components/year-end-allocation-chart";

export default function ChartsHistoryPage() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Historical Timelines</h1>
                <p className="text-sm text-muted-foreground">
                    Compounded timeline valuation growth trend maps over time.
                </p>
            </div>

            <YearEndAllocationChart />
        </div>
    );
}
