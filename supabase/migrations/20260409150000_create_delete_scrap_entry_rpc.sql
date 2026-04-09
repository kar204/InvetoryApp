-- Create RPC function to delete scrap entries
-- IMPORTANT: When deleting a scrap entry, the aged_battery status remains SCRAPPED
-- This is because scrap is a final state - deleting the entry just removes the ledger record
-- but the battery remains scrapped in inventory

CREATE OR REPLACE FUNCTION public.delete_scrap_entry(
  p_scrap_id uuid
)
RETURNS TABLE(success boolean, message text) AS $$
BEGIN
  -- Simply delete the scrap entry
  -- The aged_battery remains in SCRAPPED status (no status change)
  DELETE FROM scrap_entries
  WHERE id = p_scrap_id;

  RETURN QUERY SELECT true, 'Scrap entry deleted successfully'::text;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, 'Error: ' || SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.delete_scrap_entry TO authenticated;
