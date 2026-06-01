-- Migration: Move type_slug from asset_types to portfolio_assets
-- Rationale: type_slug describes the nature of an individual asset (e.g. STOCK, CRYPTO),
--            not the user-defined category/label (asset_type). Moving it to portfolio_assets
--            allows each asset to carry its own slug independently of the type grouping.

-- -----------------------------------------------------------------------
-- Step 1: Add type_slug to portfolio_assets (nullable for the backfill)
-- -----------------------------------------------------------------------
ALTER TABLE public.portfolio_assets
    ADD COLUMN type_slug text;

-- -----------------------------------------------------------------------
-- Step 2: Backfill from asset_types via the existing type_id FK
-- -----------------------------------------------------------------------
UPDATE public.portfolio_assets pa
SET    type_slug = at.type_slug
FROM   public.asset_types at
WHERE  pa.type_id = at.id;

-- -----------------------------------------------------------------------
-- Step 3: Enforce NOT NULL + valid-values constraint on portfolio_assets
-- -----------------------------------------------------------------------
ALTER TABLE public.portfolio_assets
    ALTER COLUMN type_slug SET NOT NULL,
    ADD CONSTRAINT check_valid_asset_slugs CHECK (
        type_slug = ANY (ARRAY[
            'BANK_ACCOUNT'::text,
            'STOCK'::text,
            'CRYPTO'::text,
            'FUND_ETF'::text,
            'REAL_ESTATE'::text,
            'OTHER'::text
        ])
    );


