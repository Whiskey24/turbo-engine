-- =============================================================================
-- Migration: Rename table asset_types → asset_categories
-- Depends on:  20260601000002_move_type_slug_to_portfolio_assets.sql
--
-- What this changes:
--   1. Renames the table itself
--   2. Renames all constraints that carry the old table name (PK, unique, FKs)
--   3. Renames RLS policies on the table for consistency
--
-- What this does NOT change (deferred to application code update):
--   - The portfolio_assets.type_id column name (still references the same FK)
--   - Any application-level queries (handled in database.ts / database_types.ts)
--
-- The FK from portfolio_assets.type_id → asset_categories(id) continues to
-- function automatically after the rename; PostgreSQL updates the FK target
-- in-place. Only the constraint name on portfolio_assets is updated here for
-- clarity.
-- =============================================================================

-- 1. Rename the table
ALTER TABLE public.asset_types RENAME TO asset_categories;

-- 2. Rename the primary key constraint
ALTER TABLE public.asset_categories
    RENAME CONSTRAINT asset_types_pkey TO asset_categories_pkey;

-- 3. Rename the unique constraint
ALTER TABLE public.asset_categories
    RENAME CONSTRAINT unique_user_asset_type TO unique_user_asset_category;

-- 4. Rename the user_id FK on the table itself
ALTER TABLE public.asset_categories
    RENAME CONSTRAINT asset_types_user_id_fkey TO asset_categories_user_id_fkey;

-- 5. Rename the FK on portfolio_assets that references this table
--    (column stays type_id — that rename is deferred to the next application update)
ALTER TABLE public.portfolio_assets
    RENAME CONSTRAINT portfolio_assets_type_id_fkey TO portfolio_assets_type_id_asset_categories_fkey;

-- 6. Rename RLS policies that carry the old table name
ALTER POLICY "Users can manage their own asset types"
    ON public.asset_categories
    RENAME TO "Users can manage their own asset categories";

ALTER POLICY "Users can only view their own assets"
    ON public.asset_categories
    RENAME TO "Users can only view their own asset categories";
