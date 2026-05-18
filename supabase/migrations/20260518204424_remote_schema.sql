-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.asset_types (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL,
  requires_iban boolean NOT NULL DEFAULT false,
  requires_ticker boolean NOT NULL DEFAULT false,
  requires_isin boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT asset_types_pkey PRIMARY KEY (id),
  CONSTRAINT asset_types_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.asset_valuations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  asset_id uuid NOT NULL,
  valuation_date date NOT NULL,
  balance_amount numeric NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT asset_valuations_pkey PRIMARY KEY (id),
  CONSTRAINT asset_valuations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT asset_valuations_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.portfolio_assets(id)
);
CREATE TABLE public.portfolio_assets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  type_id uuid NOT NULL,
  name text NOT NULL,
  institution text NOT NULL,
  login_url text,
  comments text,
  iban text,
  isin text,
  ticker text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT portfolio_assets_pkey PRIMARY KEY (id),
  CONSTRAINT portfolio_assets_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT portfolio_assets_type_id_fkey FOREIGN KEY (type_id) REFERENCES public.asset_types(id)
);