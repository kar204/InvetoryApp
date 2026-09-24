-- Make the multi-item service workflows reproducible, role-compatible, and safe
-- for records created before the item tables existed.

CREATE TABLE IF NOT EXISTS public.service_ticket_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.service_tickets(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  item_type text NOT NULL CHECK (item_type IN ('BATTERY', 'INVERTER')),
  model text NOT NULL CHECK (btrim(model) <> ''),
  issue_description text,
  within_warranty boolean,
  resolved boolean NOT NULL DEFAULT false,
  price numeric NOT NULL DEFAULT 0 CHECK (price >= 0),
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_ticket_items_ticket_id ON public.service_ticket_items(ticket_id);
CREATE INDEX IF NOT EXISTS idx_service_ticket_items_ticket_type ON public.service_ticket_items(ticket_id, item_type);

-- Materialise old one-model tickets once, so the current item-based resolver
-- works for both old and new records.
INSERT INTO public.service_ticket_items (ticket_id, item_type, model, issue_description)
SELECT t.id, 'BATTERY', t.battery_model, t.issue_description
FROM public.service_tickets t
WHERE NULLIF(btrim(t.battery_model), '') IS NOT NULL
  AND t.battery_model <> '-'
  AND NOT EXISTS (
    SELECT 1 FROM public.service_ticket_items i
    WHERE i.ticket_id = t.id AND i.item_type = 'BATTERY'
  );

INSERT INTO public.service_ticket_items (ticket_id, item_type, model, issue_description)
SELECT t.id, 'INVERTER', t.invertor_model, t.issue_description
FROM public.service_tickets t
WHERE NULLIF(btrim(t.invertor_model), '') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.service_ticket_items i
    WHERE i.ticket_id = t.id AND i.item_type = 'INVERTER'
  );

ALTER TABLE public.service_ticket_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS authenticated_view_service_ticket_items ON public.service_ticket_items;
DROP POLICY IF EXISTS service_staff_insert_service_ticket_items ON public.service_ticket_items;
DROP POLICY IF EXISTS service_staff_update_service_ticket_items ON public.service_ticket_items;

CREATE POLICY authenticated_view_service_ticket_items
  ON public.service_ticket_items FOR SELECT TO authenticated USING (true);

CREATE POLICY service_staff_insert_service_ticket_items
  ON public.service_ticket_items FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR (public.has_role(auth.uid(), 'counter_staff') AND EXISTS (
      SELECT 1 FROM public.service_tickets t WHERE t.id = ticket_id AND t.created_by = auth.uid()
    ))
    OR (public.has_role(auth.uid(), 'sp_battery') AND item_type = 'BATTERY' AND EXISTS (
      SELECT 1 FROM public.service_tickets t WHERE t.id = ticket_id AND t.assigned_to_battery = auth.uid()
    ))
    OR (public.has_role(auth.uid(), 'sp_invertor') AND item_type = 'INVERTER' AND EXISTS (
      SELECT 1 FROM public.service_tickets t WHERE t.id = ticket_id AND t.assigned_to_invertor = auth.uid()
    ))
  );

CREATE POLICY service_staff_update_service_ticket_items
  ON public.service_ticket_items FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'counter_staff')
    OR (public.has_role(auth.uid(), 'sp_battery') AND item_type = 'BATTERY' AND EXISTS (
      SELECT 1 FROM public.service_tickets t WHERE t.id = ticket_id AND t.assigned_to_battery = auth.uid()
    ))
    OR (public.has_role(auth.uid(), 'sp_invertor') AND item_type = 'INVERTER' AND EXISTS (
      SELECT 1 FROM public.service_tickets t WHERE t.id = ticket_id AND t.assigned_to_invertor = auth.uid()
    ))
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'counter_staff')
    OR (public.has_role(auth.uid(), 'sp_battery') AND item_type = 'BATTERY' AND EXISTS (
      SELECT 1 FROM public.service_tickets t WHERE t.id = ticket_id AND t.assigned_to_battery = auth.uid()
    ))
    OR (public.has_role(auth.uid(), 'sp_invertor') AND item_type = 'INVERTER' AND EXISTS (
      SELECT 1 FROM public.service_tickets t WHERE t.id = ticket_id AND t.assigned_to_invertor = auth.uid()
    ))
  );

DROP POLICY IF EXISTS "Service tickets update policy" ON public.service_tickets;
CREATE POLICY "Service tickets update policy" ON public.service_tickets FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'counter_staff')
  OR public.has_role(auth.uid(), 'service_technician')
  OR (public.has_role(auth.uid(), 'sp_battery') AND assigned_to_battery = auth.uid())
  OR (public.has_role(auth.uid(), 'sp_invertor') AND assigned_to_invertor = auth.uid())
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'counter_staff')
  OR public.has_role(auth.uid(), 'service_technician')
  OR (public.has_role(auth.uid(), 'sp_battery') AND assigned_to_battery = auth.uid())
  OR (public.has_role(auth.uid(), 'sp_invertor') AND assigned_to_invertor = auth.uid())
);

-- A home-service resolution represents the latest result. Upsert support lets a
-- technician revisit an unresolved request instead of being blocked by the
-- one-resolution-per-request constraint.
DROP POLICY IF EXISTS technician_update_own_resolutions ON public.home_service_resolutions;
CREATE POLICY technician_update_own_resolutions ON public.home_service_resolutions FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'service_technician') AND resolved_by = auth.uid() AND closed_by = auth.uid())
WITH CHECK (public.has_role(auth.uid(), 'service_technician') AND resolved_by = auth.uid() AND closed_by = auth.uid());

-- Permit a technician to materialise a legacy request's displayed item while
-- resolving a request assigned to them. Normal creation remains with service
-- desk/admin users under the existing policy.
DROP POLICY IF EXISTS technician_insert_assigned_home_service_items ON public.home_service_items;
CREATE POLICY technician_insert_assigned_home_service_items ON public.home_service_items FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'service_technician')
  AND EXISTS (
    SELECT 1 FROM public.home_service_requests r
    WHERE r.id = request_id AND r.assigned_to = auth.uid()
  )
);

CREATE OR REPLACE FUNCTION public.close_home_service_request_on_resolution()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.home_service_requests
  SET status = CASE
      WHEN COALESCE(NEW.battery_resolved, true) AND COALESCE(NEW.inverter_resolved, true) THEN 'CLOSED'
      ELSE 'IN_PROGRESS'
    END,
    updated_at = now()
  WHERE id = NEW.request_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS home_service_close_on_resolution_trigger ON public.home_service_resolutions;
CREATE TRIGGER home_service_close_on_resolution_trigger
AFTER INSERT OR UPDATE ON public.home_service_resolutions
FOR EACH ROW EXECUTE FUNCTION public.close_home_service_request_on_resolution();
