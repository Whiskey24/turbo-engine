-- =============================================================================
-- Migration: FIFO Lot Tracking + Multi-Currency P&L
-- Depends on:  20260531000000_asset_transactions_and_prices.sql
--
-- What this adds:
--   1. base_currency seeded into user_settings.preferences JSONB (no new column)
--   2. exchange_rate column on asset_prices
--   3. tax_lots      – one row per BUY, quantity_remaining decrements on SELL
--   4. lot_matches   – FIFO audit trail linking each SELL slice to a BUY lot
--   5. process_fifo_lots() – trigger function that runs on every INSERT into
--                            asset_transactions and maintains the above two tables
--   6. Rebuilt views: current_holdings, unrealized_pnl (multi-currency)
--   7. New views:     realized_pnl, portfolio_summary
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. user_settings: ensure base_currency exists in preferences JSONB
--    The currency all P&L "base" columns report in.
--    Stored as an ISO-4217 code, e.g. 'EUR', 'USD', 'GBP'.
--    Read in views as: preferences->>'base_currency'
--    No column change needed — lives inside the existing preferences jsonb.
-- -----------------------------------------------------------------------------

-- Seed 'EUR' as the default for any existing rows that don't have it set yet.
-- New users get base_currency when the application first writes their preferences.
UPDATE public.user_settings
SET preferences = preferences || '{"base_currency": "EUR"}'::jsonb
WHERE preferences->>'base_currency' IS NULL;

COMMENT ON TABLE public.user_settings IS
    'preferences JSONB keys include: base_currency (ISO-4217, e.g. EUR, USD, GBP)';


-- -----------------------------------------------------------------------------
-- 2. asset_prices: exchange_rate
--    Already present in the CREATE TABLE from migration 20260531000000.
--    No schema change needed here.
-- -----------------------------------------------------------------------------


-- -----------------------------------------------------------------------------
-- 3. tax_lots
--    One row is created for every BUY / TRANSFER_IN / STOCK_DIV transaction.
--    quantity_remaining starts equal to quantity_acquired and is decremented
--    as matching SELL transactions are processed by the trigger.
--
--    NOTE: rows in this table are managed exclusively by the
--    process_fifo_lots() trigger.  Do not INSERT / UPDATE / DELETE directly.
-- -----------------------------------------------------------------------------

CREATE TABLE public.tax_lots (
    id                  uuid           DEFAULT gen_random_uuid()              NOT NULL,
    user_id             uuid           DEFAULT auth.uid()                     NOT NULL,
    asset_id            uuid                                                  NOT NULL,
    transaction_id      uuid                                                  NOT NULL,  -- originating BUY transaction

    acquired_at         date                                                  NOT NULL,  -- date of purchase (FIFO sort key)

    quantity_acquired   numeric(20, 8)                                        NOT NULL,
    quantity_remaining  numeric(20, 8)                                        NOT NULL,  -- decrements as units are sold

    -- Cost basis in the transaction's local currency
    cost_per_unit       numeric(20, 8)                                        NOT NULL,
    currency            text                                                  NOT NULL,  -- local currency of the purchase

    -- FX rate at time of purchase: local_currency → user's base_currency
    exchange_rate       numeric(16, 8) NOT NULL DEFAULT 1,

    -- Cost per unit already converted to base currency (stored for fast aggregation)
    cost_per_unit_base  numeric(20, 8)
        GENERATED ALWAYS AS (cost_per_unit * exchange_rate) STORED,

    created_at          timestamptz    DEFAULT timezone('utc'::text, now())   NOT NULL,

    CONSTRAINT tax_lots_pkey               PRIMARY KEY (id),
    CONSTRAINT tax_lots_qty_acquired_check CHECK (quantity_acquired > 0),
    CONSTRAINT tax_lots_qty_remaining_check CHECK (quantity_remaining >= 0),
    CONSTRAINT tax_lots_cost_check         CHECK (cost_per_unit >= 0)
);

