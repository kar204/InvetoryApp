-- Home service request number generation (HSR + YYMM + 4-digit sequence).
-- Example: HSR26030005

CREATE OR REPLACE FUNCTION public.generate_home_service_request_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  new_number text;
  year_month text;
  seq_num integer;
  prefix text := 'HSR';
BEGIN
  IF NEW.request_number IS NOT NULL AND btrim(NEW.request_number) <> '' THEN
    RETURN NEW;
  END IF;

  year_month := TO_CHAR(NOW(), 'YYMM');

  -- Prevent duplicate numbers under concurrent inserts.
  PERFORM pg_advisory_xact_lock(hashtext(prefix || year_month));

  SELECT COALESCE(MAX(CAST(SUBSTRING(request_number FROM 8 FOR 4) AS INTEGER)), 0) + 1
    INTO seq_num
    FROM public.home_service_requests
   WHERE request_number LIKE prefix || year_month || '%';

  new_number := prefix || year_month || LPAD(seq_num::text, 4, '0');
  NEW.request_number := new_number;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_generate_home_service_request_number'
  ) THEN
    CREATE TRIGGER trg_generate_home_service_request_number
    BEFORE INSERT ON public.home_service_requests
    FOR EACH ROW
    WHEN (NEW.request_number IS NULL OR btrim(NEW.request_number) = '')
    EXECUTE FUNCTION public.generate_home_service_request_number();
  END IF;
END;
$$;

