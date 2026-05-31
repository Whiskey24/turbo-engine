alter view public.unrealized_pnl set (security_invoker = true);

alter view public.portfolio_summary set (security_invoker = true);

alter view public.realized_pnl set (security_invoker = true);

alter view public.current_holdings set (security_invoker = true);

REVOKE EXECUTE ON FUNCTION public.process_fifo_lots() FROM anon, public, authenticated;