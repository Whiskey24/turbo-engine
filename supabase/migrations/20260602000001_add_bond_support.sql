-- =============================================================================
-- Migration: Add BOND asset slug + bond-specific schema support
-- Depends on: current schema (db_schema.sql as of 2026-06-02)
--
-- Design principle: all monetary values stored as actual currency amounts,
-- not percentages. The UI converts clean_price_pct × nominal / 100 to a
-- monetary figure before inserting. This means the FIFO trigger, tax_lots,
-- lot_matches, current_holdings, unrealized_pnl, realized_pnl, and
-- portfolio_summary views require ZERO changes.
--
-- Changes:
--   1. Add BOND to the type_slug CHECK constraint on portfolio_assets
--   2. Add nullable bond metadata columns to portfolio_assets
--   3. Add nullable accrued_interest column to asset_transactions
--   4. Add accrued_interest_paid (default 0) to tax_lots
--   5. Add COUPON to the transaction_type CHECK constraint
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Add BOND to the valid slug values on portfolio_assets
-- -----------------------------------------------------------------------------

ALTER TABLE public.portfolio_assets
    DROP CONSTRAINT check_valid_asset_slugs,
    ADD CONSTRAINT check_valid_asset_slugs CHECK (
        type_slug = ANY (ARRAY[
            'BANK_ACCOUNT'::text,
            'STOCK'::text,
            'CRYPTO'::text,
            'FUND_ETF'::text,
            'REAL_ESTATE'::text,
            'BOND'::text,
            'OTHER'::text
        ])
    );


-- -----------------------------------------------------------------------------
-- 2. Bond metadata columns on portfolio_assets
--
-- All nullable — only populated for BOND assets.
-- nominal_value:      face value per bond in the asset's currency (e.g. 1000)
-- coupon_rate:        annual coupon as a decimal, e.g. 0.045 = 4.5%
-- coupon_frequency:   payments per year: 1 (annual), 2 (semi-annual),
--                     4 (quarterly), 12 (monthly)
-- maturity_date:      bond redemption date
-- first_coupon_date:  needed to calculate stub-period accrued interest
-- day_count_basis:    AI calculation convention: '30/360', 'ACT/365',
--                     'ACT/ACT', 'ACT/360'
-- -----------------------------------------------------------------------------

ALTER TABLE public.portfolio_assets
    ADD COLUMN nominal_value     numeric(20,4)  NULL,
    ADD COLUMN coupon_rate       numeric(8,6)   NULL,
    ADD COLUMN coupon_frequency  integer        NULL,
    ADD COLUMN maturity_date     date           NULL,
    ADD COLUMN first_coupon_date date           NULL,
    ADD COLUMN day_count_basis   text           NULL;

ALTER TABLE public.portfolio_assets
    ADD CONSTRAINT check_coupon_frequency CHECK (
        coupon_frequency IS NULL
        OR coupon_frequency = ANY (ARRAY[1, 2, 4, 12])
    );

ALTER TABLE public.portfolio_assets
    ADD CONSTRAINT check_day_count_basis CHECK (
        day_count_basis IS NULL
        OR day_count_basis = ANY (ARRAY[
            '30/360'::text,
            'ACT/365'::text,
            'ACT/ACT'::text,
            'ACT/360'::text
        ])
    );


-- -----------------------------------------------------------------------------
-- 3. Accrued interest on asset_transactions
--
-- AI paid (BUY) or received (SELL / COUPON) — always a positive monetary
-- amount in the transaction currency. NULL for non-bond transactions.
--
-- total_amount = (clean_price_per_unit × quantity) + accrued_interest + fee
-- -----------------------------------------------------------------------------

ALTER TABLE public.asset_transactions
    ADD COLUMN accrued_interest numeric(20,4) NULL,
    ADD CONSTRAINT check_accrued_interest_positive CHECK (
        accrued_interest IS NULL OR accrued_interest >= 0
    );


-- -----------------------------------------------------------------------------
-- 4. Accrued interest paid carried on each tax lot
--
-- Copied from the opening BUY so per-lot net return reporting can separate
-- clean-price gain from coupon recovery. Default 0 leaves existing lots
-- unaffected.
-- -----------------------------------------------------------------------------

ALTER TABLE public.tax_lots
    ADD COLUMN accrued_interest_paid numeric(20,4) NOT NULL DEFAULT 0,
    ADD CONSTRAINT check_lot_ai_positive CHECK (accrued_interest_paid >= 0);


-- -----------------------------------------------------------------------------
-- 5. Add COUPON to the transaction_type CHECK constraint
--
-- COUPON receipts: quantity = 0, price_per_unit = 0, total_amount = gross
-- coupon amount. The FIFO trigger falls through to RETURN NEW for this type
-- (no lot creation or matching needed).
-- -----------------------------------------------------------------------------

ALTER TABLE public.asset_transactions
    DROP CONSTRAINT asset_transactions_type_check,
    ADD CONSTRAINT asset_transactions_type_check CHECK (
        transaction_type = ANY (ARRAY[
            'BUY'::text,
            'SELL'::text,
            'DIVIDEND'::text,
            'COUPON'::text,
            'STOCK_DIV'::text,
            'SPLIT'::text,
            'TRANSFER_IN'::text,
            'TRANSFER_OUT'::text
        ])
    );
