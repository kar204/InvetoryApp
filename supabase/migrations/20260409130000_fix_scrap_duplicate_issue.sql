-- Fix: Prevent scrapping already-scrapped batteries
-- The current function allows scrapping SOLD and SCRAPPED batteries
-- This fixes it to only allow scrapping IN_STOCK and RETURNED batteries

CREATE OR REPLACE FUNCTION public.scrap_aged_battery(
  p_aged_id uuid,
  p_remarks text,
  p_scrap_value numeric,
  p_user uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only allow scrapping if status is IN_STOCK or RETURNED (not SCRAPPED, SOLD, or RENTED)
  UPDATE aged_batteries 
  SET status = 'SCRAPPED' 
  WHERE id = p_aged_id AND status IN ('IN_STOCK', 'RETURNED');
  
  IF NOT FOUND THEN 
    RETURN jsonb_build_object('success', false, 'message', 'Cannot scrap - battery not in scrapable state'); 
  END IF;
  
  INSERT INTO aged_battery_events (aged_battery_id, event_type, performed_by, notes)
  VALUES (p_aged_id, 'SCRAPPED', p_user, COALESCE(p_remarks, 'Scrapped'));
  
  RETURN jsonb_build_object('success', true, 'message', 'Scrapped');
END;
$function$;
