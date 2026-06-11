-- =============================================================================
-- Migration: undo_last_transaction()
--
-- Atomically reverses the most recent asset transaction for a given asset.
-- Called by the trading journal page's "Undo" feature.
--
-- Runs as SECURITY INVOKER — executes with the calling user's permissions.
-- The caller must have:
--   DELETE on public.lot_matches
--   DELETE + UPDATE on public.tax_lots
--   DELETE on public.asset_transactions
-- RLS on each table enforces row-level ownership automatically.
--
-- Safety constraint: only the most recent transaction for the asset can be
-- undone.  A newer transaction may have matched against lots opened or
-- consumed by this one, making a clean reversal impossible without
-- re-running FIFO for all subsequent trades.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.undo_last_transaction(p_transaction_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
    v_tx    RECORD;
    v_match RECORD;
BEGIN

    -- ── 1. Fetch the transaction (RLS ensures it belongs to the caller) ───────

    SELECT *
    INTO v_tx
    FROM public.asset_transactions
    WHERE id = p_transaction_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Transaction not found or access denied'
            USING ERRCODE = 'P0002';
    END IF;

    -- ── 2. Guard: must be the most recent transaction for this asset ──────────

    IF EXISTS (
        SELECT 1
        FROM public.asset_transactions
        WHERE asset_id     = v_tx.asset_id
          AND transacted_at > v_tx.transacted_at
    ) THEN
        RAISE EXCEPTION
            'Only the most recent transaction for this asset can be undone'
            USING ERRCODE = 'P0001';
    END IF;

    -- ── 3. Reverse lot-level side effects ─────────────────────────────────────

    IF v_tx.transaction_type IN ('BUY', 'TRANSFER_IN', 'STOCK_DIV') THEN

        -- A BUY opens a new tax lot.  Remove any lot_matches that reference it
        -- (edge case: normally empty since this is the most recent transaction),
        -- then delete the lot itself.
        DELETE FROM public.lot_matches
        WHERE lot_id IN (
            SELECT id FROM public.tax_lots
            WHERE transaction_id = p_transaction_id
        );

        DELETE FROM public.tax_lots
        WHERE transaction_id = p_transaction_id;

    ELSIF v_tx.transaction_type IN ('SELL', 'TRANSFER_OUT') THEN

        -- A SELL consumes lots via lot_matches and decrements quantity_remaining.
        -- Restore each lot before deleting the match records.
        FOR v_match IN
            SELECT lot_id, quantity_matched
            FROM public.lot_matches
            WHERE sell_transaction_id = p_transaction_id
        LOOP
            UPDATE public.tax_lots
            SET quantity_remaining = quantity_remaining + v_match.quantity_matched
            WHERE id = v_match.lot_id;
        END LOOP;

        DELETE FROM public.lot_matches
        WHERE sell_transaction_id = p_transaction_id;

    END IF;
    -- DIVIDEND / SPLIT create no lot records — no cleanup needed.

    -- ── 4. Delete the transaction (all FK dependents are now gone) ────────────

    DELETE FROM public.asset_transactions
    WHERE id = p_transaction_id;

END;
$$;

GRANT EXECUTE ON FUNCTION public.undo_last_transaction(uuid) TO authenticated;

CREATE POLICY update_own_tax_lots ON public.tax_lots
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);