export type YearEndChartRow = {
    year: number;
    label: string;
    [assetType: string]: number | string;
};

type AssetWithType = {
    id: string;
    typeName: string;
};

type ValuationPoint = {
    asset_id: string;
    valuation_date: string;
    balance_amount: number;
};

function yearEndDate(year: number): string {
    return `${year}-12-31`;
}

function collectYears(valuations: ValuationPoint[]): number[] {
    if (valuations.length === 0) return [];

    const years = valuations.map((row) => Number.parseInt(row.valuation_date.slice(0, 4), 10));
    const minYear = Math.min(...years);
    const maxYear = Math.max(...years, new Date().getFullYear());

    return Array.from({ length: maxYear - minYear + 1 }, (_, index) => minYear + index);
}

export function buildYearEndAllocationByType(
    assets: AssetWithType[],
    valuations: ValuationPoint[]
): { chartData: YearEndChartRow[]; typeNames: string[] } {
    if (assets.length === 0 || valuations.length === 0) {
        return { chartData: [], typeNames: [] };
    }

    const valuationsByAsset = new Map<string, { date: string; amount: number }[]>();

    for (const valuation of valuations) {
        const history = valuationsByAsset.get(valuation.asset_id) ?? [];
        history.push({
            date: valuation.valuation_date,
            amount: Number(valuation.balance_amount),
        });
        valuationsByAsset.set(valuation.asset_id, history);
    }

    for (const history of valuationsByAsset.values()) {
        history.sort((a, b) => a.date.localeCompare(b.date));
    }

    const typeNamesSet = new Set<string>();
    const chartData: YearEndChartRow[] = [];

    for (const year of collectYears(valuations)) {
        const cutoff = yearEndDate(year);
        const row: YearEndChartRow = {
            year,
            label: `31/12/${year}`,
        };

        let hasValue = false;

        for (const asset of assets) {
            const history = valuationsByAsset.get(asset.id) ?? [];
            let latestBalance = 0;

            for (const point of history) {
                if (point.date <= cutoff) {
                    latestBalance = point.amount;
                } else {
                    break;
                }
            }

            if (latestBalance <= 0) continue;

            hasValue = true;
            const current = Number(row[asset.typeName]) || 0;
            row[asset.typeName] = current + latestBalance;
            typeNamesSet.add(asset.typeName);
        }

        if (hasValue) {
            chartData.push(row);
        }
    }

    return {
        chartData,
        typeNames: Array.from(typeNamesSet).sort((a, b) => a.localeCompare(b)),
    };
}
