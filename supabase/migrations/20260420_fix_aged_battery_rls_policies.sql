-- Fix Aged Battery RLS Policies
-- Restrict access: Only admin and inventory_person can edit/update, only admin can delete

-- Drop existing permissive policies
DROP POLICY IF EXISTS "aged_read_all" ON aged_batteries;
DROP POLICY IF EXISTS "aged_insert" ON aged_batteries;
DROP POLICY IF EXISTS "aged_admin_delete" ON aged_batteries;
DROP POLICY IF EXISTS "admin_reverse_claim" ON aged_batteries;

DROP POLICY IF EXISTS "rental_read_all" ON aged_battery_rentals;
DROP POLICY IF EXISTS "events_read_all" ON aged_battery_events;
DROP POLICY IF EXISTS "batch_read_all" ON aged_transfer_batches;
DROP POLICY IF EXISTS "batch_insert" ON aged_transfer_batches;
DROP POLICY IF EXISTS "batch_update" ON aged_transfer_batches;
DROP POLICY IF EXISTS "scan_insert" ON aged_scan_logs;

-- ============ AGED_BATTERIES TABLE RLS ============

-- Policy 1: SELECT - Authenticated users can read all aged batteries
CREATE POLICY "aged_batteries_read_authenticated" ON aged_batteries
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Policy 2: INSERT - Only admin and inventory_person can insert
CREATE POLICY "aged_batteries_insert_role_based" ON aged_batteries
  FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'inventory_person'::app_role)
  );

-- Policy 3: UPDATE - Only admin and inventory_person can update
CREATE POLICY "aged_batteries_update_role_based" ON aged_batteries
  FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'inventory_person'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'inventory_person'::app_role)
  );

-- Policy 4: DELETE - Only admin can delete
CREATE POLICY "aged_batteries_delete_admin_only" ON aged_batteries
  FOR DELETE
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
  );

-- ============ AGED_BATTERY_RENTALS TABLE RLS ============

DROP POLICY IF EXISTS "rental_insert" ON aged_battery_rentals;
DROP POLICY IF EXISTS "rental_update" ON aged_battery_rentals;

-- SELECT - Authenticated users can read
CREATE POLICY "rental_read_authenticated" ON aged_battery_rentals
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- INSERT - Only admin and inventory_person
CREATE POLICY "rental_insert_role_based" ON aged_battery_rentals
  FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'inventory_person'::app_role)
  );

-- UPDATE - Only admin and inventory_person
CREATE POLICY "rental_update_role_based" ON aged_battery_rentals
  FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'inventory_person'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'inventory_person'::app_role)
  );

-- ============ AGED_BATTERY_EVENTS TABLE RLS ============

DROP POLICY IF EXISTS "events_insert" ON aged_battery_events;
DROP POLICY IF EXISTS "events_update" ON aged_battery_events;

-- SELECT - Authenticated users can read
CREATE POLICY "events_read_authenticated" ON aged_battery_events
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- INSERT - Only admin and inventory_person (for auditing)
CREATE POLICY "events_insert_role_based" ON aged_battery_events
  FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'inventory_person'::app_role)
  );

-- ============ AGED_TRANSFER_BATCHES TABLE RLS ============

DROP POLICY IF EXISTS "batch_delete" ON aged_transfer_batches;

-- SELECT - Authenticated users can read
CREATE POLICY "batch_read_authenticated" ON aged_transfer_batches
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- INSERT - Only admin and inventory_person
CREATE POLICY "batch_insert_role_based" ON aged_transfer_batches
  FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'inventory_person'::app_role)
  );

-- UPDATE - Only admin and inventory_person
CREATE POLICY "batch_update_role_based" ON aged_transfer_batches
  FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'inventory_person'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'inventory_person'::app_role)
  );

-- DELETE - Only admin
CREATE POLICY "batch_delete_admin_only" ON aged_transfer_batches
  FOR DELETE
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
  );

-- ============ AGED_SCAN_LOGS TABLE RLS ============

DROP POLICY IF EXISTS "scan_update" ON aged_scan_logs;
DROP POLICY IF EXISTS "scan_delete" ON aged_scan_logs;

-- SELECT - Authenticated users can read
CREATE POLICY "scan_read_authenticated" ON aged_scan_logs
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- INSERT - Only admin and inventory_person
CREATE POLICY "scan_insert_role_based" ON aged_scan_logs
  FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'inventory_person'::app_role)
  );

-- ============ SUMMARY ============
-- Role: admin
--   - Can READ all records ✓
--   - Can INSERT new records ✓
--   - Can UPDATE all records ✓
--   - Can DELETE all records ✓

-- Role: inventory_person
--   - Can READ all records ✓
--   - Can INSERT new records ✓
--   - Can UPDATE all records ✓
--   - Can DELETE records ✗ (DENIED)

-- Other Roles
--   - Can READ all records ✓
--   - Can INSERT new records ✗ (DENIED)
--   - Can UPDATE records ✗ (DENIED)
--   - Can DELETE records ✗ (DENIED)
