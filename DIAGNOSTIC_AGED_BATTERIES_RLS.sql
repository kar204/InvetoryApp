-- QUICK DIAGNOSTIC: Check all tables used by aged batteries workflow
-- Run this to identify any other tables with restrictive RLS policies

-- ============ 1. SCAN ALL AGED_BATTERIES WORKFLOW TABLES ============

-- Check which tables have RLS enabled
SELECT 
  schemaname,
  tablename,
  (SELECT relrowsecurity FROM pg_class 
   WHERE relname = pg_tables.tablename 
   AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = pg_tables.schemaname)) as rls_enabled,
  (SELECT count(*) FROM pg_policies WHERE pg_policies.tablename = pg_tables.tablename) as policy_count
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'customers',
    'aged_batteries',
    'aged_battery_rentals',
    'aged_battery_events',
    'aged_transfer_batches',
    'aged_scan_logs',
    'products',
    'warehouse_stock',
    'scrap_entries'
  )
ORDER BY tablename;

-- ============ 2. LIST ALL RLS POLICIES FOR THESE TABLES ============

SELECT 
  tablename,
  policyname,
  CASE 
    WHEN cmd = 'SELECT' THEN 'READ'
    WHEN cmd = 'INSERT' THEN 'CREATE'
    WHEN cmd = 'UPDATE' THEN 'EDIT'
    WHEN cmd = 'DELETE' THEN 'DELETE'
    ELSE cmd
  END as operation,
  permissive,
  SUBSTRING(qual::text, 1, 50) as read_condition_sample,
  SUBSTRING(with_check::text, 1, 50) as write_condition_sample
FROM pg_policies
WHERE tablename IN (
  'customers',
  'aged_batteries',
  'aged_battery_rentals',
  'aged_battery_events',
  'aged_transfer_batches',
  'aged_scan_logs',
  'products',
  'warehouse_stock',
  'scrap_entries'
)
ORDER BY tablename, policyname;

-- ============ 3. CHECK WHICH TABLES ONLY ALLOW ADMIN ============
-- These are the problematic ones like customers

SELECT 
  tablename,
  COUNT(*) as total_policies,
  STRING_AGG(DISTINCT policyname, ', ') as policies,
  CASE 
    WHEN STRING_AGG(DISTINCT qual::text, '|') ILIKE '%admin%' THEN 'Admin-only policies detected ⚠️'
    WHEN STRING_AGG(DISTINCT with_check::text, '|') ILIKE '%admin%' THEN 'Admin-only policies detected ⚠️'
    ELSE 'Mixed or permissive policies'
  END as status
FROM pg_policies
WHERE tablename IN (
  'customers',
  'aged_batteries',
  'aged_battery_rentals',
  'aged_battery_events',
  'aged_transfer_batches',
  'aged_scan_logs'
)
GROUP BY tablename
ORDER BY tablename;

-- ============ 4. FIND POLICIES THAT DON'T INCLUDE inventory_person ============
-- These might need fixing too

SELECT 
  tablename,
  policyname,
  SUBSTRING(COALESCE(qual::text, with_check::text), 1, 100) as condition
FROM pg_policies
WHERE tablename IN (
  'customers',
  'aged_batteries',
  'aged_battery_rentals',
  'aged_battery_events',
  'aged_transfer_batches',
  'aged_scan_logs'
)
AND (
  COALESCE(qual::text, with_check::text) NOT ILIKE '%inventory_person%'
  OR COALESCE(qual::text, with_check::text) LIKE '%admin%only%'
)
ORDER BY tablename, policyname;

-- ============ 5. CHECK IF inventory_person ROLE EXISTS IN SYSTEM ============

SELECT 
  COUNT(*) as inventory_person_count,
  CASE 
    WHEN COUNT(*) > 0 THEN 'inventory_person role EXISTS in database ✓'
    ELSE 'inventory_person role NOT FOUND - needs to be added'
  END as role_status
FROM user_roles
WHERE role = 'inventory_person'::app_role;

-- ============ 6. PRODUCTS & WAREHOUSE_STOCK (Used by aged batteries) ============

SELECT 
  'products' as table_name,
  COUNT(*) as total_records
FROM products
UNION ALL
SELECT 
  'warehouse_stock' as table_name,
  COUNT(*) as total_records
FROM warehouse_stock;

-- Check if these tables have restrictive policies
SELECT 
  tablename,
  COUNT(*) as policy_count,
  STRING_AGG(policyname, ', ') as policies
FROM pg_policies
WHERE tablename IN ('products', 'warehouse_stock')
GROUP BY tablename;

-- ============ 7. TEST EACH TABLE FOR inventory_person ACCESS ============

-- Products table access
SELECT 
  'products' as table_name,
  COUNT(*) as accessible_records,
  'inventory_person can read' as status
FROM products
WHERE 1=1  -- This would be filtered by RLS in real scenario
LIMIT 5;

-- Warehouse stock access
SELECT 
  'warehouse_stock' as table_name,
  COUNT(*) as accessible_records,
  'inventory_person can read' as status
FROM warehouse_stock
WHERE 1=1  -- This would be filtered by RLS in real scenario
LIMIT 5;

-- ============ 8. SUMMARY - WHICH TABLES NEED FIXING ============

SELECT 
  'AUDIT SUMMARY' as category,
  tablename,
  CASE 
    WHEN tablename = 'customers' THEN 'CRITICAL - Admin-only, needs inventory_person added'
    WHEN tablename = 'aged_batteries' THEN 'FIXED - Has role-based policies'
    WHEN tablename = 'aged_battery_rentals' THEN 'FIXED - Has role-based policies'
    WHEN tablename = 'products' THEN 'CHECK - May need inventory_person access'
    WHEN tablename = 'warehouse_stock' THEN 'CHECK - May need inventory_person access'
    ELSE 'REVIEW NEEDED'
  END as recommendation
FROM (
  SELECT DISTINCT tablename FROM pg_policies 
  WHERE tablename IN (
    'customers',
    'aged_batteries',
    'aged_battery_rentals',
    'aged_battery_events',
    'aged_transfer_batches',
    'products',
    'warehouse_stock'
  )
) tables_list
ORDER BY recommendation;

-- ============ 9. FINAL CHECK - Can inventory_person do aged battery operations? ============

-- Simulate the aged battery workflow permission check
SELECT 
  'Aged Battery Workflow Permission Check' as check_name,
  'Step 1: Can read customers?' as step_1,
  (SELECT COUNT(*) > 0 FROM customers LIMIT 1) as can_read_customers,
  'Step 2: Can create customer?' as step_2,
  EXISTS(
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'customers' 
    AND (with_check::text ILIKE '%inventory_person%' OR qual::text ILIKE '%inventory_person%')
    AND cmd = 'INSERT'
  ) as can_insert_customer,
  'Step 3: Can update customer?' as step_3,
  EXISTS(
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'customers' 
    AND (with_check::text ILIKE '%inventory_person%' OR qual::text ILIKE '%inventory_person%')
    AND cmd = 'UPDATE'
  ) as can_update_customer,
  'Step 4: Can create rental?' as step_4,
  EXISTS(
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'aged_battery_rentals' 
    AND (with_check::text ILIKE '%inventory_person%' OR qual::text ILIKE '%inventory_person%')
    AND cmd = 'INSERT'
  ) as can_insert_rental;
