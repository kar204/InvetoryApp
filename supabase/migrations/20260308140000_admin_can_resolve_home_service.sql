-- Allow admin to resolve/close home service requests (insert resolutions).

DROP POLICY IF EXISTS admin_create_home_service_resolutions ON public.home_service_resolutions;
CREATE POLICY admin_create_home_service_resolutions
  ON public.home_service_resolutions
  FOR INSERT
  WITH CHECK (
    (SELECT role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1) = 'admin'::app_role
    AND auth.uid() = resolved_by
    AND auth.uid() = closed_by
  );

