"use client";
import { Cell, Pie, PieChart, Bar, BarChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface LogItem {
    account_name: string;
    balance: number;
    log_date: string;
}

const COLORS = ["#2563eb", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

export default function DashboardCharts({ data }: { data: LogItem[] }) {
    if (data.length === 0) return <div className="text-muted-foreground">No data logged yet.</div>;

    // --- Process Data for Pie Chart (Latest Date Available) ---
    const latestDate = data.reduce((max, item) => item.log_date > max ? item.log_date : max, data[0].log_date);
    const currentAllocation = data.filter(item => item.log_date === latestDate);
    const totalPortfolio = currentAllocation.reduce((acc, curr) => acc + Number(curr.balance), 0);

    const pieData = currentAllocation.map(item => ({
        name: item.account_name,
        value: Number(item.balance),
        percentage: ((Number(item.balance) / totalPortfolio) * 100).toFixed(1)
    }));

    // --- Process Data for Stacked Bar Chart (Chronological Over Time) ---
    const uniqueAccounts = Array.from(new Set(data.map(item => item.account_name)));
    const recordsByDate: Record<string, any> = {};

    data.forEach(item => {
        if (!recordsByDate[item.log_date]) {
            recordsByDate[item.log_date] = { date: item.log_date };
            uniqueAccounts.forEach(acc => recordsByDate[item.log_date][acc] = 0);
        }
        recordsByDate[item.log_date][item.account_name] = Number(item.balance);
    });

    const barData = Object.values(recordsByDate).sort((a: any, b: any) => a.date.localeCompare(b.date));

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-6xl">
            {/* Allocation Pie Chart */}
            <Card className="w-full">
                <CardHeader>
                    <CardTitle>Current Position Asset Allocation ({latestDate})</CardTitle>
                </CardHeader>
                <CardContent className="h-72 flex justify-center items-center">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percentage }) => `${name} (${percentage}%)`}>
                                {pieData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip formatter={(value) => `$${Number(value).toLocaleString()}`} />
                        </PieChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            {/* Historical Stacked Bar Chart */}
            <Card className="w-full">
                <CardHeader>
                    <CardTitle>Historical Balance Over Time</CardTitle>
                </CardHeader>
                <CardContent className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={barData} margin={{ left: -10, right: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                            <XAxis dataKey="date" tickLine={false} />
                            <YAxis tickFormatter={(val) => `$${val}`} />
                            <Tooltip formatter={(value) => `$${Number(value).toLocaleString()}`} />
                            <Legend />
                            {uniqueAccounts.map((account, index) => (
                                <Bar key={account} dataKey={account} stackId="a" fill={COLORS[index % COLORS.length]} />
                            ))}
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>
        </div>
    );
}