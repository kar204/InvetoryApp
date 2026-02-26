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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      products: {
        Row: {
          capacity: string | null
          category: string
          created_at: string
          id: string
          model: string
          name: string
          updated_at: string
        }
        Insert: {
          capacity?: string | null
          category?: string
          created_at?: string
          id?: string
          model: string
          name: string
          updated_at?: string
        }
        Update: {
          capacity?: string | null
          category?: string
          created_at?: string
          id?: string
          model?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      scrap_entries: {
        Row: {
          created_at: string
          customer_name: string
          id: string
          marked_out_at: string | null
          marked_out_by: string | null
          quantity: number
          recorded_by: string
          scrap_item: string
          scrap_model: string
          scrap_value: number
          status: string
        }
        Insert: {
          created_at?: string
          customer_name: string
          id?: string
          marked_out_at?: string | null
          marked_out_by?: string | null
          quantity?: number
          recorded_by: string
          scrap_item: string
          scrap_model: string
          scrap_value?: number
          status?: string
        }
        Update: {
          created_at?: string
          customer_name?: string
          id?: string
          marked_out_at?: string | null
          marked_out_by?: string | null
          quantity?: number
          recorded_by?: string
          scrap_item?: string
          scrap_model?: string
          scrap_value?: number
          status?: string
        }
        Relationships: []
      }
      service_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          notes: string | null
          ticket_id: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          notes?: string | null
          ticket_id: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          notes?: string | null
          ticket_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_logs_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "service_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      service_tickets: {
        Row: {
          assigned_to: string | null
          assigned_to_battery: string | null
          assigned_to_invertor: string | null
          battery_model: string
          battery_price: number | null
          battery_rechargeable: boolean | null
          battery_resolved: boolean | null
          battery_resolved_at: string | null
          battery_resolved_by: string | null
          created_at: string
          created_by: string
          customer_name: string
          customer_phone: string
          id: string
          invertor_issue_description: string | null
          invertor_model: string | null
          invertor_price: number | null
          invertor_resolved: boolean | null
          invertor_resolved_at: string | null
          invertor_resolved_by: string | null
          issue_description: string
          payment_method: string | null
          resolution_notes: string | null
          service_price: number | null
          status: Database["public"]["Enums"]["service_status"]
          ticket_number: string | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          assigned_to_battery?: string | null
          assigned_to_invertor?: string | null
          battery_model: string
          battery_price?: number | null
          battery_rechargeable?: boolean | null
          battery_resolved?: boolean | null
          battery_resolved_at?: string | null
          battery_resolved_by?: string | null
          created_at?: string
          created_by: string
          customer_name: string
          customer_phone: string
          id?: string
          invertor_issue_description?: string | null
          invertor_model?: string | null
          invertor_price?: number | null
          invertor_resolved?: boolean | null
          invertor_resolved_at?: string | null
          invertor_resolved_by?: string | null
          issue_description: string
          payment_method?: string | null
          resolution_notes?: string | null
          service_price?: number | null
          status?: Database["public"]["Enums"]["service_status"]
          ticket_number?: string | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          assigned_to_battery?: string | null
          assigned_to_invertor?: string | null
          battery_model?: string
          battery_price?: number | null
          battery_rechargeable?: boolean | null
          battery_resolved?: boolean | null
          battery_resolved_at?: string | null
          battery_resolved_by?: string | null
          created_at?: string
          created_by?: string
          customer_name?: string
          customer_phone?: string
          id?: string
          invertor_issue_description?: string | null
          invertor_model?: string | null
          invertor_price?: number | null
          invertor_resolved?: boolean | null
          invertor_resolved_at?: string | null
          invertor_resolved_by?: string | null
          issue_description?: string
          payment_method?: string | null
          resolution_notes?: string | null
          service_price?: number | null
          status?: Database["public"]["Enums"]["service_status"]
          ticket_number?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      shop_sale_items: {
        Row: {
          created_at: string
          id: string
          model_number: string
          price: number | null
          product_id: string | null
          product_type: string
          quantity: number
          sale_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          model_number: string
          price?: number | null
          product_id?: string | null
          product_type?: string
          quantity?: number
          sale_id: string
        }
        Update: {
          created_at?: string
          id?: string
          model_number?: string
          price?: number | null
          product_id?: string | null
          product_type?: string
          quantity?: number
          sale_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "shop_sales"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_sales: {
        Row: {
          created_at: string
          customer_name: string
          id: string
          sold_by: string
        }
        Insert: {
          created_at?: string
          customer_name: string
          id?: string
          sold_by: string
        }
        Update: {
          created_at?: string
          customer_name?: string
          id?: string
          sold_by?: string
        }
        Relationships: []
      }
      shop_stock: {
        Row: {
          id: string
          product_id: string
          quantity: number
          updated_at: string
        }
        Insert: {
          id?: string
          product_id: string
          quantity?: number
          updated_at?: string
        }
        Update: {
          id?: string
          product_id?: string
          quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_stock_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transactions: {
        Row: {
          created_at: string
          handled_by: string
          id: string
          product_id: string
          quantity: number
          remarks: string | null
          source: Database["public"]["Enums"]["stock_source"]
          transaction_type: Database["public"]["Enums"]["transaction_type"]
        }
        Insert: {
          created_at?: string
          handled_by: string
          id?: string
          product_id: string
          quantity: number
          remarks?: string | null
          source: Database["public"]["Enums"]["stock_source"]
          transaction_type: Database["public"]["Enums"]["transaction_type"]
        }
        Update: {
          created_at?: string
          handled_by?: string
          id?: string
          product_id?: string
          quantity?: number
          remarks?: string | null
          source?: Database["public"]["Enums"]["stock_source"]
          transaction_type?: Database["public"]["Enums"]["transaction_type"]
        }
        Relationships: [
          {
            foreignKeyName: "stock_transactions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      warehouse_stock: {
        Row: {
          id: string
          product_id: string
          quantity: number
          updated_at: string
        }
        Insert: {
          id?: string
          product_id: string
          quantity?: number
          updated_at?: string
        }
        Update: {
          id?: string
          product_id?: string
          quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_stock_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calculate_total_service_price: {
        Args: {
          ticket_row: Database["public"]["Tables"]["service_tickets"]["Row"]
        }
        Returns: number
      }
      get_user_roles: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"][]
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
      app_role:
        | "admin"
        | "counter_staff"
        | "service_agent"
        | "warehouse_staff"
        | "procurement_staff"
        | "sp_battery"
        | "sp_invertor"
        | "seller"
        | "scrap_manager"
      service_status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED"
      stock_source: "SHOP" | "SUPPLIER" | "WAREHOUSE"
      transaction_type: "IN" | "OUT"
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
      app_role: [
        "admin",
        "counter_staff",
        "service_agent",
        "warehouse_staff",
        "procurement_staff",
        "sp_battery",
        "sp_invertor",
        "seller",
        "scrap_manager",
      ],
      service_status: ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"],
      stock_source: ["SHOP", "SUPPLIER", "WAREHOUSE"],
      transaction_type: ["IN", "OUT"],
    },
  },
} as const
