-- =============================================================================
-- Migration: Asset Transactions, Prices, and P&L Views
-- Adds trading history and price tracking for STOCK, FUND_ETF, and CRYPTO assets
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. ASSET TRANSACTIONS
--    Records every buy, sell, dividend, and corporate action for tradeable assets.
-- -----------------------------------------------------------------------------

CREATE TABLE public.asset_transactions (
    id                 uuid        DEFAULT gen_random_uuid()              NOT NULL,
    user_id            uuid        DEFAULT auth.uid()                     NOT NULL,
    asset_id           uuid                                               NOT NULL,  -- FK → portfolio_assets.id

    -- What kind of event is this?
    transaction_type   text                                               NOT NULL,
    -- BUY          : purchased units
    -- SELL         : sold units
    -- DIVIDEND     : cash dividend received (quantity = 0, use total_amount)
    -- STOCK_DIV    : stock dividend / bonus shares received
    -- SPLIT        : forward or reverse split (quantity = net new units, price = 0)
    -- TRANSFER_IN  : units moved in from another broker (no cash cost — sets cost basis)
    -- TRANSFER_OUT : units moved out to another broker

    transacted_at      timestamptz                                        NOT NULL,  -- exact date/time of the trade
    settled_at         date,                                                          -- settlement date (T+2 for stocks; optional)

    -- Quantity and price
    quantity           numeric(20, 8)                                     NOT NULL,  -- units / shares / coins (8 dp covers crypto)
    price_per_unit     numeric(20, 8)  DEFAULT 0                          NOT NULL,  -- price paid/received per unit
    total_amount       numeric(20, 4)                                     NOT NULL,
    -- For BUY:  total_amount = (quantity × price_per_unit) + fee
    -- For SELL: total_amount = (quantity × price_per_unit) − fee
    -- For DIVIDEND: total_amount = cash received (quantity = 0)
    -- Store explicitly — avoids rounding surprises and handles negotiated prices

    -- Costs
    fee                numeric(12, 4)  DEFAULT 0                          NOT NULL,  -- brokerage commission / transaction fee
    tax_amount         numeric(12, 4)  DEFAULT 0                          NOT NULL,  -- withholding tax (common on foreign dividends)

    -- Currency
    currency           text            DEFAULT 'EUR'                      NOT NULL,  -- currency of price_per_unit / total_amount
    exchange_rate      numeric(16, 8)  DEFAULT 1                          NOT NULL,
    -- Rate to convert this transaction's currency into your base/reporting currency.
    -- If you trade in USD but report in EUR, store the EUR/USD rate here.
    -- Default 1 = same currency as base.

    -- Context
    broker             text,                                                          -- e.g. 'DEGIRO', 'Interactive Brokers', 'Coinbase'
    external_ref       text,                                                          -- broker's own order / transaction ID
    notes              text,

    created_at         timestamptz DEFAULT timezone('utc'::text, now())   NOT NULL,
    updated_at         timestamptz DEFAULT timezone('utc'::text, now())   NOT NULL,

    CONSTRAINT asset_transactions_pkey
        PRIMARY KEY (id),

    CONSTRAINT asset_transactions_type_check
        CHECK (transaction_type = ANY (ARRAY[
            'BUY'::text,
            'SELL'::text,
            'DIVIDEND'::text,
            'STOCK_DIV'::text,
            'SPLIT'::text,
            'TRANSFER_IN'::text,
            'TRANSFER_OUT'::text
        ])),

    CONSTRAINT asset_transactions_quantity_check
        CHECK (quantity >= 0),

    CONSTRAINT asset_transactions_price_check
        CHECK (price_per_unit >= 0),

    CONSTRAINT asset_transactions_fee_check
        CHECK (fee >= 0),

    CONSTRAINT asset_transactions_tax_check
        CHECK (tax_amount >= 0)
);

