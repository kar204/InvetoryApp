-- ============================================
-- CUSTOMERS TABLE (Unified for both service types)
-- ============================================

CREATE TABLE IF NOT EXISTS public.customers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text NOT NULL UNIQUE,
  email text,
  address text,
  city text,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT customers_pkey PRIMARY KEY (id)
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_name ON public.customers(name);

-- ============================================
-- Update home_service_requests to reference customers
-- ============================================

ALTER TABLE public.home_service_requests
ADD COLUMN customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL;

-- Create index
CREATE INDEX IF NOT EXISTS idx_home_service_requests_customer_id ON public.home_service_requests(customer_id);

-- ============================================
-- Updated service_tickets to reference customers (optional but recommended)
-- ============================================

ALTER TABLE public.service_tickets
ADD COLUMN customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL;

-- Create index
CREATE INDEX IF NOT EXISTS idx_service_tickets_customer_id ON public.service_tickets(customer_id);

-- ============================================
-- RLS POLICIES FOR CUSTOMERS
-- ============================================

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- Everyone can view customers
CREATE POLICY "view_customers"
  ON public.customers
  FOR SELECT
  USING (true);

-- Service Desk (counter_staff) and admins can create/update customers
CREATE POLICY "counter_staff_manage_customers"
  ON public.customers
  FOR INSERT
  WITH CHECK (
    (SELECT role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1) IN ('admin', 'counter_staff')
  );

CREATE POLICY "counter_staff_update_customers"
  ON public.customers
  FOR UPDATE
  WITH CHECK (
    (SELECT role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1) IN ('admin', 'counter_staff')
  );
