-- Ensure RLS is enabled for SLA tables and policies are in effect.

ALTER TABLE public.service_ticket_sla ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_service_request_sla ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_view_all_sla ON public.service_ticket_sla;
DROP POLICY IF EXISTS counter_staff_view_own_sla ON public.service_ticket_sla;
DROP POLICY IF EXISTS admin_view_all_home_sla ON public.home_service_request_sla;
DROP POLICY IF EXISTS counter_staff_view_own_home_sla ON public.home_service_request_sla;

-- Admins can view all SLA data
CREATE POLICY admin_view_all_sla
  ON public.service_ticket_sla
  FOR SELECT
  USING (
    (SELECT role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1) = 'admin'::app_role
  );

CREATE POLICY admin_view_all_home_sla
  ON public.home_service_request_sla
  FOR SELECT
  USING (
    (SELECT role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1) = 'admin'::app_role
  );

-- Counter staff can view SLA for tickets they created
CREATE POLICY counter_staff_view_own_sla
  ON public.service_ticket_sla
  FOR SELECT
  USING (
    (SELECT role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1) = 'counter_staff'::app_role
    AND (SELECT created_by FROM public.service_tickets WHERE id = ticket_id) = auth.uid()
  );

CREATE POLICY counter_staff_view_own_home_sla
  ON public.home_service_request_sla
  FOR SELECT
  USING (
    (SELECT role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1) = 'counter_staff'::app_role
    AND (SELECT created_by FROM public.home_service_requests WHERE id = request_id) = auth.uid()
  );

