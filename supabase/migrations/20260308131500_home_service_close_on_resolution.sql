-- Keep home_service_requests in sync with home_service_resolutions.
--
-- Problem:
-- A resolution row can be inserted even when the request row status isn't updated
-- (RLS mismatch, client error, etc.), leaving UI stuck at IN_PROGRESS.
--
-- Fix:
-- On INSERT into home_service_resolutions, automatically set the parent request to CLOSED.

CREATE OR REPLACE FUNCTION public.close_home_service_request_on_resolution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.home_service_requests
  SET status = 'CLOSED',
      updated_at = now()
  WHERE id = NEW.request_id
    AND status <> 'CLOSED';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS home_service_close_on_resolution_trigger ON public.home_service_resolutions;
CREATE TRIGGER home_service_close_on_resolution_trigger
AFTER INSERT ON public.home_service_resolutions
FOR EACH ROW
EXECUTE FUNCTION public.close_home_service_request_on_resolution();

