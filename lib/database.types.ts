export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      // Renamed from asset_types → asset_categories (migration 20260602000000)
      asset_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }

      asset_prices: {
        Row: {
          id: string
          user_id: string
          asset_id: string
          price_date: string
          price: number
          currency: string
          exchange_rate: number
          source: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string
          asset_id: string
          price_date: string
          price: number
          currency?: string
          exchange_rate?: number
          source?: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          asset_id?: string
          price_date?: string
          price?: number
          currency?: string
          exchange_rate?: number
          source?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_prices_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "portfolio_assets"
            referencedColumns: ["id"]
          },
        ]
      }

      // asset_transactions — buy / sell / dividend / coupon / split / transfer records.
      // Inserting a row fires the process_fifo_lots trigger which auto-populates
      // tax_lots and lot_matches.
      asset_transactions: {
        Row: {
          id: string
          user_id: string
          asset_id: string
          transaction_type: string
          transacted_at: string
          settled_at: string | null
          quantity: number
          price_per_unit: number
          total_amount: number
          fee: number
          tax_amount: number
          currency: string
          exchange_rate: number
          broker: string | null
          external_ref: string | null
          notes: string | null
          created_at: string
          updated_at: string
          // Bond-specific: AI paid (BUY) or received (SELL/COUPON); null for non-bonds
          accrued_interest: number | null
        }
        Insert: {
          id?: string
          user_id?: string
          asset_id: string
          transaction_type: string
          transacted_at: string
          settled_at?: string | null
          quantity: number
          price_per_unit?: number
          total_amount: number
          fee?: number
          tax_amount?: number
          currency?: string
          exchange_rate?: number
          broker?: string | null
          external_ref?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
          accrued_interest?: number | null
        }
        Update: {
          id?: string
          user_id?: string
          asset_id?: string
          transaction_type?: string
          transacted_at?: string
          settled_at?: string | null
          quantity?: number
          price_per_unit?: number
          total_amount?: number
          fee?: number
          tax_amount?: number
          currency?: string
          exchange_rate?: number
          broker?: string | null
          external_ref?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
          accrued_interest?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "asset_transactions_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "portfolio_assets"
            referencedColumns: ["id"]
          },
        ]
      }

      asset_valuations: {
        Row: {
          asset_id: string
          balance_amount: number
          created_at: string
          id: string
          user_id: string
          valuation_date: string
        }
        Insert: {
          asset_id: string
          balance_amount: number
          created_at?: string
          id?: string
          user_id?: string
          valuation_date: string
        }
        Update: {
          asset_id?: string
          balance_amount?: number
          created_at?: string
          id?: string
          user_id?: string
          valuation_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_valuations_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "portfolio_assets"
            referencedColumns: ["id"]
          },
        ]
      }

      login_history: {
        Row: {
          id: string
          user_id: string
          login_at: string
          user_agent: string | null
          ip_address: string | null
          location: string | null
        }
        Insert: {
          id?: string
          user_id?: string
          login_at?: string
          user_agent?: string | null
          ip_address?: string | null
          location?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          login_at?: string
          user_agent?: string | null
          ip_address?: string | null
          location?: string | null
        }
        Relationships: []
      }

      // lot_matches — computed by process_fifo_lots trigger on SELL / TRANSFER_OUT.
      // Never written to directly by application code.
      lot_matches: {
        Row: {
          id: string
          user_id: string
          asset_id: string
          sell_transaction_id: string
          lot_id: string
          quantity_matched: number
          acquired_at: string
          cost_per_unit: number
          cost_currency: string
          cost_exchange_rate: number
          cost_basis: number
          cost_basis_base: number
          sold_at: string
          sell_price_per_unit: number
          sell_currency: string
          sell_exchange_rate: number
          proceeds: number
          proceeds_base: number
          realized_pnl: number          // generated column
          realized_pnl_base: number     // generated column
          held_days: number             // generated column
          is_long_term: boolean         // generated column
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string
          asset_id: string
          sell_transaction_id: string
          lot_id: string
          quantity_matched: number
          acquired_at: string
          cost_per_unit: number
          cost_currency: string
          cost_exchange_rate?: number
          cost_basis: number
          cost_basis_base: number
          sold_at: string
          sell_price_per_unit: number
          sell_currency: string
          sell_exchange_rate?: number
          proceeds: number
          proceeds_base: number
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          asset_id?: string
          sell_transaction_id?: string
          lot_id?: string
          quantity_matched?: number
          acquired_at?: string
          cost_per_unit?: number
          cost_currency?: string
          cost_exchange_rate?: number
          cost_basis?: number
          cost_basis_base?: number
          sold_at?: string
          sell_price_per_unit?: number
          sell_currency?: string
          sell_exchange_rate?: number
          proceeds?: number
          proceeds_base?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lot_matches_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "portfolio_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lot_matches_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "tax_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lot_matches_sell_transaction_id_fkey"
            columns: ["sell_transaction_id"]
            isOneToOne: false
            referencedRelation: "asset_transactions"
            referencedColumns: ["id"]
          },
        ]
      }

      portfolio_assets: {
        Row: {
          comments: string | null
          created_at: string
          iban: string | null
          id: string
          institution: string
          isin: string | null
          login_url: string | null
          name: string
          ticker: string | null
          type_slug: string
          type_id: string
          user_id: string
          // Bond-specific fields (null for all other asset types)
          nominal_value: number | null
          coupon_rate: number | null
          coupon_frequency: number | null
          maturity_date: string | null
          first_coupon_date: string | null
          day_count_basis: string | null
        }
        Insert: {
          comments?: string | null
          created_at?: string
          iban?: string | null
          id?: string
          institution: string
          isin?: string | null
          login_url?: string | null
          name: string
          ticker?: string | null
          type_slug: string
          type_id: string
          user_id?: string
          nominal_value?: number | null
          coupon_rate?: number | null
          coupon_frequency?: number | null
          maturity_date?: string | null
          first_coupon_date?: string | null
          day_count_basis?: string | null
        }
        Update: {
          comments?: string | null
          created_at?: string
          iban?: string | null
          id?: string
          institution?: string
          isin?: string | null
          login_url?: string | null
          name?: string
          ticker?: string | null
          type_slug?: string
          type_id?: string
          user_id?: string
          nominal_value?: number | null
          coupon_rate?: number | null
          coupon_frequency?: number | null
          maturity_date?: string | null
          first_coupon_date?: string | null
          day_count_basis?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_assets_type_id_asset_categories_fkey"
            columns: ["type_id"]
            isOneToOne: false
            referencedRelation: "asset_categories"
            referencedColumns: ["id"]
          },
        ]
      }

      // tax_lots — computed by process_fifo_lots trigger on BUY / TRANSFER_IN / STOCK_DIV.
      // Never written to directly by application code.
      tax_lots: {
        Row: {
          id: string
          user_id: string
          asset_id: string
          transaction_id: string
          acquired_at: string
          quantity_acquired: number
          quantity_remaining: number
          cost_per_unit: number
          currency: string
          exchange_rate: number
          cost_per_unit_base: number    // generated column
          created_at: string
          accrued_interest_paid: number
        }
        Insert: {
          id?: string
          user_id?: string
          asset_id: string
          transaction_id: string
          acquired_at: string
          quantity_acquired: number
          quantity_remaining: number
          cost_per_unit: number
          currency: string
          exchange_rate?: number
          created_at?: string
          accrued_interest_paid?: number
        }
        Update: {
          id?: string
          user_id?: string
          asset_id?: string
          transaction_id?: string
          acquired_at?: string
          quantity_acquired?: number
          quantity_remaining?: number
          cost_per_unit?: number
          currency?: string
          exchange_rate?: number
          created_at?: string
          accrued_interest_paid?: number
        }
        Relationships: [
          {
            foreignKeyName: "tax_lots_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "portfolio_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_lots_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "asset_transactions"
            referencedColumns: ["id"]
          },
        ]
      }

      user_settings: {
        Row: {
          user_id: string
          preferences: Json
          updated_at: string
        }
        Insert: {
          user_id?: string
          preferences?: Json
          updated_at?: string
        }
        Update: {
          user_id?: string
          preferences?: Json
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      current_holdings: {
        Row: {
          user_id: string
          asset_id: string
          asset_name: string
          ticker: string | null
          isin: string | null
          asset_type: string
          local_currency: string
          quantity_held: number
          total_cost_local: number
          total_cost_base: number
          avg_cost_per_unit_local: number
          avg_cost_per_unit_base: number
        }
        Insert: never
        Update: never
        Relationships: []
      }
      unrealized_pnl: {
        Row: {
          user_id: string
          asset_id: string
          asset_name: string
          ticker: string | null
          isin: string | null
          asset_type: string
          local_currency: string
          base_currency: string
          quantity_held: number
          avg_cost_per_unit_local: number
          avg_cost_per_unit_base: number
          total_cost_local: number
          total_cost_base: number
          current_price: number | null
          price_as_of: string | null
          current_fx_rate: number | null
          current_value_local: number | null
          current_value_base: number | null
          unrealized_pnl_local: number | null
          unrealized_pnl_base: number | null
          fx_effect: number | null
          unrealized_pnl_pct: number | null
        }
        Insert: never
        Update: never
        Relationships: []
      }
      realized_pnl: {
        Row: {
          user_id: string
          asset_id: string
          asset_name: string
          ticker: string | null
          isin: string | null
          asset_type: string
          sell_transaction_id: string
          lot_id: string
          quantity_sold: number
          acquired_at: string
          sold_at: string
          held_days: number
          is_long_term: boolean
          local_currency: string
          cost_basis: number
          proceeds: number
          realized_pnl: number
          cost_basis_base: number
          proceeds_base: number
          realized_pnl_base: number
          realized_pnl_pct: number | null
          fx_effect: number
        }
        Insert: never
        Update: never
        Relationships: []
      }
      portfolio_summary: {
        Row: {
          user_id: string
          asset_id: string
          asset_name: string
          ticker: string | null
          isin: string | null
          asset_type: string
          local_currency: string
          base_currency: string
          quantity_held: number
          current_price: number | null
          price_as_of: string | null
          current_fx_rate: number | null
          total_cost_base: number
          current_value_base: number | null
          unrealized_pnl_local: number | null
          unrealized_pnl_base: number | null
          unrealized_pnl_pct: number | null
          unrealized_fx_effect: number | null
          total_realized_local: number
          total_realized_base: number
          total_trades_closed: number
          total_pnl_base: number
        }
        Insert: never
        Update: never
        Relationships: []
      }
    }
    Functions: {
      delete_all_portfolio_data: {
        Args: Record<PropertyKey, never> // This indicates the function takes no arguments
        Returns: undefined               // This matches the SQL "returns void"
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
  | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
  ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
    DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
  : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
    DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
  ? R
  : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
    DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] &
    DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
  ? R
  : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
  | keyof DefaultSchema["Tables"]
  | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
  ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
  : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
    Insert: infer I
  }
  ? I
  : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
    Insert: infer I
  }
  ? I
  : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
  | keyof DefaultSchema["Tables"]
  | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
  ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
  : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
    Update: infer U
  }
  ? U
  : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
    Update: infer U
  }
  ? U
  : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
  | keyof DefaultSchema["Enums"]
  | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
  ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
  : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
  | keyof DefaultSchema["CompositeTypes"]
  | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
  ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
  : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

