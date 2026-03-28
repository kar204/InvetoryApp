export type AppRole = 'admin' | 'counter_staff' | 'service_agent' | 'warehouse_staff' | 'procurement_staff' | 'sp_battery' | 'sp_invertor' | 'scrap_manager' | 'service_technician';

export type ServiceStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

export type TransactionType = 'IN' | 'OUT';

export type StockSource = 'SUPPLIER' | 'WAREHOUSE';

export type SecondHandTransactionType = 'SALE' | 'RENT_OUT' | 'GOOD_WILL';

export type SecondHandLifecycleStatus = 'SOLD' | 'ACTIVE' | 'PARTIALLY_RETURNED' | 'RETURNED';

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

export interface SecondHandLifecycleRecord {
  id: string;
  transaction_group_id: string;
  transaction_type: SecondHandTransactionType;
  lifecycle_status: SecondHandLifecycleStatus;
  customer_name: string;
  mobile_number: string | null;
  address: string | null;
  product_id: string;
  product_name: string;
  product_model: string;
  product_category: string;
  quantity: number;
  returned_quantity: number;
  unit_price: number;
  payment_method: 'CASH' | 'CARD' | 'UPI' | null;
  start_date: string | null;
  end_date: string | null;
  remarks: string | null;
  returned_at: string | null;
  return_remarks: string | null;
  recorded_by: string;
  created_at: string;
  updated_at: string;
  product?: Product | null;
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

export interface HomeServiceRequest {
  id: string;
  request_number: string;
  customer_name: string;
  customer_phone: string;
  address: string;
  battery_model: string | null;
  inverter_model: string | null;
  spare_supplied: string | null;
  issue_description: string;
  status: ServiceStatus;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  created_by: string;
  assigned_to: string | null;
  assigned_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface HomeServiceResolution {
  id: string;
  request_id: string;
  battery_resolved: boolean | null;
  battery_resolution_notes: string | null;
  inverter_resolved: boolean | null;
  inverter_resolution_notes: string | null;
  total_amount: number | null;
  payment_method: 'CASH' | 'CARD' | 'UPI' | null;
  resolved_by: string;
  resolved_at: string;
  closed_by: string;
  closed_at: string;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  city: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type AgedBatteryStatus = 'IN_STOCK' | 'RENTED' | 'RETURNED' | 'SOLD' | 'SCRAPPED';

export interface AgedBattery {
  id: string;
  product_id: string;
  barcode: string;
  batch_id: string | null;
  transfer_transaction_id: string | null;
  claimed: boolean;
  status: AgedBatteryStatus;
  customer_id: string | null;
  created_at: string;
  product?: Product;
  customer?: Customer;
  batch?: AgedTransferBatch;
}

export interface AgedTransferBatch {
  id: string;
  batch_name: string | null;
  notes: string | null;
  status: 'OPEN' | 'COMPLETED' | 'CANCELLED';
  created_by: string | null;
  created_at: string;
}

export interface AgedBatteryEvent {
  id: string;
  aged_battery_id: string;
  event_type: string;
  performed_by: string | null;
  notes: string | null;
  created_at: string;
}

export interface AgedScanLog {
  id: string;
  barcode: string | null;
  product_id: string | null;
  batch_id: string | null;
  scanned_by: string | null;
  scan_status: string | null;
  notes: string | null;
  created_at: string;
}

export interface AgedBatteryRental {
  id: string;
  aged_battery_id: string;
  customer_id: string | null;
  rented_at: string;
  returned_at: string | null;
  status: 'ACTIVE' | 'RETURNED';
  created_at: string;
  aged_battery?: AgedBattery;
  customer?: Customer;
}
