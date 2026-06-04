// lib/test-data.ts
//
// All dates are generated relative to the current year so the most recent
// transactions always fall in the year the module is loaded.
// Small dataset: 3-year window (currentYear-2 → currentYear)
// Large dataset: 10-year window (currentYear-9 → currentYear)
//
// Regenerate the TSV files whenever the current year rolls over.

type Row = (string | number | null | undefined)[];

const CURRENT_YEAR = new Date().getFullYear();

// ── Year helpers ─────────────────────────────────────────────────────────────
const LB = CURRENT_YEAR - 9;          // large base year (LY0)
const SB = CURRENT_YEAR - 2;          // small base year (SY0)
const ly = (n: number) => LB + n;     // large year by offset 0–9
const sy = (n: number) => SB + n;     // small year by offset 0–2

// transaction datetime strings
const ldt = (n: number, mmdd: string) => `${ly(n)}-${mmdd}T10:00:00Z`;
const sdt = (n: number, mmdd: string) => `${sy(n)}-${mmdd}T10:00:00Z`;
// valuation date strings
const lvd = (n: number, mmdd: string) => `${ly(n)}-${mmdd}`;
const svd = (n: number, mmdd: string) => `${sy(n)}-${mmdd}`;

// Bond names and maturities (always several years in the future)
const LARGE_BOND = `German 4% Bond ${CURRENT_YEAR + 6}`;
const SMALL_BOND = `German 4% Bond ${CURRENT_YEAR + 4}`;
const LARGE_BOND_MAT = `${CURRENT_YEAR + 6}-01-04`;
const SMALL_BOND_MAT = `${CURRENT_YEAR + 4}-01-04`;
const LARGE_BOND_FCPN = `${ly(4)}-07-04`;   // first coupon ~4 years in
const SMALL_BOND_FCPN = `${sy(0)}-07-04`;   // first coupon same year as dataset start

// ── TSV serialiser ────────────────────────────────────────────────────────────
function tsv(headers: string[], rows: Row[]): string {
    const esc = (v: string | number | null | undefined) => v == null ? "" : String(v);
    return [headers, ...rows].map(r => r.map(esc).join("\t")).join("\n");
}

const ASSET_H = [
    "type_name", "type_slug", "name", "institution", "login_url", "comments",
    "iban", "ticker", "isin",
    "nominal_value", "coupon_rate", "coupon_frequency", "maturity_date", "first_coupon_date", "day_count_basis",
];
const VALUATION_H = ["asset_name", "valuation_date", "balance_amount"];
const TX_H = [
    "asset_name", "transaction_type", "transacted_at", "settled_at",
    "quantity", "price_per_unit", "total_amount", "fee", "tax_amount",
    "currency", "exchange_rate", "broker", "external_ref", "notes", "accrued_interest",
];

// ── Quarterly valuation builder ───────────────────────────────────────────────
// values[yearIndex][0..3] = Q1..Q4 amounts; null = skip that quarter
function quarterlyRows(name: string, baseYear: number, values: (number | null)[][]): Row[] {
    const QMMDD = ["03-31", "06-30", "09-30", "12-31"];
    const rows: Row[] = [];
    values.forEach((qs, yi) => {
        const year = baseYear + yi;
        qs.forEach((v, qi) => {
            if (v !== null) rows.push([name, `${year}-${QMMDD[qi]}`, v]);
        });
    });
    return rows;
}

// Interpolate quarters between known year-end targets
function interpolatedQuarterly(name: string, baseYear: number, yearEndValues: Record<number, number>, firstYearQ1?: number): Row[] {
    const QMMDD = ["03-31", "06-30", "09-30", "12-31"];
    const rows: Row[] = [];
    const years = Object.keys(yearEndValues).map(Number).sort();
    years.forEach(y => {
        const ye = yearEndValues[y];
        const ys = yearEndValues[y - 1] ?? firstYearQ1 ?? (ye - (ye * 0.15));
        [0, 1, 2, 3].forEach(q =>
            rows.push([name, `${y}-${QMMDD[q]}`, Math.round(ys + (ye - ys) * (q + 1) / 4)])
        );
    });
    return rows;
}

