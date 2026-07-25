export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      api_config: {
        Row: {
          api_name: string
          daily_cap_calls: number | null
          daily_cap_usd: number | null
          enabled: boolean
          notes: string | null
          updated_at: string | null
        }
        Insert: {
          api_name: string
          daily_cap_calls?: number | null
          daily_cap_usd?: number | null
          enabled?: boolean
          notes?: string | null
          updated_at?: string | null
        }
        Update: {
          api_name?: string
          daily_cap_calls?: number | null
          daily_cap_usd?: number | null
          enabled?: boolean
          notes?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      api_usage: {
        Row: {
          api_name: string
          calls: number
          cost_usd: number
          day: string
          id: string
          updated_at: string | null
        }
        Insert: {
          api_name: string
          calls?: number
          cost_usd?: number
          day?: string
          id?: string
          updated_at?: string | null
        }
        Update: {
          api_name?: string
          calls?: number
          cost_usd?: number
          day?: string
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      custom_linkage_analyses: {
        Row: {
          channel: string | null
          coefficient: number | null
          follower: string
          id: string
          is_private: boolean
          lag_days: number | null
          leader: string
          p_adjusted: number | null
          p_value: number | null
          purchase_type: string | null
          r_squared_delta: number | null
          ran_at: string
          user_id: string
          validated: boolean | null
        }
        Insert: {
          channel?: string | null
          coefficient?: number | null
          follower: string
          id?: string
          is_private?: boolean
          lag_days?: number | null
          leader: string
          p_adjusted?: number | null
          p_value?: number | null
          purchase_type?: string | null
          r_squared_delta?: number | null
          ran_at?: string
          user_id: string
          validated?: boolean | null
        }
        Update: {
          channel?: string | null
          coefficient?: number | null
          follower?: string
          id?: string
          is_private?: boolean
          lag_days?: number | null
          leader?: string
          p_adjusted?: number | null
          p_value?: number | null
          purchase_type?: string | null
          r_squared_delta?: number | null
          ran_at?: string
          user_id?: string
          validated?: boolean | null
        }
        Relationships: []
      }
      geopolitical_sentiment: {
        Row: {
          created_at: string
          id: string
          key_events: Json
          severity: string
          summary: string
          tension_score: number
        }
        Insert: {
          created_at?: string
          id?: string
          key_events?: Json
          severity?: string
          summary: string
          tension_score: number
        }
        Update: {
          created_at?: string
          id?: string
          key_events?: Json
          severity?: string
          summary?: string
          tension_score?: number
        }
        Relationships: []
      }
      ipo_intelligence: {
        Row: {
          accredited_required: boolean
          brief: string
          dimension_scores: Json
          horizon: string
          id: string
          ipo_timeline_note: string | null
          min_investment: string | null
          name: string
          our_view: string
          platforms: Json
          raw_facts: Json
          refreshed_at: string
          risk_label: string
          risk_score: number
          risk_tier: string
          sector: string
          sources: Json
          stage: string
        }
        Insert: {
          accredited_required?: boolean
          brief: string
          dimension_scores: Json
          horizon: string
          id?: string
          ipo_timeline_note?: string | null
          min_investment?: string | null
          name: string
          our_view: string
          platforms?: Json
          raw_facts: Json
          refreshed_at?: string
          risk_label: string
          risk_score: number
          risk_tier: string
          sector: string
          sources?: Json
          stage: string
        }
        Update: {
          accredited_required?: boolean
          brief?: string
          dimension_scores?: Json
          horizon?: string
          id?: string
          ipo_timeline_note?: string | null
          min_investment?: string | null
          name?: string
          our_view?: string
          platforms?: Json
          raw_facts?: Json
          refreshed_at?: string
          risk_label?: string
          risk_score?: number
          risk_tier?: string
          sector?: string
          sources?: Json
          stage?: string
        }
        Relationships: []
      }
      legal_acknowledgments: {
        Row: {
          acknowledged_at: string
          acknowledgment_text: string
          created_at: string
          document: string
          id: string
          page_url: string | null
          user_agent: string | null
          user_id: string | null
          version: string
        }
        Insert: {
          acknowledged_at?: string
          acknowledgment_text: string
          created_at?: string
          document: string
          id?: string
          page_url?: string | null
          user_agent?: string | null
          user_id?: string | null
          version: string
        }
        Update: {
          acknowledged_at?: string
          acknowledgment_text?: string
          created_at?: string
          document?: string
          id?: string
          page_url?: string | null
          user_agent?: string | null
          user_id?: string | null
          version?: string
        }
        Relationships: []
      }
      linkage_cache: {
        Row: {
          id: number
          payload: Json
          updated_at: string
        }
        Insert: {
          id?: number
          payload: Json
          updated_at?: string
        }
        Update: {
          id?: number
          payload?: Json
          updated_at?: string
        }
        Relationships: []
      }
      macro_indicators: {
        Row: {
          as_of_date: string | null
          change_30d: number | null
          created_at: string
          id: string
          indicator_key: string
          previous_value: number | null
          updated_at: string
          value: number | null
        }
        Insert: {
          as_of_date?: string | null
          change_30d?: number | null
          created_at?: string
          id?: string
          indicator_key: string
          previous_value?: number | null
          updated_at?: string
          value?: number | null
        }
        Update: {
          as_of_date?: string | null
          change_30d?: number | null
          created_at?: string
          id?: string
          indicator_key?: string
          previous_value?: number | null
          updated_at?: string
          value?: number | null
        }
        Relationships: []
      }
      market_updates: {
        Row: {
          content: string
          created_at: string
          id: string
          signal_type: string | null
          ticker: string | null
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          signal_type?: string | null
          ticker?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          signal_type?: string | null
          ticker?: string | null
        }
        Relationships: []
      }
      portfolio_holdings: {
        Row: {
          added_at: string
          avg_cost: number
          company_name: string | null
          id: string
          purchase_date: string | null
          shares: number
          ticker: string
          user_id: string
        }
        Insert: {
          added_at?: string
          avg_cost?: number
          company_name?: string | null
          id?: string
          purchase_date?: string | null
          shares?: number
          ticker: string
          user_id: string
        }
        Update: {
          added_at?: string
          avg_cost?: number
          company_name?: string | null
          id?: string
          purchase_date?: string | null
          shares?: number
          ticker?: string
          user_id?: string
        }
        Relationships: []
      }
      stock_fundamentals: {
        Row: {
          company_name: string | null
          currency: string | null
          dividend_yield: number | null
          eps: number | null
          fifty_two_week_high: number | null
          fifty_two_week_low: number | null
          forward_pe: number | null
          id: string
          industry: string | null
          market_cap: number | null
          pe_ratio: number | null
          sector: string | null
          ticker: string
          updated_at: string
        }
        Insert: {
          company_name?: string | null
          currency?: string | null
          dividend_yield?: number | null
          eps?: number | null
          fifty_two_week_high?: number | null
          fifty_two_week_low?: number | null
          forward_pe?: number | null
          id?: string
          industry?: string | null
          market_cap?: number | null
          pe_ratio?: number | null
          sector?: string | null
          ticker: string
          updated_at?: string
        }
        Update: {
          company_name?: string | null
          currency?: string | null
          dividend_yield?: number | null
          eps?: number | null
          fifty_two_week_high?: number | null
          fifty_two_week_low?: number | null
          forward_pe?: number | null
          id?: string
          industry?: string | null
          market_cap?: number | null
          pe_ratio?: number | null
          sector?: string | null
          ticker?: string
          updated_at?: string
        }
        Relationships: []
      }
      stock_prices: {
        Row: {
          close: number
          created_at: string
          date: string
          high: number
          id: string
          low: number
          open: number
          ticker: string
          volume: number
        }
        Insert: {
          close: number
          created_at?: string
          date: string
          high: number
          id?: string
          low: number
          open: number
          ticker: string
          volume?: number
        }
        Update: {
          close?: number
          created_at?: string
          date?: string
          high?: number
          id?: string
          low?: number
          open?: number
          ticker?: string
          volume?: number
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          environment: string
          id: string
          price_id: string
          product_id: string
          status: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          price_id: string
          product_id: string
          status?: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          price_id?: string
          product_id?: string
          status?: string
          stripe_customer_id?: string
          stripe_subscription_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      usage_counters: {
        Row: {
          count: number
          day: string
          feature: string
          id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          count?: number
          day?: string
          feature: string
          id?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          count?: number
          day?: string
          feature?: string
          id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_tier: {
        Args: { check_env?: string; user_uuid: string }
        Returns: string
      }
      has_active_subscription: {
        Args: { check_env?: string; user_uuid: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
