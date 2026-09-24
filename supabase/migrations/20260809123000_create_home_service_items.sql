-- Create the missing home_service_items table expected by the current app.
-- This restores multi-item home-service resolution while preserving legacy
-- battery_model/inverter_model values already stored on home_service_requests.

CREATE TABLE IF NOT EXISTS public.home_service_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.home_service_requests(id) ON DELETE CASCADE,
  item_type text NOT NULL CHECK (item_type = ANY (ARRAY['BATTERY'::text, 'INVERTER'::text])),
  model text NOT NULL,
  issue_description text,
  resolved boolean DEFAULT false,
  price numeric DEFAULT 0,
  within_warranty boolean,
  notes text,
  resolved_by uuid REFERENCES auth.users(id),
  resolved_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT home_service_items_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_home_service_items_request_id
  ON public.home_service_items(request_id);

CREATE INDEX IF NOT EXISTS idx_home_service_items_resolved_by
  ON public.home_service_items(resolved_by);

CREATE INDEX IF NOT EXISTS idx_home_service_items_item_type
  ON public.home_service_items(item_type);

DROP TRIGGER IF EXISTS update_home_service_items_updated_at ON public.home_service_items;
CREATE TRIGGER update_home_service_items_updated_at
BEFORE UPDATE ON public.home_service_items
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Backfill one item per legacy model for existing requests.
INSERT INTO public.home_service_items (
  request_id,
  item_type,
  model,
  issue_description,
  created_at,
  updated_at
)
SELECT
  r.id,
  'BATTERY',
  r.battery_model,
  r.issue_description,
  r.created_at,
  now()
FROM public.home_service_requests r
WHERE r.battery_model IS NOT NULL
  AND btrim(r.battery_model) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM public.home_service_items i
    WHERE i.request_id = r.id
      AND i.item_type = 'BATTERY'
      AND i.model = r.battery_model
  );

INSERT INTO public.home_service_items (
  request_id,
  item_type,
  model,
  issue_description,
  created_at,
  updated_at
)
SELECT
  r.id,
  'INVERTER',
  r.inverter_model,
  r.issue_description,
  r.created_at,
  now()
FROM public.home_service_requests r
WHERE r.inverter_model IS NOT NULL
  AND btrim(r.inverter_model) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM public.home_service_items i
    WHERE i.request_id = r.id
      AND i.item_type = 'INVERTER'
      AND i.model = r.inverter_model
  );

ALTER TABLE public.home_service_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_all_home_service_items ON public.home_service_items;
DROP POLICY IF EXISTS authenticated_view_home_service_items ON public.home_service_items;
DROP POLICY IF EXISTS counter_staff_create_home_service_items ON public.home_service_items;
DROP POLICY IF EXISTS technician_update_assigned_home_service_items ON public.home_service_items;

CREATE POLICY admin_all_home_service_items
  ON public.home_service_items
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY authenticated_view_home_service_items
  ON public.home_service_items
  FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1
      FROM public.home_service_requests r
      WHERE r.id = home_service_items.request_id
    )
  );

CREATE POLICY counter_staff_create_home_service_items
  ON public.home_service_items
  FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'counter_staff'::public.app_role)
    AND EXISTS (
      SELECT 1
      FROM public.home_service_requests r
      WHERE r.id = home_service_items.request_id
        AND r.created_by = auth.uid()
    )
  );

CREATE POLICY technician_update_assigned_home_service_items
  ON public.home_service_items
  FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'service_technician'::public.app_role)
    AND EXISTS (
      SELECT 1
      FROM public.home_service_requests r
      WHERE r.id = home_service_items.request_id
        AND r.assigned_to = auth.uid()
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'service_technician'::public.app_role)
    AND EXISTS (
      SELECT 1
      FROM public.home_service_requests r
      WHERE r.id = home_service_items.request_id
        AND r.assigned_to = auth.uid()
    )
  );

