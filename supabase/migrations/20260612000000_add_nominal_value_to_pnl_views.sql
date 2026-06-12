-- Migration: add nominal_value to unrealized_pnl and realized_pnl views
-- nominal_value (bond face/par value per unit) is sourced from portfolio_assets,

DROP VIEW IF EXISTS public.portfolio_summary;
DROP VIEW IF EXISTS public.unrealized_pnl;
DROP VIEW IF EXISTS public.realized_pnl;
DROP VIEW IF EXISTS public.current_holdings;


-- -----------------------------------------------------------------------------
-- current_holdings
-- -----------------------------------------------------------------------------

CREATE VIEW public.current_holdings AS
SELECT
    tl.user_id,
    tl.asset_id,
    pa.name                                                         AS asset_name,
    pa.ticker,
    pa.isin,
    pa.type_slug                                                    AS asset_type,  -- from portfolio_assets
    pa.nominal_value                                                AS nominal_value,  -- NEW column from portfolio_assets,
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
JOIN public.portfolio_assets pa ON pa.id = tl.asset_id   -- type_slug read here; no asset_types join needed
WHERE tl.quantity_remaining > 0.000000001
GROUP BY
    tl.user_id, tl.asset_id,
    pa.name, pa.ticker, pa.isin,
    pa.type_slug, pa.nominal_value, tl.currency;


-- -----------------------------------------------------------------------------
-- unrealized_pnl  (unchanged logic; rebuilt because it depends on current_holdings)
-- -----------------------------------------------------------------------------

CREATE VIEW public.unrealized_pnl AS
WITH latest_price AS (
    SELECT DISTINCT ON (asset_id)
        asset_id,
        price,
        price_date,
        currency      AS price_currency,
        exchange_rate AS price_exchange_rate
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
    h.nominal_value,

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

    -- ── FX effect alone ───────────────────────────────────────────
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


-- -----------------------------------------------------------------------------
-- realized_pnl
-- -----------------------------------------------------------------------------

CREATE VIEW public.realized_pnl AS
SELECT
    lm.user_id,
    lm.asset_id,
    pa.name                                                         AS asset_name,
    pa.ticker,
    pa.isin,
    pa.type_slug                                                    AS asset_type,  -- from portfolio_assets
    pa.nominal_value                                                AS nominal_value,  -- NEW column from portfolio_assets,
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
JOIN public.portfolio_assets pa ON pa.id = lm.asset_id;  -- type_slug read here; no asset_types join needed


-- -----------------------------------------------------------------------------
-- portfolio_summary  (unchanged logic; rebuilt because it depends on unrealized_pnl)
-- -----------------------------------------------------------------------------

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

-- -----------------------------------------------------------------------
-- Step 5: Set security_invoker = true on all affected views
alter view public.unrealized_pnl set (security_invoker = true);
alter view public.portfolio_summary set (security_invoker = true);
alter view public.realized_pnl set (security_invoker = true);
alter view public.current_holdings set (security_invoker = true);