// ============================================================================
// SMALL TEST DATASET  (5 categories, 7 assets, 3-year window)
//
// ── Categories ───────────────────────────────────────────────────────────────
//   Savings      | ING Savings Account, Emergency Fund
//   Equities     | Apple Inc., Vanguard FTSE All-World ETF
//   Crypto       | Bitcoin
//   Fixed Income | <SMALL_BOND>
//   Real Estate  | Family Home
//
// ── Valuation highlights ─────────────────────────────────────────────────────
//   Emergency Fund: €15,000 throughout SY0, drains to €0 in SY1-Q4
//     (used for renovation), stays €0 in SY2
//   Family Home: no entry in SY0 (not yet purchased); SY0-12-31 €280,000;
//     SY1-12-31 €293,000 (post-renovation appreciation)
//
// ── Expected results after import ────────────────────────────────────────────
//   Realized P&L = +€2,377.50
//     AAPL SELL 30@178 on SY2-02-15: proceeds=5332.50, cost=30×155=4650 → +682.50
//     BTC  SELL 0.05@58000 on SY2-03-15: proceeds=2895, cost=0.05×24000=1200 → +1695
//   Coupon income = €200  (2 × semi-annual €100 payments on 5 bonds)
// ============================================================================

export const SMALL_VALIDATION = {
    realizedPnl: 2377.50,
    couponIncome: 200.00,
    breakdown: "AAPL +€682.50 · BTC +€1,695.00",
};

const SMALL_ASSETS: Row[] = [
    ["Savings", "BANK_ACCOUNT", "ING Savings Account", "ING Bank", "https://mijn.ing.nl", "", "NL91INGB0001234567", "", "", "", "", "", "", "", ""],
    ["Savings", "BANK_ACCOUNT", "Emergency Fund", "ING Bank", "https://mijn.ing.nl", "Accessible savings buffer", "NL91INGB0009876543", "", "", "", "", "", "", "", ""],
    ["Equities", "STOCK", "Apple Inc.", "DEGIRO", "https://app.degiro.com", "", "", "AAPL", "US0378331005", "", "", "", "", "", ""],
    ["Equities", "FUND_ETF", "Vanguard FTSE All-World ETF", "DEGIRO", "https://app.degiro.com", "", "", "VWRL", "IE00B3RBWM25", "", "", "", "", "", ""],
    ["Crypto", "CRYPTO", "Bitcoin", "Coinbase", "https://coinbase.com", "", "", "BTC", "", "", "", "", "", "", ""],
    ["Fixed Income", "BOND", SMALL_BOND, "Interactive Brokers", "https://ibkr.com", "", "", "", "DE000103053A1", "1000", "0.04", "2", SMALL_BOND_MAT, SMALL_BOND_FCPN, "30/360"],
    ["Real Estate", "REAL_ESTATE", "Family Home", "Own Property", "", "Primary residence", "", "", "", "", "", "", "", "", ""],
];

// ING Savings: quarterly SY0–SY2 (Q1 only for current year)
const smallIngVals = quarterlyRows("ING Savings Account", SB, [
    [5000, 5500, 6000, 6500],   // SY0
    [7000, 7500, 8000, 8500],   // SY1
    [9000, null, null, null],   // SY2 — Q1 only
]);

// Emergency Fund: full SY0; drains through SY1; zero SY2
const smallEFVals = quarterlyRows("Emergency Fund", SB, [
    [15000, 15000, 15000, 15000],  // SY0 — fully funded
    [15000, 15000, 5000, 0],  // SY1 — spent in Q3/Q4 on renovation
    [0, null, null, null],  // SY2 — still zero
]);

// Family Home: no entry SY0 (not bought yet), annual SY0 year-end + SY1
const smallHomeVals: Row[] = [
    ["Family Home", svd(0, "12-31"), 280000],
    ["Family Home", svd(1, "12-31"), 293000],
];

const SMALL_VALUATIONS: Row[] = [...smallIngVals, ...smallEFVals, ...smallHomeVals];

// Transactions: all BUYs in SY1, SELLs in SY2
const SMALL_TX: Row[] = [
    [" Apple Inc.", "BUY", sdt(1, "01-15"), "", 50, 155.00, 7757.50, 7.50, 0, "EUR", 1, "DEGIRO", "", "", ""],
    ["Apple Inc.", "BUY", sdt(1, "06-10"), "", 25, 148.00, 3705.00, 5.00, 0, "EUR", 1, "DEGIRO", "", "", ""],
    ["Vanguard FTSE All-World ETF", "BUY", sdt(1, "03-01"), "", 20, 94.00, 1885.00, 5.00, 0, "EUR", 1, "DEGIRO", "", "", ""],
    ["Bitcoin", "BUY", sdt(1, "02-01"), "", 0.1, 24000.00, 2405.00, 5.00, 0, "EUR", 1, "Coinbase", "", "", ""],
    [SMALL_BOND, "BUY", sdt(1, "05-15"), "", 5, 985.00, 4962.00, 12.00, 0, "EUR", 1, "Interactive Brokers", "", "", 25.00],
    ["Apple Inc.", "SELL", sdt(2, "02-15"), "", 30, 178.00, 5332.50, 7.50, 0, "EUR", 1, "DEGIRO", "", "", ""],
    ["Bitcoin", "SELL", sdt(2, "03-15"), "", 0.05, 58000.00, 2895.00, 5.00, 0, "EUR", 1, "Coinbase", "", "", ""],
    [SMALL_BOND, "COUPON", sdt(1, "07-04"), "", 0, 0, 100.00, 0, 0, "EUR", 1, "", "", "Semi-annual coupon", ""],
    [SMALL_BOND, "COUPON", sdt(2, "01-04"), "", 0, 0, 100.00, 0, 0, "EUR", 1, "", "", "Semi-annual coupon", ""],
];

