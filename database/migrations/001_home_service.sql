-- ============================================
-- HOME SERVICE MODULE MIGRATION
-- ============================================

-- Create home_service_requests table
CREATE TABLE IF NOT EXISTS public.home_service_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
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
  assigned_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT home_service_requests_pkey PRIMARY KEY (id)
);

-- Create home_service_resolutions table
CREATE TABLE IF NOT EXISTS public.home_service_resolutions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE REFERENCES public.home_service_requests(id) ON DELETE CASCADE,
  battery_resolved boolean,
  battery_resolution_notes text,
  inverter_resolved boolean,
  inverter_resolution_notes text,
  total_amount numeric,
  payment_method text CHECK (payment_method IN ('CASH', 'CARD', 'UPI')),
  resolved_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resolved_at timestamp with time zone NOT NULL,
  closed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  closed_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT home_service_resolutions_pkey PRIMARY KEY (id)
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_home_service_requests_status ON public.home_service_requests(status);
CREATE INDEX IF NOT EXISTS idx_home_service_requests_assigned_to ON public.home_service_requests(assigned_to);
CREATE INDEX IF NOT EXISTS idx_home_service_requests_created_by ON public.home_service_requests(created_by);
CREATE INDEX IF NOT EXISTS idx_home_service_resolutions_request_id ON public.home_service_resolutions(request_id);
CREATE INDEX IF NOT EXISTS idx_home_service_resolutions_resolved_by ON public.home_service_resolutions(resolved_by);

-- ============================================
-- RLS POLICIES
-- ============================================

-- Enable RLS
ALTER TABLE public.home_service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_service_resolutions ENABLE ROW LEVEL SECURITY;

-- HOME_SERVICE_REQUESTS RLS Policies

-- Service Desk (counter_staff) can create home service requests
CREATE POLICY "counter_staff_create_home_requests"
  ON public.home_service_requests
  FOR INSERT
  WITH CHECK (
    auth.uid() = created_by AND
    (SELECT role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1) IN ('admin', 'counter_staff')
  );

-- Service Desk (counter_staff) can view all requests
CREATE POLICY "counter_staff_view_home_requests"
  ON public.home_service_requests
  FOR SELECT
  USING (
    (SELECT role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1) IN ('admin', 'counter_staff')
    OR assigned_to = auth.uid()
  );

-- Service Technician can view only assigned requests
CREATE POLICY "technician_view_assigned_requests"
  ON public.home_service_requests
  FOR SELECT
  USING (assigned_to = auth.uid());

-- Service Desk (counter_staff) can update request status and assignments
CREATE POLICY "counter_staff_update_home_requests"
  ON public.home_service_requests
  FOR UPDATE
  USING (
    (SELECT role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1) IN ('admin', 'counter_staff')
  )
  WITH CHECK (
    (SELECT role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1) IN ('admin', 'counter_staff')
  );

-- HOME_SERVICE_RESOLUTIONS RLS Policies

-- Service Technician can create resolutions for assigned requests
CREATE POLICY "technician_create_resolutions"
  ON public.home_service_resolutions
  FOR INSERT
  WITH CHECK (
    auth.uid() = resolved_by AND
    auth.uid() = closed_by AND
    (SELECT role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1) = 'service_technician' AND
    EXISTS (
      SELECT 1 FROM public.home_service_requests
      WHERE id = request_id AND assigned_to = auth.uid()
    )
  );

-- Everyone can view resolutions for their own requests
CREATE POLICY "view_resolutions"
  ON public.home_service_resolutions
  FOR SELECT
  USING (
    resolved_by = auth.uid() OR
    closed_by = auth.uid() OR
    (SELECT created_by FROM public.home_service_requests WHERE id = request_id) = auth.uid()
  );

-- Service Desk can view all resolutions
CREATE POLICY "service_desk_view_all_resolutions"
  ON public.home_service_resolutions
  FOR SELECT
  USING (
    (SELECT role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1) IN ('admin', 'service_agent')
  );

-- Grant permissions to authenticated users (optional but useful)
GRANT SELECT ON public.home_service_requests TO authenticated;
GRANT SELECT ON public.home_service_resolutions TO authenticated;
