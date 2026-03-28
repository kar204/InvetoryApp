-- Fix admin RLS for home_service_requests
-- Uses public.has_role() function instead of LIMIT 1 subquery

-- Drop existing home_service_requests policies
DROP POLICY IF EXISTS admin_select_home_service_requests ON public.home_service_requests;
DROP POLICY IF EXISTS admin_insert_home_service_requests ON public.home_service_requests;
DROP POLICY IF EXISTS admin_update_home_service_requests ON public.home_service_requests;
DROP POLICY IF EXISTS admin_delete_home_service_requests ON public.home_service_requests;
DROP POLICY IF EXISTS counter_staff_create_home_requests ON public.home_service_requests;
DROP POLICY IF EXISTS counter_staff_view_own_home_requests ON public.home_service_requests;
DROP POLICY IF EXISTS technician_view_assigned_requests ON public.home_service_requests;
DROP POLICY IF EXISTS technician_update_assigned_requests ON public.home_service_requests;
DROP POLICY IF EXISTS "Authenticated users can view home_service_requests" ON public.home_service_requests;
DROP POLICY IF EXISTS "Authenticated users can update home_service_requests" ON public.home_service_requests;

-- Admin: full access using has_role function
CREATE POLICY admin_all_home_service_requests
  ON public.home_service_requests
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Counter staff: create + view own (no update/delete)
CREATE POLICY counter_staff_create_home_requests
  ON public.home_service_requests
  FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'counter_staff')
    AND auth.uid() = created_by
  );

CREATE POLICY counter_staff_view_own_home_requests
  ON public.home_service_requests
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'counter_staff')
    AND auth.uid() = created_by
  );

-- Service technician: view assigned + update assigned (to close)
CREATE POLICY technician_view_assigned_requests
  ON public.home_service_requests
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'service_technician')
    AND assigned_to = auth.uid()
  );

CREATE POLICY technician_update_assigned_requests
  ON public.home_service_requests
  FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'service_technician')
    AND assigned_to = auth.uid()
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'service_technician')
    AND assigned_to = auth.uid()
  );

-- Authenticated users can view all home_service_requests (for listing)
CREATE POLICY authenticated_view_home_service_requests
  ON public.home_service_requests
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Drop existing home_service_resolutions policies
DROP POLICY IF EXISTS admin_select_home_service_resolutions ON public.home_service_resolutions;
DROP POLICY IF EXISTS admin_delete_home_service_resolutions ON public.home_service_resolutions;
DROP POLICY IF EXISTS technician_create_resolutions ON public.home_service_resolutions;
DROP POLICY IF EXISTS technician_view_own_resolutions ON public.home_service_resolutions;
DROP POLICY IF EXISTS counter_staff_view_own_resolutions ON public.home_service_resolutions;
DROP POLICY IF EXISTS view_resolutions ON public.home_service_resolutions;
DROP POLICY IF EXISTS "Authenticated users can view home_service_resolutions" ON public.home_service_resolutions;

-- Admin: full access to resolutions
CREATE POLICY admin_all_home_service_resolutions
  ON public.home_service_resolutions
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Technician: create resolution for their assigned request; view own resolutions
CREATE POLICY technician_create_resolutions
  ON public.home_service_resolutions
  FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'service_technician')
    AND auth.uid() = resolved_by
    AND auth.uid() = closed_by
  );

CREATE POLICY technician_view_own_resolutions
  ON public.home_service_resolutions
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'service_technician')
    AND (resolved_by = auth.uid() OR closed_by = auth.uid())
  );

-- Authenticated users can view all resolutions
CREATE POLICY authenticated_view_home_service_resolutions
  ON public.home_service_resolutions
  FOR SELECT
  USING (auth.role() = 'authenticated');