// Fix leading space typo in first row
(SMALL_TX[0] as Row)[0] = "Apple Inc.";

export function smallAssetsTsv() { return tsv(ASSET_H, SMALL_ASSETS); }
export function smallValuationsTsv() { return tsv(VALUATION_H, SMALL_VALUATIONS); }
export function smallTransactionsTsv() { return tsv(TX_H, SMALL_TX); }

// ============================================================================
// LARGE TEST DATASET  (8 categories, 14 assets, 10-year window LY0–LY9)
//
// ── Categories & assets ──────────────────────────────────────────────────────
//   Savings       | ING Savings Account (steady growth)
//                 | High-Yield Savings  (zero LY0–LY1, opens LY2, grows to 32k)
//   Current Accts | Personal Current    (fluctuates, sometimes near-zero)
//                 | Joint Account       (opens LY1, goes to zero LY5-Q4, stays 0)
//   Equities      | Apple Inc. (STOCK)
//                 | Microsoft Corp. (STOCK)
//                 | Vanguard FTSE All-World ETF (FUND_ETF)
//                 | iShares Core MSCI World (FUND_ETF)
//   Fixed Income  | <LARGE_BOND> (BOND)
//   Crypto        | Bitcoin
//                 | Ethereum (sold entirely LY7, reopened LY8)
//   Real Estate   | Amsterdam Apartment (annual)
//   Pension       | Company Pension Fund (quarterly, steady growth + dip LY6-Q2)
//   Commodities   | iShares Physical Gold ETC (no position LY0–LY2; sold LY5; reopened LY7)
//
// ── Realized P&L (lot_matches) ───────────────────────────────────────────────
//   AAPL  LY3  SELL 100: proceeds= 4112.00, cost=100×22.50=2250.00  → +1862.00
//   AAPL  LY6  SELL  75: proceeds=11132.00, cost=50×19.80+25×26.40  → +9482.00
//   AAPL  LY8  SELL  50: proceeds= 7758.00, cost=50×26.40=1320.00   → +6438.00
//   MSFT  LY5  SELL  40: proceeds= 7872.00, cost=40×38.00=1520.00   → +6352.00
//   MSFT  LY9  SELL  30: proceeds=11541.00, cost=10×38+20×82.50     → +9511.00
//   VWRL  LY6  SELL  55: proceeds= 5356.00, cost=40×54+15×62.50     → +2258.50
//   IWDA  LY7  SELL  80: proceeds= 5951.50, cost=50×42+30×45.50     → +2486.50
//   Bond  LY7  SELL   5: proceeds= 4957.50, cost=5×1012=5060.00     → -102.50
//   BTC   LY4  SELL   1: proceeds= 9175.00, cost=1×920=920.00       → +8255.00
//   BTC   LY6  SELL   1: proceeds=51925.00, cost=1×920=920.00       → +51005.00
//   ETH   LY6  SELL   5: proceeds=20970.00, cost=5×820=4100.00      → +16870.00
//   ETH   LY7  SELL   5: proceeds= 5735.00, cost=5×820=4100.00      → +1635.00  ← all ETH gone
//   Gold  LY5  SELL 150: proceeds= 2917.50, cost=100×15+50×17=2350  → +567.50   ← all Gold gone
//   GRAND TOTAL REALIZED P&L = +€116,620.00
//
// ── Income ───────────────────────────────────────────────────────────────────
//   Bond coupons (LY4 to LY9): 6 payments × €200 + 4 payments × €100 = €1,600
//   MSFT dividends LY1–LY9: 35+42+47.50+55+60+65+75+80+40 = €499.50
//
// ── Open cost basis (tax_lots, quantity_remaining > 0) ───────────────────────
//   AAPL 60@87.30=5238 | MSFT 10@38=380 | MSFT 25@275=6875
//   VWRL 15@62.50=937.50 | VWRL 25@71.20=1780 | VWRL 35@92=3220
//   IWDA 10@45.50=455 | IWDA 30@38=1140 | IWDA 25@86=2150
//   Bond 5@1012=5060 | BTC 0.5@9800=4900 | BTC 0.25@39500=9875
//   ETH 8@2200=17600 | Gold 80@22=1760 | Gold 40@25=1000
//   TOTAL OPEN COST BASIS = €62,370.50
//
// ── Year-end asset_valuations totals (Dec 31, savings + pension + real estate)
//   LY0: ING 7000  + Pers 1800 + Joint   0 + HY    0 + Pension  6500 + Apt 185000 = 200300
//   LY1: ING 9000  + Pers 2100 + Joint 2500 + HY    0 + Pension  9200 + Apt 200000 = 222800
//   LY2: ING 11000 + Pers 2400 + Joint 3100 + HY 6500 + Pension 12300 + Apt 220000 = 255300
//   LY3: ING 13000 + Pers 1200 + Joint 4000 + HY11000 + Pension 16000 + Apt 245000 = 290200
//   LY4: ING 15000 + Pers 2800 + Joint 2200 + HY15500 + Pension 21000 + Apt 270000 = 326500
//   LY5: ING 17000 + Pers 3000 + Joint    0 + HY19500 + Pension 27000 + Apt 290000 = 356500
//   LY6: ING 19000 + Pers 1900 + Joint    0 + HY22500 + Pension 28500 + Apt 330000 = 401900
//   LY7: ING 21000 + Pers 1500 + Joint    0 + HY26000 + Pension 36000 + Apt 350000 = 434500
//   LY8: ING 23000 + Pers 3200 + Joint    0 + HY29000 + Pension 45000 + Apt 335000 = 435200
//   LY9: incomplete year (Q1 only) — year-end total not available
// ============================================================================