-- Foreign keys
ALTER TABLE ONLY public.tax_lots
    ADD CONSTRAINT tax_lots_asset_id_fkey
    FOREIGN KEY (asset_id) REFERENCES public.portfolio_assets(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.tax_lots
    ADD CONSTRAINT tax_lots_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.tax_lots
    ADD CONSTRAINT tax_lots_transaction_id_fkey
    FOREIGN KEY (transaction_id) REFERENCES public.asset_transactions(id) ON DELETE RESTRICT;

-- Indexes — the partial index on remaining > 0 makes FIFO lookups fast
CREATE INDEX idx_tax_lots_asset_user    ON public.tax_lots (asset_id, user_id);
CREATE INDEX idx_tax_lots_acquired_at   ON public.tax_lots (acquired_at ASC);
CREATE INDEX idx_tax_lots_open          ON public.tax_lots (asset_id, user_id, acquired_at ASC, created_at ASC)
    WHERE quantity_remaining > 0;  -- FIFO query target

-- RLS — users can read their own lots; writes are via trigger (SECURITY DEFINER)
ALTER TABLE public.tax_lots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own tax lots"
    ON public.tax_lots FOR SELECT TO authenticated
    USING (auth.uid() = user_id);


-- -----------------------------------------------------------------------------
-- 4. lot_matches
--    Each row records that a specific SELL transaction consumed a specific
--    quantity from a specific BUY lot.
--    One SELL can generate multiple rows if it spans several lots.
--    Realized P&L and holding period are GENERATED columns — always consistent.
--
--    NOTE: rows are managed exclusively by the process_fifo_lots() trigger.
-- -----------------------------------------------------------------------------

CREATE TABLE public.lot_matches (
    id                      uuid           DEFAULT gen_random_uuid()            NOT NULL,
    user_id                 uuid           DEFAULT auth.uid()                   NOT NULL,
    asset_id                uuid                                                NOT NULL,
    sell_transaction_id     uuid                                                NOT NULL,
    lot_id                  uuid                                                NOT NULL,
    quantity_matched        numeric(20, 8)                                      NOT NULL,

    -- ── BUY / cost side ──────────────────────────────────────────────────────
    acquired_at             date                                                NOT NULL,
    cost_per_unit           numeric(20, 8) NOT NULL,
    cost_currency           text           NOT NULL,
    cost_exchange_rate      numeric(16, 8) NOT NULL DEFAULT 1,
    cost_basis              numeric(20, 4) NOT NULL,        -- qty × cost_per_unit
    cost_basis_base         numeric(20, 4) NOT NULL,        -- qty × cost_per_unit × cost_exchange_rate

    -- ── SELL / proceeds side ─────────────────────────────────────────────────
    sold_at                 date                                                NOT NULL,
    sell_price_per_unit     numeric(20, 8) NOT NULL,
    sell_currency           text           NOT NULL,
    sell_exchange_rate      numeric(16, 8) NOT NULL DEFAULT 1,
    -- proceeds is net of the proportional share of the sell fee for this lot slice
    proceeds                numeric(20, 4) NOT NULL,        -- in sell_currency
    proceeds_base           numeric(20, 4) NOT NULL,        -- proceeds × sell_exchange_rate

    -- ── Derived / always-consistent ─────────────────────────────────────────
    -- P&L in the sell (local) currency: ignores FX — pure price-movement gain
    realized_pnl            numeric(20, 4)
        GENERATED ALWAYS AS (proceeds - cost_basis)             STORED,

    -- P&L in base currency: includes both price movement AND FX effect
    realized_pnl_base       numeric(20, 4)
        GENERATED ALWAYS AS (proceeds_base - cost_basis_base)   STORED,

    held_days               integer
        GENERATED ALWAYS AS (sold_at - acquired_at)             STORED,

    -- > 365 days = typically qualifies as long-term for capital gains tax
    is_long_term            boolean
        GENERATED ALWAYS AS ((sold_at - acquired_at) > 365)     STORED,

    created_at              timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL,

    CONSTRAINT lot_matches_pkey      PRIMARY KEY (id),
    CONSTRAINT lot_matches_qty_check CHECK (quantity_matched > 0)
);

-- Foreign keys
ALTER TABLE ONLY public.lot_matches
    ADD CONSTRAINT lot_matches_sell_transaction_id_fkey
    FOREIGN KEY (sell_transaction_id) REFERENCES public.asset_transactions(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.lot_matches
    ADD CONSTRAINT lot_matches_lot_id_fkey
    FOREIGN KEY (lot_id) REFERENCES public.tax_lots(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.lot_matches
    ADD CONSTRAINT lot_matches_asset_id_fkey
    FOREIGN KEY (asset_id) REFERENCES public.portfolio_assets(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.lot_matches
    ADD CONSTRAINT lot_matches_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Indexes
CREATE INDEX idx_lot_matches_user_asset       ON public.lot_matches (user_id, asset_id);
CREATE INDEX idx_lot_matches_sell_transaction ON public.lot_matches (sell_transaction_id);
CREATE INDEX idx_lot_matches_lot_id           ON public.lot_matches (lot_id);
CREATE INDEX idx_lot_matches_sold_at          ON public.lot_matches (sold_at DESC);

-- RLS
ALTER TABLE public.lot_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own lot matches"
    ON public.lot_matches FOR SELECT TO authenticated
    USING (auth.uid() = user_id);


-- -----------------------------------------------------------------------------
-- 5. process_fifo_lots()  —  trigger function
--
--  Fires AFTER INSERT on asset_transactions FOR EACH ROW.
--
--  BUY / TRANSFER_IN / STOCK_DIV:
--      Opens a new tax lot with quantity_remaining = quantity.
--
--  SELL / TRANSFER_OUT:
--      Iterates open lots oldest-first (FIFO) and consumes them until the
--      sold quantity is fully matched.  Inserts a lot_matches row for each
--      lot slice consumed and decrements tax_lots.quantity_remaining.
--      Raises an exception if the sold quantity exceeds available lots.
--
--  DIVIDEND / SPLIT:
--      No lot action (DIVIDEND is cash; SPLIT should be entered as a
--      TRANSFER_OUT of the pre-split position + TRANSFER_IN of the
--      post-split position to adjust cost basis correctly).
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.process_fifo_lots()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_remaining      numeric(20, 8);
    v_lot            RECORD;
    v_match_qty      numeric(20, 8);
    v_prop_fee       numeric(20, 4);
    v_proceeds       numeric(20, 4);
    v_proceeds_base  numeric(20, 4);
BEGIN

    -- -------------------------------------------------------------------------
    -- BUY / TRANSFER_IN / STOCK_DIV  →  open a new tax lot
    -- -------------------------------------------------------------------------
    IF NEW.transaction_type IN ('BUY', 'TRANSFER_IN', 'STOCK_DIV') THEN

        INSERT INTO public.tax_lots (
            user_id,
            asset_id,
            transaction_id,
            acquired_at,
            quantity_acquired,
            quantity_remaining,
            cost_per_unit,
            currency,
            exchange_rate
        ) VALUES (
            NEW.user_id,
            NEW.asset_id,
            NEW.id,
            NEW.transacted_at::date,
            NEW.quantity,
            NEW.quantity,
            NEW.price_per_unit,
            NEW.currency,
            NEW.exchange_rate
        );

        RETURN NEW;
    END IF;

    -- -------------------------------------------------------------------------
    -- SELL / TRANSFER_OUT  →  consume open lots FIFO
    -- -------------------------------------------------------------------------
    IF NEW.transaction_type IN ('SELL', 'TRANSFER_OUT') THEN

        v_remaining := NEW.quantity;

        FOR v_lot IN
            SELECT *
            FROM public.tax_lots
            WHERE asset_id          = NEW.asset_id
              AND user_id           = NEW.user_id
              AND quantity_remaining > 0.000000001
            ORDER BY acquired_at ASC, created_at ASC     -- oldest lot first = FIFO
        LOOP
            EXIT WHEN v_remaining <= 0.000000001;

            -- How many units does this lot contribute?
            v_match_qty := LEAST(v_remaining, v_lot.quantity_remaining);

            -- Proportional share of the sell fee attributed to this lot slice
            -- (avoids double-counting fee across multiple lot rows)
            v_prop_fee := ROUND(
                (v_match_qty / NEW.quantity) * NEW.fee,
            4);

            -- Net proceeds in sell (local) currency
            v_proceeds      := ROUND(v_match_qty * NEW.price_per_unit - v_prop_fee, 4);
            -- Net proceeds converted to base currency
            v_proceeds_base := ROUND(v_proceeds * NEW.exchange_rate, 4);

            INSERT INTO public.lot_matches (
                user_id,
                asset_id,
                sell_transaction_id,
                lot_id,
                quantity_matched,
                acquired_at,
                cost_per_unit,
                cost_currency,
                cost_exchange_rate,
                cost_basis,
                cost_basis_base,
                sold_at,
                sell_price_per_unit,
                sell_currency,
                sell_exchange_rate,
                proceeds,
                proceeds_base
            ) VALUES (
                NEW.user_id,
                NEW.asset_id,
                NEW.id,
                v_lot.id,
                v_match_qty,
                v_lot.acquired_at,
                v_lot.cost_per_unit,
                v_lot.currency,
                v_lot.exchange_rate,
                ROUND(v_match_qty * v_lot.cost_per_unit,                        4),
                ROUND(v_match_qty * v_lot.cost_per_unit * v_lot.exchange_rate,  4),
                NEW.transacted_at::date,
                NEW.price_per_unit,
                NEW.currency,
                NEW.exchange_rate,
                v_proceeds,
                v_proceeds_base
            );

            -- Consume this lot slice
            UPDATE public.tax_lots
            SET quantity_remaining = quantity_remaining - v_match_qty
            WHERE id = v_lot.id;

            v_remaining := v_remaining - v_match_qty;
        END LOOP;

        -- Guard: selling more units than are held across all open lots
        IF v_remaining > 0.000000001 THEN
            RAISE EXCEPTION
                'FIFO error: cannot sell asset %. '
                'Attempted to sell % more units than exist in open lots. '
                'Check that all prior BUY transactions have been entered.',
                NEW.asset_id,
                ROUND(v_remaining, 8);
        END IF;

        RETURN NEW;
    END IF;

    -- DIVIDEND, SPLIT, and any future types — no lot action needed
    RETURN NEW;

END;
$$;


-- Attach the trigger — fires after every INSERT on asset_transactions
CREATE TRIGGER trg_fifo_lots
    AFTER INSERT ON public.asset_transactions
    FOR EACH ROW
    EXECUTE FUNCTION public.process_fifo_lots();


-- =============================================================================
-- 6. Rebuild views with FIFO consistency and multi-currency support
-- =============================================================================

-- Drop in dependency order (unrealized_pnl depends on current_holdings)
DROP VIEW IF EXISTS public.unrealized_pnl;
DROP VIEW IF EXISTS public.current_holdings;


-- 6a. current_holdings
--     Sourced from tax_lots (not raw transactions) so it is always consistent
--     with the FIFO matching in lot_matches.
--     Shows cost in both the asset's local currency and the user's base currency.

CREATE VIEW public.current_holdings AS
SELECT
    tl.user_id,
    tl.asset_id,
    pa.name                                                         AS asset_name,
    pa.ticker,
    pa.isin,
    at_type.type_slug                                               AS asset_type,
    tl.currency                                                     AS local_currency,

    -- ── Quantity ─────────────────────────────────────────────────
    SUM(tl.quantity_remaining)                                      AS quantity_held,

    -- ── Cost in asset's own (local) currency ─────────────────────
    ROUND(SUM(tl.quantity_remaining * tl.cost_per_unit),        4)  AS total_cost_local,

    -- ── Cost converted to base currency ──────────────────────────
    -- Uses the FX rate that was current at the time of each purchase,
    -- so this reflects the actual cash outlay in base currency terms.
    ROUND(SUM(tl.quantity_remaining * tl.cost_per_unit_base),   4)  AS total_cost_base,

    -- ── Weighted average cost per unit ───────────────────────────
    CASE WHEN SUM(tl.quantity_remaining) > 0
         THEN ROUND(
                  SUM(tl.quantity_remaining * tl.cost_per_unit)
                  / SUM(tl.quantity_remaining),
              8)
         ELSE 0
    END                                                             AS avg_cost_per_unit_local,

    CASE WHEN SUM(tl.quantity_remaining) > 0
         THEN ROUND(
                  SUM(tl.quantity_remaining * tl.cost_per_unit_base)
                  / SUM(tl.quantity_remaining),
              8)
         ELSE 0
    END                                                             AS avg_cost_per_unit_base

FROM public.tax_lots tl
JOIN public.portfolio_assets pa      ON pa.id      = tl.asset_id
JOIN public.asset_types      at_type ON at_type.id = pa.type_id
WHERE tl.quantity_remaining > 0.000000001
GROUP BY
    tl.user_id, tl.asset_id,
    pa.name, pa.ticker, pa.isin,
    at_type.type_slug, tl.currency;


-- 6b. unrealized_pnl
--     Joins current_holdings to the most recently recorded price.
--     Produces P&L in both local and base currency.
--
--     local P&L  = price movement only (currency held constant at local)
--     base P&L   = price movement + FX change since purchase
--     The difference between the two is the pure FX effect.

CREATE VIEW public.unrealized_pnl AS
WITH latest_price AS (
    SELECT DISTINCT ON (asset_id)
        asset_id,
        price,
        price_date,
        currency      AS price_currency,
        exchange_rate AS price_exchange_rate   -- FX rate on the day price was entered
    FROM public.asset_prices
    ORDER BY asset_id, price_date DESC
)
SELECT
    h.user_id,
    h.asset_id,
    h.asset_name,
    h.ticker,
    h.isin,
    h.asset_type,
    h.local_currency,

    -- The currency that all _base columns are expressed in,
    -- read from preferences JSONB; falls back to 'EUR' if not yet set.
    COALESCE(
        (SELECT us.preferences->>'base_currency'
         FROM public.user_settings us
         WHERE us.user_id = h.user_id),
        'EUR'
    )                                                               AS base_currency,

    h.quantity_held,

    -- Cost basis
    h.avg_cost_per_unit_local,
    h.avg_cost_per_unit_base,
    h.total_cost_local,
    h.total_cost_base,

    -- Latest price
    lp.price                                                        AS current_price,
    lp.price_date                                                   AS price_as_of,
    lp.price_exchange_rate                                          AS current_fx_rate,

    -- ── Market value ─────────────────────────────────────────────
    ROUND(h.quantity_held * lp.price,                           2)  AS current_value_local,
    ROUND(h.quantity_held * lp.price * lp.price_exchange_rate,  2)  AS current_value_base,

    -- ── Unrealised P&L: local currency (pure price effect) ───────
    ROUND(
        (h.quantity_held * lp.price) - h.total_cost_local,
    2)                                                              AS unrealized_pnl_local,

    -- ── Unrealised P&L: base currency (price + FX effect) ────────
    ROUND(
        (h.quantity_held * lp.price * lp.price_exchange_rate) - h.total_cost_base,
    2)                                                              AS unrealized_pnl_base,

    -- ── FX effect alone: base P&L minus local P&L (approx) ───────
    -- Shows how much of the gain/loss is attributable to currency moves
    ROUND(
        ( (h.quantity_held * lp.price * lp.price_exchange_rate) - h.total_cost_base )
      - ( (h.quantity_held * lp.price) - h.total_cost_local ),
    2)                                                              AS fx_effect,

    -- ── Percentage return on cost (local) ────────────────────────
    CASE WHEN h.total_cost_local > 0
         THEN ROUND(
                  ((h.quantity_held * lp.price - h.total_cost_local)
                   / h.total_cost_local) * 100,
              2)
         ELSE NULL
    END                                                             AS unrealized_pnl_pct

FROM public.current_holdings h
LEFT JOIN latest_price lp ON lp.asset_id = h.asset_id;


-- 6c. realized_pnl
--     One row per lot_match — the full FIFO audit trail of every closed slice.
--     Useful for tax reporting: filter by sold_at year, is_long_term, etc.

CREATE VIEW public.realized_pnl AS
SELECT
    lm.user_id,
    lm.asset_id,
    pa.name                                                         AS asset_name,
    pa.ticker,
    pa.isin,
    at_type.type_slug                                               AS asset_type,

    -- Trade details
    lm.sell_transaction_id,
    lm.lot_id,
    lm.quantity_matched                                             AS quantity_sold,
    lm.acquired_at,
    lm.sold_at,
    lm.held_days,
    lm.is_long_term,

    -- ── Local currency (sell currency) ───────────────────────────
    lm.sell_currency                                                AS local_currency,
    lm.cost_basis,
    lm.proceeds,
    lm.realized_pnl,

    -- ── Base currency ─────────────────────────────────────────────
    lm.cost_basis_base,
    lm.proceeds_base,
    lm.realized_pnl_base,

    -- ── Return % on cost ─────────────────────────────────────────
    CASE WHEN lm.cost_basis > 0
         THEN ROUND((lm.realized_pnl / lm.cost_basis) * 100, 2)
         ELSE NULL
    END                                                             AS realized_pnl_pct,

    -- ── FX effect on this lot slice ───────────────────────────────
    ROUND(lm.realized_pnl_base - lm.realized_pnl,              2)  AS fx_effect

FROM public.lot_matches lm
JOIN public.portfolio_assets pa      ON pa.id      = lm.asset_id
JOIN public.asset_types      at_type ON at_type.id = pa.type_id;


-- 6d. portfolio_summary
--     One row per asset: current position + lifetime realised totals.
--     The top-level dashboard query.

CREATE VIEW public.portfolio_summary AS
WITH realized_totals AS (
    SELECT
        user_id,
        asset_id,
        SUM(realized_pnl)       AS total_realized_local,
        SUM(realized_pnl_base)  AS total_realized_base,
        COUNT(*)                AS total_trades_closed
    FROM public.lot_matches
    GROUP BY user_id, asset_id
)
SELECT
    u.user_id,
    u.asset_id,
    u.asset_name,
    u.ticker,
    u.isin,
    u.asset_type,
    u.local_currency,
    u.base_currency,

    -- Position
    u.quantity_held,
    u.current_price,
    u.price_as_of,
    u.current_fx_rate,

    -- Cost and value (base currency)
    u.total_cost_base,
    u.current_value_base,

    -- Unrealised
    u.unrealized_pnl_local,
    u.unrealized_pnl_base,
    u.unrealized_pnl_pct,
    u.fx_effect                                                 AS unrealized_fx_effect,

    -- Realised (lifetime, all closed lots for this asset)
    COALESCE(r.total_realized_local, 0)                         AS total_realized_local,
    COALESCE(r.total_realized_base,  0)                         AS total_realized_base,
    COALESCE(r.total_trades_closed,  0)                         AS total_trades_closed,

    -- Combined total P&L in base currency
    COALESCE(u.unrealized_pnl_base,  0)
  + COALESCE(r.total_realized_base,  0)                         AS total_pnl_base

FROM public.unrealized_pnl u
LEFT JOIN realized_totals r
       ON r.asset_id = u.asset_id
      AND r.user_id  = u.user_id;


-- =============================================================================
-- 7. Backfill helper (run ONCE if you have existing transactions)
-- =============================================================================
--
-- The trigger only fires on future INSERTs.  If you already have rows in
-- asset_transactions, run the block below to populate tax_lots and lot_matches
-- for all of them.
--
-- ⚠️  Only run this when tax_lots and lot_matches are empty for these users.
--     Running it a second time will create duplicate lots.
--
-- DO $$
-- DECLARE
--     v_txn RECORD;
-- BEGIN
--     FOR v_txn IN
--         SELECT *
--         FROM public.asset_transactions
--         ORDER BY transacted_at ASC, created_at ASC
--     LOOP
--         -- Simulate trigger by calling the core logic for each row
--         PERFORM public.process_fifo_lots_for_row(v_txn);
--     END LOOP;
-- END;
-- $$;
--
-- To enable the backfill, create a thin wrapper that accepts a
-- asset_transactions row and performs the same INSERT/UPDATE logic as the
-- trigger function, then call the DO block above.
--
-- Alternatively, temporarily disable the trigger, truncate tax_lots and
-- lot_matches, then re-insert all asset_transactions rows in date order:
--
--   ALTER TABLE public.asset_transactions DISABLE TRIGGER trg_fifo_lots;
--   TRUNCATE public.lot_matches, public.tax_lots;
--   ALTER TABLE public.asset_transactions ENABLE TRIGGER trg_fifo_lots;
--
--   -- Then re-insert each row (or use a function that calls NEW := row; EXECUTE TRIGGER):
--   -- This is most cleanly done by your application seeding script.
--
-- =============================================================================
-- Notes
-- =============================================================================
--
-- Correcting a transaction:
--   Because tax_lots and lot_matches have ON DELETE RESTRICT FKs pointing at
--   asset_transactions, you cannot simply delete a transaction once it has
--   generated lots or matches.  The safe correction workflow is:
--     1. Delete lot_matches rows referencing the SELL (if applicable)
--     2. Restore quantity_remaining on affected tax_lots
--     3. Delete the tax_lot row (if it was a BUY being corrected)
--     4. Delete the asset_transactions row
--     5. Re-insert the corrected transaction (trigger re-runs automatically)
--
-- SPLIT handling:
--   Enter a stock split as:
--     TRANSFER_OUT  qty=old_quantity,  price_per_unit=old_cost_basis_per_unit
--     TRANSFER_IN   qty=new_quantity,  price_per_unit=new_cost_basis_per_unit
--   This correctly adjusts tax_lots so future SELL matching uses the right basis.
--
-- Performance:
--   For very large portfolios (thousands of transactions per asset), replace
--   current_holdings and unrealized_pnl with MATERIALIZED VIEWs and add a
--   AFTER INSERT/UPDATE/DELETE trigger on tax_lots to call REFRESH MATERIALIZED VIEW.
