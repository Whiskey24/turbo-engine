"use client";
import { Cell, Pie, PieChart, Bar, BarChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

interface LogItem {
    account_name: string;
    balance: number;
    log_date: string;
}

const SHADCN_COLORS = ["#2563eb", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

// Helper function to format internal ISO dates (YYYY-MM-DD) into European Display format (DD/MM/YYYY)
const formatToEuroDate = (dateStr: string) => {
    if (!dateStr) return "";
    const [year, month, day] = dateStr.split("-");
    return `${day}/${month}/${year}`;
};

// Helper function to format numbers to European currency format (€ 1.234,56)
const formatToEuroCurrency = (value: number) => {
    return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(value);
};

export default function DashboardCharts({ data }: { data: LogItem[] }) {
    if (data.length === 0) {
        return (
            <div className="h-64 flex items-center justify-center border border-dashed rounded-xl text-muted-foreground text-sm">
                No active asset balances logged yet. Fill out the entry engine form to seed metrics.
            </div>
        );
    }

    // --- Process Data for Pie Chart (Latest Recorded Entry Date) ---
    const latestDate = data.reduce((max, item) => item.log_date > max ? item.log_date : max, data[0].log_date);
    const currentAllocation = data.filter(item => item.log_date === latestDate);
    const totalPortfolio = currentAllocation.reduce((acc, curr) => acc + Number(curr.balance), 0);

    const pieData = currentAllocation.map(item => ({
        name: item.account_name,
        value: Number(item.balance),
        percentage: ((Number(item.balance) / totalPortfolio) * 100).toFixed(1)
    }));

    // --- Process Data for Stacked Bar Chart (Timeline Aggregation) ---
    const uniqueAccounts = Array.from(new Set(data.map(item => item.account_name)));
    const recordsByDate: Record<string, any> = {};

    data.forEach(item => {
        if (!recordsByDate[item.log_date]) {
            // Keep the internal key as standard date for easy sorting, but add a display key
            recordsByDate[item.log_date] = {
                rawDate: item.log_date,
                displayDate: formatToEuroDate(item.log_date)
            };
            uniqueAccounts.forEach(acc => recordsByDate[item.log_date][acc] = 0);
        }
        recordsByDate[item.log_date][item.account_name] = Number(item.balance);
    });

    const barData = Object.values(recordsByDate).sort((a: any, b: any) => a.rawDate.localeCompare(b.rawDate));

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
            {/* Allocation Pie Chart */}
            <Card className="w-full flex flex-col">
                <CardHeader>
                    <CardTitle className="text-base font-semibold">Current Allocation Breakdown</CardTitle>
                    <CardDescription>Metrics for latest logged date: {formatToEuroDate(latestDate)}</CardDescription>
                </CardHeader>
                <CardContent className="h-64 flex justify-center items-center flex-1">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={pieData}
                                dataKey="value"
                                nameKey="name"
                                cx="50%"
                                cy="50%"
                                outerRadius={75}
                                label={({ name, percentage }) => `${name} (${percentage}%)`}
                            >
                                {pieData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={SHADCN_COLORS[index % SHADCN_COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip formatter={(value) => formatToEuroCurrency(Number(value))} />
                        </PieChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            {/* Historical Stacked Bar Chart */}
            <Card className="w-full flex flex-col">
                <CardHeader>
                    <CardTitle className="text-base font-semibold">Historical Accumulation</CardTitle>
                    <CardDescription>Compounded timeline totals by account type</CardDescription>
                </CardHeader>
                <CardContent className="h-64 flex-1">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={barData} margin={{ left: -5, right: 10, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.2} vertical={false} />
                            <XAxis dataKey="displayDate" tickLine={false} axisLine={false} className="text-xs" />
                            <YAxis tickFormatter={(val) => `€${val}`} tickLine={false} axisLine={false} className="text-xs" />
                            <Tooltip formatter={(value) => formatToEuroCurrency(Number(value))} />
                            <Legend iconType="circle" wrapperStyle={{ fontSize: "12px" }} />
                            {uniqueAccounts.map((account, index) => (
                                <Bar key={account} dataKey={account} stackId="a" fill={SHADCN_COLORS[index % SHADCN_COLORS.length]} radius={[2, 2, 0, 0]} />
                            ))}
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>
        </div>
    );
}