export const LARGE_VALIDATION = {
    totalRealizedPnl: 116620.00,
    totalOpenBasis: 62370.50,
    couponIncome: 1600.00,
    dividendIncome: 499.50,
    // Year-end asset_valuations totals for LY0–LY8 (LY9 = current year, incomplete)
    yearEndTotals: [
        { year: ly(0), total: 200300 },
        { year: ly(1), total: 222800 },
        { year: ly(2), total: 255300 },
        { year: ly(3), total: 290200 },
        { year: ly(4), total: 326500 },
        { year: ly(5), total: 356500 },
        { year: ly(6), total: 401900 },
        { year: ly(7), total: 434500 },
        { year: ly(8), total: 435200 },
    ],
};

// ── Large assets ─────────────────────────────────────────────────────────────

const LARGE_ASSETS: Row[] = [
    ["Savings", "BANK_ACCOUNT", "ING Savings Account", "ING Bank", "https://mijn.ing.nl", "", "NL91INGB0001234567", "", "", "", "", "", "", "", ""],
    ["Savings", "BANK_ACCOUNT", "High-Yield Savings Account", "ING Bank", "https://mijn.ing.nl", "Opened LY2, zero before that", "NL91INGB0008765432", "", "", "", "", "", "", "", ""],
    ["Current Accts", "BANK_ACCOUNT", "Personal Current Account", "ABN AMRO", "https://www.abnamro.nl", "", "NL91ABNA0001234567", "", "", "", "", "", "", "", ""],
    ["Current Accts", "BANK_ACCOUNT", "Joint Current Account", "ABN AMRO", "https://www.abnamro.nl", "Closed LY5-Q4", "NL91ABNA0009876543", "", "", "", "", "", "", "", ""],
    ["Equities", "STOCK", "Apple Inc.", "DEGIRO", "https://app.degiro.com", "", "", "AAPL", "US0378331005", "", "", "", "", "", ""],
    ["Equities", "STOCK", "Microsoft Corp.", "DEGIRO", "https://app.degiro.com", "", "", "MSFT", "US5949181045", "", "", "", "", "", ""],
    ["Equities", "FUND_ETF", "Vanguard FTSE All-World ETF", "DEGIRO", "https://app.degiro.com", "", "", "VWRL", "IE00B3RBWM25", "", "", "", "", "", ""],
    ["Equities", "FUND_ETF", "iShares Core MSCI World", "DEGIRO", "https://app.degiro.com", "", "", "IWDA", "IE00B4L5Y983", "", "", "", "", "", ""],
    ["Fixed Income", "BOND", LARGE_BOND, "Interactive Brokers", "https://ibkr.com", "", "", "", "DE0001102531", "1000", "0.04", "2", LARGE_BOND_MAT, LARGE_BOND_FCPN, "30/360"],
    ["Crypto", "CRYPTO", "Bitcoin", "Coinbase", "https://coinbase.com", "", "", "BTC", "", "", "", "", "", "", ""],
    ["Crypto", "CRYPTO", "Ethereum", "Coinbase", "https://coinbase.com", "Fully sold LY7, reopened LY8", "", "ETH", "", "", "", "", "", "", ""],
    ["Real Estate", "REAL_ESTATE", "Amsterdam Apartment", "Own Property", "", "Purchased pre-dataset", "", "", "", "", "", "", "", "", ""],
    ["Pension", "FUND_ETF", "Company Pension Fund", "Aegon", "https://www.aegon.nl", "Employer contributions included", "", "AEGON", "", "", "", "", "", "", ""],
    ["Commodities", "FUND_ETF", "iShares Physical Gold ETC", "Interactive Brokers", "https://ibkr.com", "No position LY0-LY2; sold LY5; reopened LY7", "", "IGLN", "IE00B4ND3602", "", "", "", "", "", ""],
];

