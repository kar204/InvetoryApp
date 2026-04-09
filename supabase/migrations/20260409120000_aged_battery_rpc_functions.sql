-- Aged Battery Operations RPC Functions
-- Provides transactional operations for renting, selling, returning, and scrapping aged batteries

-- 1. SCRAP_AGED_BATTERY - Mark battery as scrapped and create audit event
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
BEGIN
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

-- 2. RENT_AGED_BATTERY - Mark battery as rented and create rental record
CREATE OR REPLACE FUNCTION public.rent_aged_battery(
  p_aged_id uuid,
  p_customer uuid
)
RETURNS TABLE(success boolean, message text) AS $$
DECLARE
  v_current_status text;
  v_current_user uuid;
BEGIN
  v_current_user := auth.uid();
  
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

-- 3. RETURN_AGED_BATTERY - Mark rented battery as returned
CREATE OR REPLACE FUNCTION public.return_aged_battery(
  p_aged_id uuid
)
RETURNS TABLE(success boolean, message text) AS $$
DECLARE
  v_current_status text;
  v_current_user uuid;
  v_rental_id uuid;
BEGIN
  v_current_user := auth.uid();
  
  -- Check if battery exists
  SELECT status INTO v_current_status
  FROM aged_batteries
  WHERE id = p_aged_id;

  IF v_current_status IS NULL THEN
    RETURN QUERY SELECT false, 'Battery not found'::text;
    RETURN;
  END IF;

  IF v_current_status != 'RENTED' THEN
    RETURN QUERY SELECT false, 'Battery is not currently rented'::text;
    RETURN;
  END IF;

  -- Get active rental record
  SELECT id INTO v_rental_id
  FROM aged_battery_rentals
  WHERE aged_battery_id = p_aged_id AND status = 'ACTIVE'
  LIMIT 1;

  -- Update battery status to RETURNED
  UPDATE aged_batteries
  SET status = 'RETURNED'
  WHERE id = p_aged_id;

  -- Update rental record
  IF v_rental_id IS NOT NULL THEN
    UPDATE aged_battery_rentals
    SET status = 'RETURNED', returned_at = now()
    WHERE id = v_rental_id;
  END IF;

  -- Create audit event
  INSERT INTO aged_battery_events (aged_battery_id, event_type, performed_by)
  VALUES (p_aged_id, 'RETURNED', v_current_user);

  RETURN QUERY SELECT true, 'Battery marked as returned'::text;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, 'Error: ' || SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. SELL_AGED_BATTERY - Mark battery as sold
CREATE OR REPLACE FUNCTION public.sell_aged_battery(
  p_aged_id uuid,
  p_customer uuid
)
RETURNS TABLE(success boolean, message text) AS $$
DECLARE
  v_current_status text;
  v_current_user uuid;
BEGIN
  v_current_user := auth.uid();
  
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

-- 5. ADMIN_DELETE_AGED_BATTERY - Delete aged battery (admin only)
CREATE OR REPLACE FUNCTION public.admin_delete_aged_battery(
  p_aged_id uuid,
  p_user uuid
)
RETURNS TABLE(success boolean, message text) AS $$
DECLARE
  v_has_admin_role boolean;
BEGIN
  -- Check if user is admin
  SELECT has_role(p_user, 'admin'::app_role) INTO v_has_admin_role;
  
  IF NOT v_has_admin_role THEN
    RETURN QUERY SELECT false, 'Only admins can delete aged batteries'::text;
    RETURN;
  END IF;

  -- Delete associated records first
  DELETE FROM aged_battery_events WHERE aged_battery_id = p_aged_id;
  DELETE FROM aged_battery_rentals WHERE aged_battery_id = p_aged_id;
  
  -- Delete the battery
  DELETE FROM aged_batteries WHERE id = p_aged_id;

  RETURN QUERY SELECT true, 'Battery deleted successfully'::text;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, 'Error: ' || SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.scrap_aged_battery TO authenticated;
GRANT EXECUTE ON FUNCTION public.rent_aged_battery TO authenticated;
GRANT EXECUTE ON FUNCTION public.return_aged_battery TO authenticated;
GRANT EXECUTE ON FUNCTION public.sell_aged_battery TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_aged_battery TO authenticated;
