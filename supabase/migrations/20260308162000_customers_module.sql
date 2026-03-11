-- Customers module + automatic customer capture from service flows.
--
-- Requirements:
-- - Admin can view/manage customers.
-- - Service/Home Service ticket creation should record customers automatically.
-- - Deleting service tickets must NOT delete customers (manual cleanup only).

-- ----------------------------
-- Table
-- ----------------------------
CREATE TABLE IF NOT EXISTS public.customers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text NOT NULL UNIQUE,
  email text,
  address text,
  city text,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT customers_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers USING btree (phone);
CREATE INDEX IF NOT EXISTS idx_customers_name ON public.customers USING btree (name);

-- ----------------------------
-- RLS (admin-only)
-- ----------------------------
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

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

-- ----------------------------
-- Auto-capture customers from service tickets
-- ----------------------------
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
  VALUES (COALESCE(NULLIF(btrim(NEW.customer_name), ''), 'Unknown'), btrim(NEW.customer_phone), now())
  ON CONFLICT (phone) DO UPDATE
    SET name = EXCLUDED.name,
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

-- ----------------------------
-- Auto-capture customers from home service requests (includes address)
-- ----------------------------
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

DROP TRIGGER IF EXISTS trg_sync_customer_from_home_service_request ON public.home_service_requests;
CREATE TRIGGER trg_sync_customer_from_home_service_request
BEFORE INSERT OR UPDATE OF customer_name, customer_phone, address
ON public.home_service_requests
FOR EACH ROW
EXECUTE FUNCTION public.sync_customer_from_home_service_request();

