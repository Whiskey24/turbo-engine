-- 1. Create or replace the pricing trigger function as SECURITY INVOKER
CREATE OR REPLACE FUNCTION public.sync_transaction_price_to_matrix()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY INVOKER -- Inherits permissions and RLS filters from the active user session
SET search_path TO ''
AS $$
BEGIN
    -- Only process transaction types that carry units with meaningful purchase/sale prices
    IF NEW.transaction_type IN ('BUY', 'SELL', 'TRANSFER_IN', 'TRANSFER_OUT') AND NEW.price_per_unit > 0 THEN
        
        -- If an explicit entry exists for this asset on this specific date, update it
        IF EXISTS (
            SELECT 1 
            FROM public.asset_prices 
            WHERE asset_id = NEW.asset_id 
              AND price_date = NEW.transacted_at::date
        ) THEN
            UPDATE public.asset_prices
            SET 
                price = NEW.price_per_unit,
                currency = NEW.currency,
                exchange_rate = NEW.exchange_rate,
                source = 'transaction_trigger'
            WHERE asset_id = NEW.asset_id 
              AND price_date = NEW.transacted_at::date;
        ELSE
            -- Otherwise, insert a brand new evaluation benchmark point
            INSERT INTO public.asset_prices (
                user_id,
                asset_id,
                price_date,
                price,
                currency,
                exchange_rate,
                source
            ) VALUES (
                NEW.user_id, -- Matches the active transaction's user context
                NEW.asset_id,
                NEW.transacted_at::date,
                NEW.price_per_unit,
                NEW.currency,
                NEW.exchange_rate,
                'transaction_trigger'
            );
        END IF;

    END IF;

    RETURN NEW;
END;
$$;

-- 2. Bind the trigger execution to the asset_transactions table
DROP TRIGGER IF EXISTS trigger_sync_transaction_price ON public.asset_transactions;

CREATE TRIGGER trigger_sync_transaction_price
    AFTER INSERT OR UPDATE OF transaction_type, transacted_at, price_per_unit, currency, exchange_rate
    ON public.asset_transactions
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_transaction_price_to_matrix();