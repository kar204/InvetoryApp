-- Fix Customers Table RLS Policies
-- Add inventory_person and other roles for aged battery operations
-- Current issue: inventory_person can't insert/update customers (42501 error)

-- Drop existing admin-only policies
DROP POLICY IF EXISTS "admin_select_customers" ON customers;
DROP POLICY IF EXISTS "admin_insert_customers" ON customers;
DROP POLICY IF EXISTS "admin_update_customers" ON customers;
DROP POLICY IF EXISTS "admin_delete_customers" ON customers;

-- ============ CUSTOMERS TABLE RLS - NEW POLICIES ============

-- Policy 1: SELECT - Authenticated users can read all customers
CREATE POLICY "customers_read_authenticated" ON customers
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Policy 2: INSERT - Multiple roles can create customers
-- Roles: admin, counter_staff, warehouse_staff, procurement_staff, inventory_person, seller
CREATE POLICY "customers_insert_role_based" ON customers
  FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'counter_staff'::app_role)
    OR public.has_role(auth.uid(), 'warehouse_staff'::app_role)
    OR public.has_role(auth.uid(), 'procurement_staff'::app_role)
    OR public.has_role(auth.uid(), 'inventory_person'::app_role)
    OR public.has_role(auth.uid(), 'seller'::app_role)
  );

-- Policy 3: UPDATE - Same roles as INSERT can update
CREATE POLICY "customers_update_role_based" ON customers
  FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'counter_staff'::app_role)
    OR public.has_role(auth.uid(), 'warehouse_staff'::app_role)
    OR public.has_role(auth.uid(), 'procurement_staff'::app_role)
    OR public.has_role(auth.uid(), 'inventory_person'::app_role)
    OR public.has_role(auth.uid(), 'seller'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'counter_staff'::app_role)
    OR public.has_role(auth.uid(), 'warehouse_staff'::app_role)
    OR public.has_role(auth.uid(), 'procurement_staff'::app_role)
    OR public.has_role(auth.uid(), 'inventory_person'::app_role)
    OR public.has_role(auth.uid(), 'seller'::app_role)
  );

-- Policy 4: DELETE - Only admin can delete customers
CREATE POLICY "customers_delete_admin_only" ON customers
  FOR DELETE
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
  );

-- ============ VERIFY POLICIES ============
-- After running, check with:
-- SELECT policyname, permissive FROM pg_policies WHERE tablename = 'customers' ORDER BY policyname;

-- ============ SUMMARY ============
-- Role Permissions on customers table after this migration:
-- 
-- admin:               SELECT ✓ INSERT ✓ UPDATE ✓ DELETE ✓
-- counter_staff:       SELECT ✓ INSERT ✓ UPDATE ✓ DELETE ✗
-- warehouse_staff:     SELECT ✓ INSERT ✓ UPDATE ✓ DELETE ✗
-- procurement_staff:   SELECT ✓ INSERT ✓ UPDATE ✓ DELETE ✗
-- inventory_person:    SELECT ✓ INSERT ✓ UPDATE ✓ DELETE ✗  (FIXED!)
-- seller:              SELECT ✓ INSERT ✓ UPDATE ✓ DELETE ✗
-- service_technician:  SELECT ✓ INSERT ✗ UPDATE ✗ DELETE ✗
-- sp_battery:          SELECT ✓ INSERT ✗ UPDATE ✗ DELETE ✗
-- sp_invertor:         SELECT ✓ INSERT ✗ UPDATE ✗ DELETE ✗
-- scrap_manager:       SELECT ✓ INSERT ✗ UPDATE ✗ DELETE ✗
-- Other:               SELECT ✓ INSERT ✗ UPDATE ✗ DELETE ✗