// ── Large valuations ─────────────────────────────────────────────────────────

// ING Savings: steady growth, quarterly LY0–LY9 (Q1 only for LY9)
const largeIngVals = interpolatedQuarterly(
    "ING Savings Account", LB,
    {
        [ly(0)]: 7000, [ly(1)]: 9000, [ly(2)]: 11000, [ly(3)]: 13000, [ly(4)]: 15000,
        [ly(5)]: 17000, [ly(6)]: 19000, [ly(7)]: 21000, [ly(8)]: 23000
    },
    5000
).concat([["ING Savings Account", lvd(9, "03-31"), 24500]]);

// High-Yield Savings: explicit zeros LY0–LY1, opens LY2, grows to 32k
const largeHYVals = quarterlyRows("High-Yield Savings Account", LB, [
    [0, 0, 0, 0],  // LY0 — not yet opened
    [0, 0, 0, 0],  // LY1 — not yet opened
    [2000, 3500, 5000, 6500],  // LY2 — opened with initial deposit
    [7500, 8500, 9500, 11000],  // LY3
    [12000, 13500, 14500, 15500],  // LY4
    [16000, 17500, 18000, 19500],  // LY5
    [20000, 21500, 22000, 22500],  // LY6
    [23000, 24500, 25000, 26000],  // LY7
    [26500, 27500, 28000, 29000],  // LY8
    [29500, null, null, null],  // LY9 — Q1 only
]);

// Personal Current Account: fluctuates, sometimes near-zero
const largePersVals = quarterlyRows("Personal Current Account", LB, [
    [1200, 2800, 500, 1800],  // LY0
    [650, 3200, 200, 2100],  // LY1
    [450, 1900, 800, 2400],  // LY2
    [300, 1500, 600, 1200],  // LY3 — lowest year
    [1800, 3500, 1200, 2800],  // LY4
    [700, 250, 1100, 3000],  // LY5 — dip to €250 in Q2
    [800, 1600, 400, 1900],  // LY6
    [2200, 600, 300, 1500],  // LY7
    [900, 2700, 1800, 3200],  // LY8
    [1400, null, null, null],  // LY9 — Q1 only
]);

// Joint Current Account: opens LY1, drains to zero in LY5-Q4, stays zero
const largeJointVals = quarterlyRows("Joint Current Account", LB, [
    [0, 0, 0, 0],  // LY0 — account not yet opened
    [1500, 2200, 1800, 2500],  // LY1 — opened
    [2800, 3200, 2600, 3100],  // LY2
    [3500, 3800, 3200, 4000],  // LY3
    [3600, 2900, 2500, 2200],  // LY4
    [1800, 1200, 800, 0],  // LY5 — closed in Q4
    [0, 0, 0, 0],  // LY6 — stays zero
    [0, 0, 0, 0],  // LY7
    [0, 0, 0, 0],  // LY8
    [0, null, null, null],  // LY9 — Q1 only, still zero
]);

// Company Pension Fund: steady growth with a market-dip in LY6-Q2
const largePensionVals = quarterlyRows("Company Pension Fund", LB, [
    [5000, 5500, 6000, 6500],  // LY0
    [7200, 7800, 8500, 9200],  // LY1
    [10000, 10800, 11500, 12300],  // LY2
    [13200, 14000, 15000, 16000],  // LY3
    [17200, 18500, 19800, 21000],  // LY4
    [22500, 24000, 25500, 27000],  // LY5
    [28000, 24500, 26000, 28500],  // LY6 — Q2 market dip, recovers by Q4
    [30000, 32000, 34000, 36000],  // LY7
    [38000, 40500, 43000, 45000],  // LY8
    [47500, null, null, null],  // LY9 — Q1 only
]);

