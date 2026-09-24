-- Home-service base schema was previously maintained outside supabase/migrations.
-- Keep it here so a clean project can apply every later service migration.

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'service_technician';

CREATE TABLE IF NOT EXISTS public.home_service_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number text NOT NULL UNIQUE,
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  address text NOT NULL,
  battery_model text,
  inverter_model text,
  issue_description text NOT NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED')),
  priority text NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH')),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.home_service_resolutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE REFERENCES public.home_service_requests(id) ON DELETE CASCADE,
  battery_resolved boolean,
  battery_resolution_notes text,
  battery_within_warranty boolean,
  battery_price numeric,
  inverter_resolved boolean,
  inverter_resolution_notes text,
  inverter_price numeric,
  total_amount numeric,
  payment_method text CHECK (payment_method IN ('CASH', 'CARD', 'UPI')),
  resolved_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resolved_at timestamptz NOT NULL,
  closed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  closed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_home_service_requests_status ON public.home_service_requests(status);
CREATE INDEX IF NOT EXISTS idx_home_service_requests_assigned_to ON public.home_service_requests(assigned_to);
CREATE INDEX IF NOT EXISTS idx_home_service_requests_created_by ON public.home_service_requests(created_by);
CREATE INDEX IF NOT EXISTS idx_home_service_resolutions_request_id ON public.home_service_resolutions(request_id);

ALTER TABLE public.home_service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_service_resolutions ENABLE ROW LEVEL SECURITY;
