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
      customers: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string
          updated_at?: string
        }
        Relationships: []
      }
      home_service_request_sla: {
        Row: {
          created_at: string
          duration_assigned_to_resolved: number | null
          duration_open_to_assigned: number | null
          duration_resolved_to_closed: number | null
          id: string
          request_id: string
          time_assigned: string | null
          time_closed: string | null
          time_opened: string
          time_resolved: string | null
          total_duration: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          duration_assigned_to_resolved?: number | null
          duration_open_to_assigned?: number | null
          duration_resolved_to_closed?: number | null
          id?: string
          request_id: string
          time_assigned?: string | null
          time_closed?: string | null
          time_opened: string
          time_resolved?: string | null
          total_duration?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          duration_assigned_to_resolved?: number | null
          duration_open_to_assigned?: number | null
          duration_resolved_to_closed?: number | null
          id?: string
          request_id?: string
          time_assigned?: string | null
          time_closed?: string | null
          time_opened?: string
          time_resolved?: string | null
          total_duration?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      home_service_requests: {
        Row: {
          address: string
          assigned_at: string | null
          assigned_to: string | null
          battery_model: string | null
          created_at: string
          created_by: string
          customer_id: string | null
          customer_name: string
          customer_phone: string
          id: string
          inverter_model: string | null
          issue_description: string
          priority: "LOW" | "MEDIUM" | "HIGH"
          request_number: string
          spare_supplied: string | null
          status: Database["public"]["Enums"]["service_status"]
          updated_at: string
        }
        Insert: {
          address: string
          assigned_at?: string | null
          assigned_to?: string | null
          battery_model?: string | null
          created_at?: string
          created_by: string
          customer_id?: string | null
          customer_name: string
          customer_phone: string
          id?: string
          inverter_model?: string | null
          issue_description: string
          priority?: "LOW" | "MEDIUM" | "HIGH"
          request_number?: string
          spare_supplied?: string | null
          status?: Database["public"]["Enums"]["service_status"]
          updated_at?: string
        }
        Update: {
          address?: string
          assigned_at?: string | null
          assigned_to?: string | null
          battery_model?: string | null
          created_at?: string
          created_by?: string
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string
          id?: string
          inverter_model?: string | null
          issue_description?: string
          priority?: "LOW" | "MEDIUM" | "HIGH"
          request_number?: string
          spare_supplied?: string | null
          status?: Database["public"]["Enums"]["service_status"]
          updated_at?: string
        }
        Relationships: []
      }
      home_service_resolutions: {
        Row: {
          battery_resolution_notes: string | null
          battery_resolved: boolean | null
          closed_at: string
          closed_by: string
          created_at: string
          id: string
          inverter_resolution_notes: string | null
          inverter_resolved: boolean | null
          payment_method: "CASH" | "CARD" | "UPI" | null
          request_id: string
          resolved_at: string
          resolved_by: string
          total_amount: number | null
          updated_at: string
        }
        Insert: {
          battery_resolution_notes?: string | null
          battery_resolved?: boolean | null
          closed_at: string
          closed_by: string
          created_at?: string
          id?: string
          inverter_resolution_notes?: string | null
          inverter_resolved?: boolean | null
          payment_method?: "CASH" | "CARD" | "UPI" | null
          request_id: string
          resolved_at: string
          resolved_by: string
          total_amount?: number | null
          updated_at?: string
        }
        Update: {
          battery_resolution_notes?: string | null
          battery_resolved?: boolean | null
          closed_at?: string
          closed_by?: string
          created_at?: string
          id?: string
          inverter_resolution_notes?: string | null
          inverter_resolved?: boolean | null
          payment_method?: "CASH" | "CARD" | "UPI" | null
          request_id?: string
          resolved_at?: string
          resolved_by?: string
          total_amount?: number | null
          updated_at?: string
        }
        Relationships: []
      }
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
      service_ticket_sla: {
        Row: {
          created_at: string
          duration_assigned_to_resolved: number | null
          duration_open_to_assigned: number | null
          duration_resolved_to_closed: number | null
          id: string
          ticket_id: string
          time_assigned: string | null
          time_closed: string | null
          time_opened: string
          time_resolved: string | null
          total_duration: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          duration_assigned_to_resolved?: number | null
          duration_open_to_assigned?: number | null
          duration_resolved_to_closed?: number | null
          id?: string
          ticket_id: string
          time_assigned?: string | null
          time_closed?: string | null
          time_opened: string
          time_resolved?: string | null
          total_duration?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          duration_assigned_to_resolved?: number | null
          duration_open_to_assigned?: number | null
          duration_resolved_to_closed?: number | null
          id?: string
          ticket_id?: string
          time_assigned?: string | null
          time_closed?: string | null
          time_opened?: string
          time_resolved?: string | null
          total_duration?: number | null
          updated_at?: string
        }
        Relationships: []
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
          customer_id: string | null
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
          customer_id?: string | null
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
          customer_id?: string | null
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
      second_hand_lifecycle: {
        Row: {
          address: string | null
          created_at: string
          customer_name: string
          end_date: string | null
          id: string
          lifecycle_status: "SOLD" | "ACTIVE" | "PARTIALLY_RETURNED" | "RETURNED"
          mobile_number: string | null
          payment_method: "CASH" | "CARD" | "UPI" | null
          product_category: string
          product_id: string
          product_model: string
          product_name: string
          quantity: number
          recorded_by: string
          remarks: string | null
          return_remarks: string | null
          returned_at: string | null
          returned_quantity: number
          start_date: string | null
          transaction_group_id: string
          transaction_type: "SALE" | "RENT_OUT" | "GOOD_WILL"
          unit_price: number
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          customer_name: string
          end_date?: string | null
          id?: string
          lifecycle_status?: "SOLD" | "ACTIVE" | "PARTIALLY_RETURNED" | "RETURNED"
          mobile_number?: string | null
          payment_method?: "CASH" | "CARD" | "UPI" | null
          product_category: string
          product_id: string
          product_model: string
          product_name: string
          quantity?: number
          recorded_by: string
          remarks?: string | null
          return_remarks?: string | null
          returned_at?: string | null
          returned_quantity?: number
          start_date?: string | null
          transaction_group_id?: string
          transaction_type: "SALE" | "RENT_OUT" | "GOOD_WILL"
          unit_price?: number
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          customer_name?: string
          end_date?: string | null
          id?: string
          lifecycle_status?: "SOLD" | "ACTIVE" | "PARTIALLY_RETURNED" | "RETURNED"
          mobile_number?: string | null
          payment_method?: "CASH" | "CARD" | "UPI" | null
          product_category?: string
          product_id?: string
          product_model?: string
          product_name?: string
          quantity?: number
          recorded_by?: string
          remarks?: string | null
          return_remarks?: string | null
          returned_at?: string | null
          returned_quantity?: number
          start_date?: string | null
          transaction_group_id?: string
          transaction_type?: "SALE" | "RENT_OUT" | "GOOD_WILL"
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "second_hand_lifecycle_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "second_hand_lifecycle_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "users"
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
      warehouse_sales: {
        Row: {
          created_at: string
          customer_name: string
          id: string
          payment_method: string | null
          sold_by: string
          total_amount: number | null
        }
        Insert: {
          created_at?: string
          customer_name: string
          id?: string
          payment_method?: string | null
          sold_by: string
          total_amount?: number | null
        }
        Update: {
          created_at?: string
          customer_name?: string
          id?: string
          payment_method?: string | null
          sold_by?: string
          total_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_sales_sold_by_fkey"
            columns: ["sold_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      warehouse_sale_items: {
        Row: {
          created_at: string
          id: string
          model_number: string
          price: number
          product_id: string | null
          product_type: string
          quantity: number
          sale_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          model_number: string
          price: number
          product_id?: string | null
          product_type?: string
          quantity: number
          sale_id: string
        }
        Update: {
          created_at?: string
          id?: string
          model_number?: string
          price?: number
          product_id?: string | null
          product_type?: string
          quantity?: number
          sale_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "warehouse_sales"
            referencedColumns: ["id"]
          }
        ]
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
      aged_batteries: {
        Row: {
          id: string
          product_id: string
          barcode: string
          batch_id: string | null
          transfer_transaction_id: string | null
          claimed: boolean
          status: "IN_STOCK" | "RENTED" | "RETURNED" | "SOLD" | "SCRAPPED"
          customer_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          product_id: string
          barcode: string
          batch_id?: string | null
          transfer_transaction_id?: string | null
          claimed?: boolean
          status?: "IN_STOCK" | "RENTED" | "RETURNED" | "SOLD" | "SCRAPPED"
          customer_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          product_id?: string
          barcode?: string
          batch_id?: string | null
          transfer_transaction_id?: string | null
          claimed?: boolean
          status?: "IN_STOCK" | "RENTED" | "RETURNED" | "SOLD" | "SCRAPPED"
          customer_id?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "aged_batteries_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aged_batteries_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "aged_transfer_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aged_batteries_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      aged_transfer_batches: {
        Row: {
          id: string
          batch_name: string | null
          notes: string | null
          status: "OPEN" | "COMPLETED" | "CANCELLED"
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          batch_name?: string | null
          notes?: string | null
          status?: "OPEN" | "COMPLETED" | "CANCELLED"
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          batch_name?: string | null
          notes?: string | null
          status?: "OPEN" | "COMPLETED" | "CANCELLED"
          created_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      aged_battery_rentals: {
        Row: {
          id: string
          aged_battery_id: string
          customer_id: string | null
          rented_at: string
          returned_at: string | null
          status: "ACTIVE" | "RETURNED"
          created_at: string
        }
        Insert: {
          id?: string
          aged_battery_id: string
          customer_id?: string | null
          rented_at?: string
          returned_at?: string | null
          status?: "ACTIVE" | "RETURNED"
          created_at?: string
        }
        Update: {
          id?: string
          aged_battery_id?: string
          customer_id?: string | null
          rented_at?: string
          returned_at?: string | null
          status?: "ACTIVE" | "RETURNED"
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "aged_battery_rentals_aged_battery_id_fkey"
            columns: ["aged_battery_id"]
            isOneToOne: false
            referencedRelation: "aged_batteries"
            referencedColumns: ["id"]
          },
        ]
      }
      aged_battery_events: {
        Row: {
          id: string
          aged_battery_id: string
          event_type: string
          performed_by: string | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          aged_battery_id: string
          event_type: string
          performed_by?: string | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          aged_battery_id?: string
          event_type?: string
          performed_by?: string | null
          notes?: string | null
          created_at?: string
        }
        Relationships: []
      }
      aged_scan_logs: {
        Row: {
          id: string
          barcode: string | null
          product_id: string | null
          batch_id: string | null
          scanned_by: string | null
          scan_status: string | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          barcode?: string | null
          product_id?: string | null
          batch_id?: string | null
          scanned_by?: string | null
          scan_status?: string | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          barcode?: string | null
          product_id?: string | null
          batch_id?: string | null
          scanned_by?: string | null
          scan_status?: string | null
          notes?: string | null
          created_at?: string
        }
        Relationships: []
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
      transfer_aged_battery: {
        Args: {
          p_product_id: string
          p_barcode: string
          p_batch_id: string
          p_user: string
        }
        Returns: { success: boolean; message: string; battery_id: string }
      }
      toggle_claim_status: {
        Args: {
          p_claim: boolean
          p_id: string
        }
        Returns: { success: boolean; message: string; claimed: boolean }
      }
      rent_aged_battery: {
        Args: {
          p_aged_id: string
          p_customer: string
        }
        Returns: { success: boolean; message: string }
      }
      return_aged_battery: {
        Args: {
          p_aged_id: string
        }
        Returns: { success: boolean; message: string }
      }
      scrap_aged_battery: {
        Args: {
          p_aged_id: string
          p_remarks: string
          p_scrap_value: number
          p_user: string
        }
        Returns: { success: boolean; message: string }
      }
      sell_aged_battery: {
        Args: {
          p_aged_id: string
          p_customer: string
        }
        Returns: { success: boolean; message: string }
      }
      admin_delete_aged_battery: {
        Args: {
          p_aged_id: string
          p_user: string
        }
        Returns: { success: boolean; message: string }
      }
      delete_scrap_entry: {
        Args: {
          p_scrap_id: string
        }
        Returns: { success: boolean; message: string }
      }
      reverse_sale: {
        Args: {
          p_aged_id: string
          p_user: string
        }
        Returns: { success: boolean; message: string }
      }
      reverse_rental: {
        Args: {
          p_rental_id: string
          p_user: string
        }
        Returns: { success: boolean; message: string }
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "counter_staff"
        | "service_agent"
        | "service_technician"
        | "warehouse_staff"
        | "procurement_staff"
        | "sp_battery"
        | "sp_invertor"
        | "scrap_manager"
      service_status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED"
      stock_source: "SUPPLIER" | "WAREHOUSE"
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
        "scrap_manager",
      ],
      service_status: ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"],
      stock_source: ["SUPPLIER", "WAREHOUSE"],
      transaction_type: ["IN", "OUT"],
    },
  },
} as const