// Amsterdam Apartment: annual LY0–LY8 (LY9 year-end is in the future)
const largeAptVals: Row[] = [
    ["Amsterdam Apartment", lvd(0, "12-31"), 185000],
    ["Amsterdam Apartment", lvd(1, "12-31"), 200000],
    ["Amsterdam Apartment", lvd(2, "12-31"), 220000],
    ["Amsterdam Apartment", lvd(3, "12-31"), 245000],
    ["Amsterdam Apartment", lvd(4, "12-31"), 270000],
    ["Amsterdam Apartment", lvd(5, "12-31"), 290000],
    ["Amsterdam Apartment", lvd(6, "12-31"), 330000],
    ["Amsterdam Apartment", lvd(7, "12-31"), 350000],
    ["Amsterdam Apartment", lvd(8, "12-31"), 335000],
];

function largeValuations(): Row[] {
    return [
        ...largeIngVals,
        ...largeHYVals,
        ...largePersVals,
        ...largeJointVals,
        ...largePensionVals,
        ...largeAptVals,
    ];
}

// ── Large transactions ────────────────────────────────────────────────────────
// All in chronological order (required for FIFO trigger correctness).
// BUY  total = qty × price + fee  [+ accrued_interest for bond buys]
// SELL total = qty × price − fee  [+ accrued_interest for bond sells]
// COUPON/DIVIDEND: qty=0, price=0, total=income amount

