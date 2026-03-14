CREATE TABLE public.second_hand_lifecycle (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  transaction_group_id uuid NOT NULL DEFAULT gen_random_uuid(),
  transaction_type text NOT NULL CHECK (transaction_type = ANY (ARRAY['SALE'::text, 'RENT_OUT'::text, 'GOOD_WILL'::text])),
  lifecycle_status text NOT NULL DEFAULT 'ACTIVE' CHECK (lifecycle_status = ANY (ARRAY['SOLD'::text, 'ACTIVE'::text, 'PARTIALLY_RETURNED'::text, 'RETURNED'::text])),
  customer_name text NOT NULL,
  mobile_number text,
  address text,
  product_id uuid NOT NULL,
  product_name text NOT NULL,
  product_model text NOT NULL,
  product_category text NOT NULL CHECK (product_category = ANY (ARRAY['SH Battery'::text, 'SH Inverter'::text])),
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  returned_quantity integer NOT NULL DEFAULT 0 CHECK (returned_quantity >= 0),
  unit_price numeric NOT NULL DEFAULT 0,
  payment_method text CHECK (payment_method IS NULL OR payment_method = ANY (ARRAY['CASH'::text, 'CARD'::text, 'UPI'::text])),
  start_date date,
  end_date date,
  remarks text,
  returned_at timestamp with time zone,
  return_remarks text,
  recorded_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT second_hand_lifecycle_pkey PRIMARY KEY (id),
  CONSTRAINT second_hand_lifecycle_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT,
  CONSTRAINT second_hand_lifecycle_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES auth.users(id),
  CONSTRAINT second_hand_lifecycle_returned_quantity_check CHECK (returned_quantity <= quantity),
  CONSTRAINT second_hand_lifecycle_date_range_check CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date),
  CONSTRAINT second_hand_lifecycle_type_dates_check CHECK (
    (transaction_type = 'SALE' AND start_date IS NULL AND end_date IS NULL)
    OR
    (transaction_type IN ('RENT_OUT', 'GOOD_WILL') AND start_date IS NOT NULL AND end_date IS NOT NULL)
  )
);

CREATE INDEX second_hand_lifecycle_group_idx
  ON public.second_hand_lifecycle (transaction_group_id, created_at DESC);

CREATE INDEX second_hand_lifecycle_product_idx
  ON public.second_hand_lifecycle (product_id, created_at DESC);

ALTER TABLE public.second_hand_lifecycle ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view second hand lifecycle"
ON public.second_hand_lifecycle
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Warehouse and procurement staff can create second hand lifecycle"
ON public.second_hand_lifecycle
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = recorded_by
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'warehouse_staff'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_staff'::public.app_role)
  )
);

CREATE POLICY "Warehouse and procurement staff can update second hand lifecycle"
ON public.second_hand_lifecycle
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'warehouse_staff'::public.app_role)
  OR public.has_role(auth.uid(), 'procurement_staff'::public.app_role)
)
WITH CHECK (
  auth.uid() = recorded_by
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'warehouse_staff'::public.app_role)
    OR public.has_role(auth.uid(), 'procurement_staff'::public.app_role)
  )
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'update_updated_at_column'
      AND pg_function_is_visible(oid)
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'update_second_hand_lifecycle_updated_at'
  ) THEN
    CREATE TRIGGER update_second_hand_lifecycle_updated_at
    BEFORE UPDATE ON public.second_hand_lifecycle
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'second_hand_lifecycle'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.second_hand_lifecycle;
  END IF;
END;
$$;