// ---------------------------------------------------------------------------
// Asset slug constants — single source of truth for UI and validation
// ---------------------------------------------------------------------------

export const ASSET_TYPE_SLUGS = [
  "BANK_ACCOUNT",
  "STOCK",
  "CRYPTO",
  "FUND_ETF",
  "REAL_ESTATE",
  "BOND",
  "OTHER",
] as const;

export type AssetTypeSlug = (typeof ASSET_TYPE_SLUGS)[number];

// Valid coupon frequency values (payments per year)
export const COUPON_FREQUENCIES = [1, 2, 4, 12] as const;
export type CouponFrequency = (typeof COUPON_FREQUENCIES)[number];

export const COUPON_FREQUENCY_LABELS: Record<CouponFrequency, string> = {
  1: "Annual",
  2: "Semi-annual",
  4: "Quarterly",
  12: "Monthly",
};

// Valid day-count basis values for accrued interest calculation
export const DAY_COUNT_BASES = ["30/360", "ACT/365", "ACT/ACT", "ACT/360"] as const;
export type DayCountBasis = (typeof DAY_COUNT_BASES)[number];

// Valid transaction types — mirrors the CHECK constraint on asset_transactions
export const TRANSACTION_TYPES = [
  "BUY",
  "SELL",
  "DIVIDEND",
  "COUPON",
  "STOCK_DIV",
  "SPLIT",
  "TRANSFER_IN",
  "TRANSFER_OUT",
] as const;

export type TransactionType = (typeof TRANSACTION_TYPES)[number];