const LARGE_TX: Row[] = [
    // LY0
    ["Apple Inc.", "BUY", ldt(0, "02-10"), "", 100, 22.50, 2257.50, 7.50, 0, "EUR", 1, "DEGIRO", "", "", ""],
    ["Microsoft Corp.", "BUY", ldt(0, "07-01"), "", 50, 38.00, 1905.00, 5.00, 0, "EUR", 1, "DEGIRO", "", "", ""],
    // LY1
    ["Vanguard FTSE All-World ETF", "BUY", ldt(1, "02-15"), "", 40, 54.00, 2165.00, 5.00, 0, "EUR", 1, "DEGIRO", "", "", ""],
    ["Apple Inc.", "BUY", ldt(1, "05-15"), "", 50, 19.80, 994.00, 4.00, 0, "EUR", 1, "DEGIRO", "", "", ""],
    ["Microsoft Corp.", "DIVIDEND", ldt(1, "12-15"), "", 0, 0, 35.00, 0, 0, "EUR", 1, "", "", "Annual dividend", ""],
    // LY2
    ["Bitcoin", "BUY", ldt(2, "01-15"), "", 2, 920.00, 1855.00, 15.00, 0, "EUR", 1, "Coinbase", "", "", ""],
    ["iShares Core MSCI World", "BUY", ldt(2, "03-10"), "", 50, 42.00, 2105.00, 5.00, 0, "EUR", 1, "DEGIRO", "", "", ""],
    ["Vanguard FTSE All-World ETF", "BUY", ldt(2, "07-10"), "", 30, 62.50, 1880.00, 5.00, 0, "EUR", 1, "DEGIRO", "", "", ""],
    ["Apple Inc.", "BUY", ldt(2, "09-20"), "", 75, 26.40, 1983.00, 3.00, 0, "EUR", 1, "DEGIRO", "", "", ""],
    ["Bitcoin", "BUY", ldt(2, "12-01"), "", 0.5, 9800.00, 4930.00, 30.00, 0, "EUR", 1, "Coinbase", "", "", ""],
    ["Microsoft Corp.", "DIVIDEND", ldt(2, "12-15"), "", 0, 0, 42.00, 0, 0, "EUR", 1, "", "", "Annual dividend", ""],
    // LY3
    ["Ethereum", "BUY", ldt(3, "02-20"), "", 10, 820.00, 8220.00, 20.00, 0, "EUR", 1, "Coinbase", "", "", ""],
    ["iShares Physical Gold ETC", "BUY", ldt(3, "02-10"), "", 100, 15.00, 1505.00, 5.00, 0, "EUR", 1, "Interactive Brokers", "", "", ""],
    ["Microsoft Corp.", "BUY", ldt(3, "03-15"), "", 30, 82.50, 2480.00, 5.00, 0, "EUR", 1, "DEGIRO", "", "", ""],
    ["Apple Inc.", "SELL", ldt(3, "11-15"), "", 100, 41.20, 4112.00, 8.00, 0, "EUR", 1, "DEGIRO", "", "", ""], // → AAPL +1862
    ["Microsoft Corp.", "DIVIDEND", ldt(3, "12-15"), "", 0, 0, 47.50, 0, 0, "EUR", 1, "", "", "Annual dividend", ""],
    // LY4
    ["iShares Core MSCI World", "BUY", ldt(4, "01-15"), "", 40, 45.50, 1825.00, 5.00, 0, "EUR", 1, "DEGIRO", "", "", ""],
    ["iShares Physical Gold ETC", "BUY", ldt(4, "03-20"), "", 50, 17.00, 855.00, 5.00, 0, "EUR", 1, "Interactive Brokers", "", "", ""],
    [LARGE_BOND, "BUY", ldt(4, "05-20"), "", 10, 1012.00, 10185.00, 15.00, 0, "EUR", 1, "Interactive Brokers", "", "", 50.00],
    [LARGE_BOND, "COUPON", ldt(4, "07-04"), "", 0, 0, 200.00, 0, 0, "EUR", 1, "", "", "Semi-annual coupon 10 bonds", ""],
    ["Bitcoin", "SELL", ldt(4, "07-15"), "", 1, 9200.00, 9175.00, 25.00, 0, "EUR", 1, "Coinbase", "", "", ""],  // → BTC +8255
    ["Vanguard FTSE All-World ETF", "BUY", ldt(4, "09-10"), "", 25, 71.20, 1785.00, 5.00, 0, "EUR", 1, "DEGIRO", "", "", ""],
    ["Microsoft Corp.", "DIVIDEND", ldt(4, "12-15"), "", 0, 0, 55.00, 0, 0, "EUR", 1, "", "", "Annual dividend", ""],
    // LY5
    [LARGE_BOND, "COUPON", ldt(5, "01-04"), "", 0, 0, 200.00, 0, 0, "EUR", 1, "", "", "Semi-annual coupon 10 bonds", ""],
    ["iShares Core MSCI World", "BUY", ldt(5, "03-20"), "", 30, 38.00, 1145.00, 5.00, 0, "EUR", 1, "DEGIRO", "", "", ""],
    [LARGE_BOND, "COUPON", ldt(5, "07-04"), "", 0, 0, 200.00, 0, 0, "EUR", 1, "", "", "Semi-annual coupon 10 bonds", ""],
    ["Apple Inc.", "BUY", ldt(5, "07-10"), "", 60, 87.30, 5247.00, 9.00, 0, "EUR", 1, "DEGIRO", "", "", ""],
    ["iShares Physical Gold ETC", "SELL", ldt(5, "08-15"), "", 150, 19.50, 2917.50, 7.50, 0, "EUR", 1, "Interactive Brokers", "", "", ""], // → Gold +567.50, all gone
    ["Microsoft Corp.", "SELL", ldt(5, "08-20"), "", 40, 197.00, 7872.00, 8.00, 0, "EUR", 1, "DEGIRO", "", "", ""],  // → MSFT +6352
    ["Microsoft Corp.", "DIVIDEND", ldt(5, "12-15"), "", 0, 0, 60.00, 0, 0, "EUR", 1, "", "", "Annual dividend", ""],
    // LY6
    [LARGE_BOND, "COUPON", ldt(6, "01-04"), "", 0, 0, 200.00, 0, 0, "EUR", 1, "", "", "Semi-annual coupon 10 bonds", ""],
    ["Bitcoin", "SELL", ldt(6, "04-10"), "", 1, 52000.00, 51925.00, 75.00, 0, "EUR", 1, "Coinbase", "", "", ""],  // → BTC +51005
    ["Vanguard FTSE All-World ETF", "SELL", ldt(6, "04-20"), "", 55, 97.50, 5356.00, 6.50, 0, "EUR", 1, "DEGIRO", "", "", ""],  // → VWRL +2258.50
    [LARGE_BOND, "COUPON", ldt(6, "07-04"), "", 0, 0, 200.00, 0, 0, "EUR", 1, "", "", "Semi-annual coupon 10 bonds", ""],
    ["Apple Inc.", "SELL", ldt(6, "09-15"), "", 75, 148.50, 11132.00, 5.50, 0, "EUR", 1, "DEGIRO", "", "", ""],  // → AAPL +9482
    ["Ethereum", "SELL", ldt(6, "11-15"), "", 5, 4200.00, 20970.00, 30.00, 0, "EUR", 1, "Coinbase", "", "", ""], // → ETH +16870
    ["Microsoft Corp.", "DIVIDEND", ldt(6, "12-15"), "", 0, 0, 65.00, 0, 0, "EUR", 1, "", "", "Annual dividend", ""],
    // LY7
    [LARGE_BOND, "COUPON", ldt(7, "01-04"), "", 0, 0, 200.00, 0, 0, "EUR", 1, "", "", "Semi-annual coupon 10 bonds", ""],
    ["Microsoft Corp.", "BUY", ldt(7, "01-10"), "", 25, 275.00, 6881.00, 6.00, 0, "EUR", 1, "DEGIRO", "", "", ""],
    [LARGE_BOND, "SELL", ldt(7, "04-15"), "", 5, 990.00, 4957.50, 12.50, 0, "EUR", 1, "Interactive Brokers", "", "", 20.00], // → Bond -102.50
    ["iShares Core MSCI World", "SELL", ldt(7, "06-10"), "", 80, 74.50, 5951.50, 8.50, 0, "EUR", 1, "DEGIRO", "", "", ""],  // → IWDA +2486.50
    ["Ethereum", "SELL", ldt(7, "06-20"), "", 5, 1150.00, 5735.00, 15.00, 0, "EUR", 1, "Coinbase", "", "", ""], // → ETH +1635, all ETH gone
    [LARGE_BOND, "COUPON", ldt(7, "07-04"), "", 0, 0, 100.00, 0, 0, "EUR", 1, "", "", "Semi-annual coupon 5 bonds", ""],
    ["iShares Physical Gold ETC", "BUY", ldt(7, "03-10"), "", 80, 22.00, 1765.00, 5.00, 0, "EUR", 1, "Interactive Brokers", "", "", ""], // Gold reopened
    ["Microsoft Corp.", "DIVIDEND", ldt(7, "12-15"), "", 0, 0, 75.00, 0, 0, "EUR", 1, "", "", "Annual dividend", ""],
    // LY8
    [LARGE_BOND, "COUPON", ldt(8, "01-04"), "", 0, 0, 100.00, 0, 0, "EUR", 1, "", "", "Semi-annual coupon 5 bonds", ""],
    ["Apple Inc.", "SELL", ldt(8, "03-20"), "", 50, 155.30, 7758.00, 7.00, 0, "EUR", 1, "DEGIRO", "", "", ""],  // → AAPL +6438
    ["iShares Physical Gold ETC", "BUY", ldt(8, "02-20"), "", 40, 25.00, 1005.00, 5.00, 0, "EUR", 1, "Interactive Brokers", "", "", ""],
    ["Ethereum", "BUY", ldt(8, "04-10"), "", 8, 2200.00, 17620.00, 20.00, 0, "EUR", 1, "Coinbase", "", "", ""], // ETH reopened
    ["Vanguard FTSE All-World ETF", "BUY", ldt(8, "06-15"), "", 35, 92.00, 3225.50, 5.50, 0, "EUR", 1, "DEGIRO", "", "", ""],
    [LARGE_BOND, "COUPON", ldt(8, "07-04"), "", 0, 0, 100.00, 0, 0, "EUR", 1, "", "", "Semi-annual coupon 5 bonds", ""],
    ["Microsoft Corp.", "DIVIDEND", ldt(8, "12-15"), "", 0, 0, 80.00, 0, 0, "EUR", 1, "", "", "Annual dividend", ""],
    // LY9 (current year — only dates up to current month included)
    [LARGE_BOND, "COUPON", ldt(9, "01-04"), "", 0, 0, 100.00, 0, 0, "EUR", 1, "", "", "Semi-annual coupon 5 bonds", ""],
    ["iShares Core MSCI World", "BUY", ldt(9, "01-15"), "", 25, 86.00, 2156.00, 6.00, 0, "EUR", 1, "DEGIRO", "", "", ""],
    ["Bitcoin", "BUY", ldt(9, "02-15"), "", 0.25, 39500.00, 9925.00, 50.00, 0, "EUR", 1, "Coinbase", "", "", ""],
    ["Microsoft Corp.", "SELL", ldt(9, "03-15"), "", 30, 385.00, 11541.00, 9.00, 0, "EUR", 1, "DEGIRO", "", "", ""],  // → MSFT +9511
    ["Microsoft Corp.", "DIVIDEND", ldt(9, "05-15"), "", 0, 0, 40.00, 0, 0, "EUR", 1, "", "", "Mid-year dividend", ""],
];

export function largeAssetsTsv() { return tsv(ASSET_H, LARGE_ASSETS); }
export function largeValuationsTsv() { return tsv(VALUATION_H, largeValuations()); }
export function largeTransactionsTsv() { return tsv(TX_H, LARGE_TX); }
