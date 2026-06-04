create or replace function public.delete_all_portfolio_data()
returns void
language plpgsql
security invoker -- Runs as the logged-in user, respecting all RLS policies
set search_path = '' -- Forces explicit schema resolution
as $$
begin
    -- Since it runs as the caller, RLS acts as a secondary safety net
    delete from public.lot_matches where user_id = auth.uid();
    delete from public.tax_lots where user_id = auth.uid();
    delete from public.asset_transactions where user_id = auth.uid();
    delete from public.asset_prices where user_id = auth.uid();
    delete from public.asset_valuations where user_id = auth.uid();
    delete from public.portfolio_assets where user_id = auth.uid();
    delete from public.asset_categories where user_id = auth.uid();
end;
$$;

-- Make sure anon still can't touch it
revoke execute on function public.delete_all_portfolio_data() from anon;
revoke execute on function public.delete_all_portfolio_data() from public;

-- Allow authenticated users to call it safely
grant execute on function public.delete_all_portfolio_data() to authenticated;


-- 1. Add a DELETE policy so the user is allowed to clear their own lots
CREATE POLICY "Users can delete their own tax lots"
    ON public.tax_lots FOR DELETE TO authenticated
    USING (auth.uid() = user_id);

-- 2. Do the exact same thing for lot_matches (which likely has the same issue)
CREATE POLICY "Users can delete their own lot matches"
    ON public.lot_matches FOR DELETE TO authenticated
    USING (auth.uid() = user_id);