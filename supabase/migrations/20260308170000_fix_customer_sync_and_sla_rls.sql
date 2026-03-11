-- Fix customer sync for existing/new service tickets and keep SLA RLS enabled safely.
--
-- Problems solved:
-- 1. Existing in-shop service tickets may not have been backfilled into public.customers.
-- 2. SLA tables fail under RLS because trigger functions write as the caller.

-- ============================================
-- CUSTOMERS POLICIES
-- ============================================

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS view_customers ON public.customers;
DROP POLICY IF EXISTS counter_staff_manage_customers ON public.customers;
DROP POLICY IF EXISTS counter_staff_update_customers ON public.customers;
DROP POLICY IF EXISTS admin_select_customers ON public.customers;
DROP POLICY IF EXISTS admin_insert_customers ON public.customers;
DROP POLICY IF EXISTS admin_update_customers ON public.customers;
DROP POLICY IF EXISTS admin_delete_customers ON public.customers;

CREATE POLICY admin_select_customers
  ON public.customers
  FOR SELECT
  USING (
    (SELECT role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1) = 'admin'::app_role
  );

CREATE POLICY admin_insert_customers
  ON public.customers
  FOR INSERT
  WITH CHECK (
    (SELECT role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1) = 'admin'::app_role
  );

CREATE POLICY admin_update_customers
  ON public.customers
  FOR UPDATE
  USING (
    (SELECT role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1) = 'admin'::app_role
  )
  WITH CHECK (
    (SELECT role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1) = 'admin'::app_role
  );

CREATE POLICY admin_delete_customers
  ON public.customers
  FOR DELETE
  USING (
    (SELECT role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1) = 'admin'::app_role
  );

-- ============================================
-- CUSTOMER SYNC FUNCTIONS/TRIGGERS
-- ============================================

CREATE OR REPLACE FUNCTION public.sync_customer_from_service_ticket()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id uuid;
BEGIN
  IF NEW.customer_phone IS NULL OR btrim(NEW.customer_phone) = '' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.customers (name, phone, updated_at)
  VALUES (
    COALESCE(NULLIF(btrim(NEW.customer_name), ''), 'Unknown'),
    btrim(NEW.customer_phone),
    now()
  )
  ON CONFLICT (phone) DO UPDATE
    SET name = EXCLUDED.name,
        updated_at = now()
  RETURNING id INTO v_customer_id;

  NEW.customer_id := v_customer_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_customer_from_home_service_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id uuid;
  v_address text;
BEGIN
  IF NEW.customer_phone IS NULL OR btrim(NEW.customer_phone) = '' THEN
    RETURN NEW;
  END IF;

  v_address := NULLIF(btrim(NEW.address), '');

  INSERT INTO public.customers (name, phone, address, updated_at)
  VALUES (
    COALESCE(NULLIF(btrim(NEW.customer_name), ''), 'Unknown'),
    btrim(NEW.customer_phone),
    v_address,
    now()
  )
  ON CONFLICT (phone) DO UPDATE
    SET name = EXCLUDED.name,
        address = COALESCE(EXCLUDED.address, public.customers.address),
        updated_at = now()
  RETURNING id INTO v_customer_id;

  NEW.customer_id := v_customer_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_customer_from_service_ticket ON public.service_tickets;
CREATE TRIGGER trg_sync_customer_from_service_ticket
BEFORE INSERT OR UPDATE OF customer_name, customer_phone
ON public.service_tickets
FOR EACH ROW
EXECUTE FUNCTION public.sync_customer_from_service_ticket();

DROP TRIGGER IF EXISTS trg_sync_customer_from_home_service_request ON public.home_service_requests;
CREATE TRIGGER trg_sync_customer_from_home_service_request
BEFORE INSERT OR UPDATE OF customer_name, customer_phone, address
ON public.home_service_requests
FOR EACH ROW
EXECUTE FUNCTION public.sync_customer_from_home_service_request();

-- Backfill from existing in-shop tickets first.
INSERT INTO public.customers (name, phone, updated_at)
SELECT DISTINCT ON (btrim(st.customer_phone))
  COALESCE(NULLIF(btrim(st.customer_name), ''), 'Unknown') AS name,
  btrim(st.customer_phone) AS phone,
  now() AS updated_at
FROM public.service_tickets st
WHERE st.customer_phone IS NOT NULL
  AND btrim(st.customer_phone) <> ''
ORDER BY btrim(st.customer_phone), st.created_at DESC
ON CONFLICT (phone) DO UPDATE
  SET name = EXCLUDED.name,
      updated_at = now();

-- Then overlay home-service address data when available.
INSERT INTO public.customers (name, phone, address, updated_at)
SELECT DISTINCT ON (btrim(hr.customer_phone))
  COALESCE(NULLIF(btrim(hr.customer_name), ''), 'Unknown') AS name,
  btrim(hr.customer_phone) AS phone,
  NULLIF(btrim(hr.address), '') AS address,
  now() AS updated_at
FROM public.home_service_requests hr
WHERE hr.customer_phone IS NOT NULL
  AND btrim(hr.customer_phone) <> ''
ORDER BY btrim(hr.customer_phone), hr.created_at DESC
ON CONFLICT (phone) DO UPDATE
  SET name = EXCLUDED.name,
      address = COALESCE(EXCLUDED.address, public.customers.address),
      updated_at = now();

