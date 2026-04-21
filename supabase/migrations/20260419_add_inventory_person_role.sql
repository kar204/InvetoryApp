-- Add inventory_person role to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'inventory_person';

-- Update aged battery RPC functions to include role checks
-- Allow: admin, warehouse_staff, procurement_staff, inventory_person, seller, scrap_manager

-- 1. Update SCRAP_AGED_BATTERY with role check
CREATE OR REPLACE FUNCTION public.scrap_aged_battery(
  p_aged_id uuid,
  p_remarks text,
  p_scrap_value numeric,
  p_user uuid
)
RETURNS TABLE(success boolean, message text) AS $$
DECLARE
  v_current_status text;
  v_product_id uuid;
  v_has_required_role boolean;
BEGIN
  -- Check if user has required role for scrapping
  SELECT (
    has_role(p_user, 'admin'::app_role) OR
    has_role(p_user, 'warehouse_staff'::app_role) OR
    has_role(p_user, 'procurement_staff'::app_role) OR
    has_role(p_user, 'inventory_person'::app_role) OR
    has_role(p_user, 'scrap_manager'::app_role)
  ) INTO v_has_required_role;

  IF NOT v_has_required_role THEN
    RETURN QUERY SELECT false, 'Insufficient permissions to scrap aged batteries'::text;
    RETURN;
  END IF;

  -- Check if battery exists and get current status
  SELECT status, product_id INTO v_current_status, v_product_id
  FROM aged_batteries
  WHERE id = p_aged_id;

  IF v_current_status IS NULL THEN
    RETURN QUERY SELECT false, 'Battery not found'::text;
    RETURN;
  END IF;

  -- Update battery status to SCRAPPED
  UPDATE aged_batteries
  SET status = 'SCRAPPED'
  WHERE id = p_aged_id;

  -- Create audit event
  INSERT INTO aged_battery_events (aged_battery_id, event_type, performed_by, notes)
  VALUES (
    p_aged_id,
    'SCRAPPED',
    p_user,
    COALESCE(p_remarks, '') || ' | Scrap Value: ₹' || COALESCE(p_scrap_value::text, '0')
  );

  RETURN QUERY SELECT true, 'Battery marked as scrapped'::text;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, 'Error: ' || SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Update RENT_AGED_BATTERY with role check
CREATE OR REPLACE FUNCTION public.rent_aged_battery(
  p_aged_id uuid,
  p_customer uuid
)
RETURNS TABLE(success boolean, message text) AS $$
DECLARE
  v_current_status text;
  v_current_user uuid;
  v_has_required_role boolean;
BEGIN
  v_current_user := auth.uid();

  -- Check if user has required role for renting
  SELECT (
    has_role(v_current_user, 'admin'::app_role) OR
    has_role(v_current_user, 'warehouse_staff'::app_role) OR
    has_role(v_current_user, 'procurement_staff'::app_role) OR
    has_role(v_current_user, 'inventory_person'::app_role)
  ) INTO v_has_required_role;

  IF NOT v_has_required_role THEN
    RETURN QUERY SELECT false, 'Insufficient permissions to rent aged batteries'::text;
    RETURN;
  END IF;

  -- Check if battery exists
  SELECT status INTO v_current_status
  FROM aged_batteries
  WHERE id = p_aged_id;

  IF v_current_status IS NULL THEN
    RETURN QUERY SELECT false, 'Battery not found'::text;
    RETURN;
  END IF;

  -- Check customer exists
  IF NOT EXISTS(SELECT 1 FROM customers WHERE id = p_customer) THEN
    RETURN QUERY SELECT false, 'Customer not found'::text;
    RETURN;
  END IF;

  -- Update battery status to RENTED
  UPDATE aged_batteries
  SET status = 'RENTED', customer_id = p_customer
  WHERE id = p_aged_id;

  -- Create rental record
  INSERT INTO aged_battery_rentals (aged_battery_id, customer_id, status)
  VALUES (p_aged_id, p_customer, 'ACTIVE');

  -- Create audit event
  INSERT INTO aged_battery_events (aged_battery_id, event_type, performed_by)
  VALUES (p_aged_id, 'RENTED', v_current_user);

  RETURN QUERY SELECT true, 'Battery rented out'::text;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, 'Error: ' || SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. Update SELL_AGED_BATTERY with role check
CREATE OR REPLACE FUNCTION public.sell_aged_battery(
  p_aged_id uuid,
  p_customer uuid
)
RETURNS TABLE(success boolean, message text) AS $$
DECLARE
  v_current_status text;
  v_current_user uuid;
  v_has_required_role boolean;
BEGIN
  v_current_user := auth.uid();

  -- Check if user has required role for selling
  SELECT (
    has_role(v_current_user, 'admin'::app_role) OR
    has_role(v_current_user, 'warehouse_staff'::app_role) OR
    has_role(v_current_user, 'procurement_staff'::app_role) OR
    has_role(v_current_user, 'inventory_person'::app_role) OR
    has_role(v_current_user, 'seller'::app_role)
  ) INTO v_has_required_role;

  IF NOT v_has_required_role THEN
    RETURN QUERY SELECT false, 'Insufficient permissions to sell aged batteries'::text;
    RETURN;
  END IF;

  -- Check if battery exists
  SELECT status INTO v_current_status
  FROM aged_batteries
  WHERE id = p_aged_id;

  IF v_current_status IS NULL THEN
    RETURN QUERY SELECT false, 'Battery not found'::text;
    RETURN;
  END IF;

  -- Check customer exists
  IF NOT EXISTS(SELECT 1 FROM customers WHERE id = p_customer) THEN
    RETURN QUERY SELECT false, 'Customer not found'::text;
    RETURN;
  END IF;

  -- Update battery status to SOLD
  UPDATE aged_batteries
  SET status = 'SOLD', customer_id = p_customer
  WHERE id = p_aged_id;

  -- Create audit event
  INSERT INTO aged_battery_events (aged_battery_id, event_type, performed_by)
  VALUES (p_aged_id, 'SOLD', v_current_user);

  RETURN QUERY SELECT true, 'Battery marked as sold'::text;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, 'Error: ' || SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
