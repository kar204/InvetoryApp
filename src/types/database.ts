export type AppRole = 'admin' | 'counter_staff' | 'service_agent' | 'warehouse_staff' | 'procurement_staff' | 'sp_battery' | 'sp_invertor' | 'scrap_manager';

export type ServiceStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

export type TransactionType = 'IN' | 'OUT';

export type StockSource = 'SUPPLIER' | 'WAREHOUSE';

export interface Profile {
  id: string;
  user_id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
  created_at: string;
}

export interface ServiceTicket {
  id: string;
  ticket_number: string | null;
  customer_name: string;
  customer_phone: string;
  battery_model: string;
  invertor_model: string | null;
  issue_description: string;
  status: ServiceStatus;
  resolution_notes: string | null;
  service_price: number | null;
  payment_method: 'CASH' | 'CARD' | 'UPI' | null;
  assigned_to: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  // New dual-assignment fields
  assigned_to_battery: string | null;
  assigned_to_invertor: string | null;
  battery_rechargeable: boolean | null;
  battery_resolved: boolean | null;
  battery_price: number | null;
  battery_resolved_by: string | null;
  battery_resolved_at: string | null;
  invertor_resolved: boolean | null;
  invertor_price: number | null;
  invertor_resolved_by: string | null;
  invertor_resolved_at: string | null;
  invertor_issue_description: string | null;
}

export interface ServiceLog {
  id: string;
  ticket_id: string;
  action: string;
  notes: string | null;
  user_id: string;
  created_at: string;
}

export interface Product {
  id: string;
  name: string;
  model: string;
  capacity: string | null;
  category: string;
  created_at: string;
  updated_at: string;
}

export interface WarehouseStock {
  id: string;
  product_id: string;
  quantity: number;
  updated_at: string;
  product?: Product;
}

export interface StockTransaction {
  id: string;
  product_id: string;
  quantity: number;
  transaction_type: TransactionType;
  source: StockSource;
  handled_by: string;
  remarks: string | null;
  created_at: string;
  product?: Product;
}

export interface WarehouseSale {
  id: string;
  customer_name: string;
  sold_by: string;
  total_amount: number;
  payment_method: string;
  created_at: string;
}

export interface WarehouseSaleItem {
  id: string;
  sale_id: string;
  product_id: string;
  product_type: string;
  model_number: string;
  quantity: number;
  price: number;
  created_at: string;
  product?: Product;
}