-- Foreign keys
ALTER TABLE ONLY public.asset_transactions
    ADD CONSTRAINT asset_transactions_asset_id_fkey
    FOREIGN KEY (asset_id) REFERENCES public.portfolio_assets(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.asset_transactions
    ADD CONSTRAINT asset_transactions_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Indexes
CREATE INDEX idx_asset_transactions_asset_id   ON public.asset_transactions (asset_id);
CREATE INDEX idx_asset_transactions_user_id    ON public.asset_transactions (user_id);
CREATE INDEX idx_asset_transactions_transacted ON public.asset_transactions (transacted_at DESC);

-- RLS
ALTER TABLE public.asset_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own transactions"
    ON public.asset_transactions
    TO authenticated
    USING      (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can only view their own transactions"
    ON public.asset_transactions
    FOR SELECT
    USING (auth.uid() = user_id);


-- -----------------------------------------------------------------------------
-- 2. ASSET PRICES
--    One row per asset per date — the market price per unit on that day.
--    Used for STOCK, FUND_ETF, CRYPTO.  Bank accounts / real estate continue
--    to use the existing asset_valuations table (lump-sum balance, no unit price).
-- -----------------------------------------------------------------------------

CREATE TABLE public.asset_prices (
    id           uuid        DEFAULT gen_random_uuid()              NOT NULL,
    user_id      uuid        DEFAULT auth.uid()                     NOT NULL,
    asset_id     uuid                                               NOT NULL,  -- FK → portfolio_assets.id
    price_date   date                                               NOT NULL,  -- the date this price applies to
    price        numeric(20, 8)                                     NOT NULL,  -- price per unit / share / coin
    currency     text        DEFAULT 'EUR'                          NOT NULL,
    exchange_rate numeric(16, 8) DEFAULT 1                          NOT NULL,
    -- FX rate: 1 unit of currency expressed in the user's base_currency.
    -- E.g. price in USD, base EUR, rate = 0.92 means 1 USD = 0.92 EUR. Default 1 = same currency.
    source       text        DEFAULT 'manual'                       NOT NULL,
    -- 'manual'   : entered by the user
    -- 'import'   : bulk imported from a CSV / API feed
    created_at   timestamptz DEFAULT timezone('utc'::text, now())   NOT NULL,

    CONSTRAINT asset_prices_pkey
        PRIMARY KEY (id),

    CONSTRAINT unique_asset_price_per_date
        UNIQUE (asset_id, price_date),

    CONSTRAINT asset_prices_price_check
        CHECK (price >= 0)
);

-- Foreign keys
ALTER TABLE ONLY public.asset_prices
    ADD CONSTRAINT asset_prices_asset_id_fkey
    FOREIGN KEY (asset_id) REFERENCES public.portfolio_assets(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.asset_prices
    ADD CONSTRAINT asset_prices_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Indexes
CREATE INDEX idx_asset_prices_asset_id  ON public.asset_prices (asset_id);
CREATE INDEX idx_asset_prices_date      ON public.asset_prices (price_date DESC);

-- RLS
ALTER TABLE public.asset_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own asset prices"
    ON public.asset_prices
    TO authenticated
    USING      (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can only view their own asset prices"
    ON public.asset_prices
    FOR SELECT
    USING (auth.uid() = user_id);


-- -----------------------------------------------------------------------------
-- 3. VIEWS  (no stored P&L — always computed fresh)
-- -----------------------------------------------------------------------------

-- 3a. current_holdings
--     Net quantity held per asset, weighted average cost basis, total cost.
--     Only considers BUY / SELL / STOCK_DIV / TRANSFER_IN / TRANSFER_OUT.
--     SPLIT is excluded here — handle splits by inserting a corrective
--     TRANSFER_IN / TRANSFER_OUT pair, or add split-adjustment logic later.

CREATE VIEW public.current_holdings AS
WITH position AS (
    SELECT
        t.user_id,
        t.asset_id,
        t.currency,

        -- Net units still held
        SUM(
            CASE transaction_type
                WHEN 'BUY'          THEN  quantity
                WHEN 'STOCK_DIV'    THEN  quantity
                WHEN 'TRANSFER_IN'  THEN  quantity
                WHEN 'SELL'         THEN -quantity
                WHEN 'TRANSFER_OUT' THEN -quantity
                ELSE 0
            END
        ) AS quantity_held,

        -- Total cost of units acquired (fees included in total_amount for BUY)
        SUM(
            CASE transaction_type
                WHEN 'BUY'         THEN total_amount
                WHEN 'TRANSFER_IN' THEN total_amount  -- cost basis carried over
                ELSE 0
            END
        ) AS total_cost,

        -- Total proceeds from sales (used for realised P&L — see view below)
        SUM(
            CASE transaction_type
                WHEN 'SELL' THEN total_amount
                ELSE 0
            END
        ) AS total_proceeds

    FROM public.asset_transactions t
    GROUP BY t.user_id, t.asset_id, t.currency
)
SELECT
    p.user_id,
    p.asset_id,
    pa.name                                                   AS asset_name,
    pa.ticker,
    pa.isin,
    p.currency,
    p.quantity_held,
    p.total_cost,
    p.total_proceeds,
    -- Weighted average cost per unit
    CASE
        WHEN p.quantity_held > 0
        THEN ROUND(p.total_cost / p.quantity_held, 8)
        ELSE 0
    END                                                       AS avg_cost_per_unit
FROM position p
JOIN public.portfolio_assets pa ON pa.id = p.asset_id
WHERE p.quantity_held > 0;   -- exclude fully-exited positions


-- 3b. unrealized_pnl
--     Joins current_holdings to the most recent price in asset_prices.

CREATE VIEW public.unrealized_pnl AS
WITH latest_price AS (
    SELECT DISTINCT ON (asset_id)
        asset_id,
        price,
        price_date,
        currency    AS price_currency
    FROM public.asset_prices
    ORDER BY asset_id, price_date DESC
)
SELECT
    h.user_id,
    h.asset_id,
    h.asset_name,
    h.ticker,
    h.isin,
    h.currency,
    h.quantity_held,
    h.avg_cost_per_unit,
    h.total_cost,

    lp.price                                                  AS current_price,
    lp.price_date                                             AS price_as_of,

    -- Current market value
    ROUND(h.quantity_held * lp.price, 2)                      AS current_value,

    -- Unrealised gain / loss (in transaction currency; assumes same currency)
    ROUND((h.quantity_held * lp.price) - h.total_cost, 2)    AS unrealized_pnl,

    -- Unrealised gain / loss as a percentage of cost
    CASE
        WHEN h.total_cost > 0
        THEN ROUND(
            (((h.quantity_held * lp.price) - h.total_cost) / h.total_cost) * 100,
            2
        )
        ELSE NULL
    END                                                       AS unrealized_pnl_pct

FROM public.current_holdings h
LEFT JOIN latest_price lp ON lp.asset_id = h.asset_id;


-- =============================================================================
-- Notes for future enhancements
-- =============================================================================
--
-- Realised P&L (FIFO):
--   Accurate realised P&L using FIFO (required for many tax jurisdictions) needs
--   lot-level tracking. Consider adding a `transaction_lot_id` FK on SELL rows
--   pointing back to the originating BUY row, or implement a FIFO function.
--
-- Multi-currency P&L:
--   If assets are priced in different currencies, multiply current_value by the
--   exchange_rate stored on the price row (add a currency column to asset_prices
--   and a base_currency column to user_settings).
--
-- SPLIT handling:
--   A 2-for-1 forward split doubles quantity and halves cost basis.
--   Either insert two corrective transactions (TRANSFER_OUT old, TRANSFER_IN new)
--   or add a dedicated SPLIT processing function.
--
-- Performance:
--   For large transaction histories, replace current_holdings with a
--   MATERIALIZED VIEW and refresh it via a trigger on asset_transactions.
