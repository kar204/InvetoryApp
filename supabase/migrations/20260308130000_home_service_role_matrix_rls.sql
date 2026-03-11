-- Home service role matrix (RLS)
--
-- Desired behavior:
-- - admin: create/manage/update/delete
-- - counter_staff: create only (+ view own)
-- - service_technician: view assigned + resolve/close (no delete)

-- Ensure RLS is on
ALTER TABLE public.home_service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_service_resolutions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies (safe re-run)
DROP POLICY IF EXISTS admin_select_home_service_requests ON public.home_service_requests;
DROP POLICY IF EXISTS admin_view_all_home_requests ON public.home_service_requests;
DROP POLICY IF EXISTS counter_staff_create_home_requests ON public.home_service_requests;
DROP POLICY IF EXISTS counter_staff_update_home_requests ON public.home_service_requests;
DROP POLICY IF EXISTS counter_staff_view_home_requests ON public.home_service_requests;
DROP POLICY IF EXISTS technician_view_assigned_requests ON public.home_service_requests;
DROP POLICY IF EXISTS technician_update_assigned_requests ON public.home_service_requests;

DROP POLICY IF EXISTS service_desk_view_all_resolutions ON public.home_service_resolutions;
DROP POLICY IF EXISTS technician_create_resolutions ON public.home_service_resolutions;
DROP POLICY IF EXISTS view_resolutions ON public.home_service_resolutions;

-- Role helpers (reuse the style already used in your DB)
-- Note: these subqueries assume one role per user for simplicity (LIMIT 1).

-- ============================
-- home_service_requests
-- ============================

-- Admin can do everything
CREATE POLICY admin_select_home_service_requests
  ON public.home_service_requests
  FOR SELECT
  USING (
    (SELECT role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1) = 'admin'::app_role
  );

CREATE POLICY admin_insert_home_service_requests
  ON public.home_service_requests
  FOR INSERT
  WITH CHECK (
    (SELECT role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1) = 'admin'::app_role
    AND auth.uid() = created_by
  );

CREATE POLICY admin_update_home_service_requests
  ON public.home_service_requests
  FOR UPDATE
  USING (
    (SELECT role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1) = 'admin'::app_role
  )
  WITH CHECK (
    (SELECT role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1) = 'admin'::app_role
  );

CREATE POLICY admin_delete_home_service_requests
  ON public.home_service_requests
  FOR DELETE
  USING (
    (SELECT role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1) = 'admin'::app_role
  );

-- Counter staff: create + view own (no update/delete)
CREATE POLICY counter_staff_create_home_requests
  ON public.home_service_requests
  FOR INSERT
  WITH CHECK (
    (SELECT role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1) = 'counter_staff'::app_role
    AND auth.uid() = created_by
  );

CREATE POLICY counter_staff_view_own_home_requests
  ON public.home_service_requests
  FOR SELECT
  USING (
    (SELECT role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1) = 'counter_staff'::app_role
    AND auth.uid() = created_by
  );

-- Service technician: view assigned + update assigned (to close)
CREATE POLICY technician_view_assigned_requests
  ON public.home_service_requests
  FOR SELECT
  USING (
    (SELECT role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1) = 'service_technician'::app_role
    AND assigned_to = auth.uid()
  );

CREATE POLICY technician_update_assigned_requests
  ON public.home_service_requests
  FOR UPDATE
  USING (
    (SELECT role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1) = 'service_technician'::app_role
    AND assigned_to = auth.uid()
  )
  WITH CHECK (
    (SELECT role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1) = 'service_technician'::app_role
    AND assigned_to = auth.uid()
  );

-- ============================
-- home_service_resolutions
-- ============================

-- Admin can view all resolutions (and delete for cascade safety)
CREATE POLICY admin_select_home_service_resolutions
  ON public.home_service_resolutions
  FOR SELECT
  USING (
    (SELECT role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1) = 'admin'::app_role
  );

CREATE POLICY admin_delete_home_service_resolutions
  ON public.home_service_resolutions
  FOR DELETE
  USING (
    (SELECT role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1) = 'admin'::app_role
  );

-- Technician: create resolution for their assigned request; view own resolutions
CREATE POLICY technician_create_resolutions
  ON public.home_service_resolutions
  FOR INSERT
  WITH CHECK (
    (SELECT role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1) = 'service_technician'::app_role
    AND auth.uid() = resolved_by
    AND auth.uid() = closed_by
    AND EXISTS (
      SELECT 1
      FROM public.home_service_requests r
      WHERE r.id = home_service_resolutions.request_id
        AND r.assigned_to = auth.uid()
        AND r.status <> 'CLOSED'
    )
  );

CREATE POLICY technician_view_own_resolutions
  ON public.home_service_resolutions
  FOR SELECT
  USING (
    (SELECT role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1) = 'service_technician'::app_role
    AND (resolved_by = auth.uid() OR closed_by = auth.uid())
  );

-- Counter staff can view resolutions for requests they created
CREATE POLICY counter_staff_view_own_resolutions
  ON public.home_service_resolutions
  FOR SELECT
  USING (
    (SELECT role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1) = 'counter_staff'::app_role
    AND EXISTS (
      SELECT 1
      FROM public.home_service_requests r
      WHERE r.id = home_service_resolutions.request_id
        AND r.created_by = auth.uid()
    )
  );