UPDATE public.service_tickets st
SET customer_id = c.id
FROM public.customers c
WHERE btrim(st.customer_phone) = c.phone
  AND (st.customer_id IS DISTINCT FROM c.id);

UPDATE public.home_service_requests hr
SET customer_id = c.id
FROM public.customers c
WHERE btrim(hr.customer_phone) = c.phone
  AND (hr.customer_id IS DISTINCT FROM c.id);

-- ============================================
-- SLA RLS-SAFE TRIGGER FUNCTIONS
-- ============================================

ALTER TABLE public.service_ticket_sla ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_service_request_sla ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.track_service_ticket_sla()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.created_at IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.service_ticket_sla WHERE ticket_id = NEW.id
  ) THEN
    INSERT INTO public.service_ticket_sla (ticket_id, time_opened)
    VALUES (NEW.id, NEW.created_at);
  END IF;

  IF (
    TG_OP = 'INSERT' AND (NEW.assigned_to IS NOT NULL OR NEW.status = 'IN_PROGRESS')
  ) OR (
    TG_OP = 'UPDATE' AND (
      (OLD.assigned_to IS NULL AND NEW.assigned_to IS NOT NULL) OR
      (OLD.status = 'OPEN' AND NEW.status = 'IN_PROGRESS')
    )
  ) THEN
    UPDATE public.service_ticket_sla
    SET
      time_assigned = now(),
      duration_open_to_assigned = EXTRACT(EPOCH FROM (now() - time_opened)) / 3600
    WHERE ticket_id = NEW.id AND time_assigned IS NULL;
  END IF;

  IF (
    TG_OP = 'INSERT' AND (NEW.battery_resolved IS TRUE OR NEW.invertor_resolved IS TRUE)
  ) OR (
    TG_OP = 'UPDATE' AND (
      (OLD.battery_resolved IS FALSE AND NEW.battery_resolved IS TRUE) OR
      (OLD.invertor_resolved IS FALSE AND NEW.invertor_resolved IS TRUE)
    )
  ) THEN
    UPDATE public.service_ticket_sla
    SET
      time_resolved = GREATEST(
        COALESCE(NEW.battery_resolved_at, now()),
        COALESCE(NEW.invertor_resolved_at, now())
      ),
      duration_assigned_to_resolved = EXTRACT(EPOCH FROM (
        GREATEST(
          COALESCE(NEW.battery_resolved_at, now()),
          COALESCE(NEW.invertor_resolved_at, now())
        ) - COALESCE(time_assigned, time_opened)
      )) / 3600
    WHERE ticket_id = NEW.id AND time_resolved IS NULL;
  END IF;

  IF (
    TG_OP = 'INSERT' AND NEW.status = 'CLOSED'
  ) OR (
    TG_OP = 'UPDATE' AND OLD.status != 'CLOSED' AND NEW.status = 'CLOSED'
  ) THEN
    UPDATE public.service_ticket_sla
    SET
      time_closed = now(),
      duration_resolved_to_closed = EXTRACT(EPOCH FROM (now() - COALESCE(time_resolved, now()))) / 3600,
      total_duration = EXTRACT(EPOCH FROM (now() - time_opened)) / 3600
    WHERE ticket_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.track_home_service_request_sla()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.created_at IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.home_service_request_sla WHERE request_id = NEW.id
  ) THEN
    INSERT INTO public.home_service_request_sla (request_id, time_opened)
    VALUES (NEW.id, NEW.created_at);
  END IF;

  IF (
    TG_OP = 'INSERT' AND (NEW.assigned_to IS NOT NULL OR NEW.status = 'IN_PROGRESS')
  ) OR (
    TG_OP = 'UPDATE' AND (
      (OLD.assigned_to IS NULL AND NEW.assigned_to IS NOT NULL) OR
      (OLD.status = 'OPEN' AND NEW.status = 'IN_PROGRESS')
    )
  ) THEN
    UPDATE public.home_service_request_sla
    SET
      time_assigned = COALESCE(NEW.assigned_at, now()),
      duration_open_to_assigned = EXTRACT(EPOCH FROM (COALESCE(NEW.assigned_at, now()) - time_opened)) / 3600
    WHERE request_id = NEW.id AND time_assigned IS NULL;
  END IF;

  IF (
    TG_OP = 'INSERT' AND NEW.status = 'CLOSED'
  ) OR (
    TG_OP = 'UPDATE' AND OLD.status != 'CLOSED' AND NEW.status = 'CLOSED'
  ) THEN
    UPDATE public.home_service_request_sla
    SET
      time_closed = now(),
      duration_resolved_to_closed = EXTRACT(EPOCH FROM (now() - COALESCE(time_resolved, now()))) / 3600,
      total_duration = EXTRACT(EPOCH FROM (now() - time_opened)) / 3600
    WHERE request_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.track_home_service_resolution_sla()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.home_service_request_sla
  SET
    time_resolved = NEW.resolved_at,
    duration_assigned_to_resolved = EXTRACT(EPOCH FROM (NEW.resolved_at - COALESCE(time_assigned, time_opened))) / 3600
  WHERE request_id = NEW.request_id
    AND time_resolved IS NULL;

  RETURN NEW;
END;
$$;
