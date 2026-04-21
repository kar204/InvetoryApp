-- COMPREHENSIVE RLS AUDIT FOR AGED BATTERIES WORKFLOW
-- Run this to verify all tables allow inventory_person to operate

-- ============ 1. CHECK CUSTOMERS TABLE (Critical for aged battery operations) ============
SELECT 
  'customers' as table_name,
  COUNT(*) as total_records
FROM customers;

SELECT 
  'customers_policies' as check_type,
  policyname,
  permissive,
  roles
FROM pg_policies 
WHERE tablename = 'customers'
ORDER BY policyname;

-- Test: Can inventory_person access customers?
SELECT 
  'Test: inventory_person customer access' as test_type,
  CASE 
    WHEN (SELECT role FROM user_roles WHERE user_id = auth.uid() LIMIT 1) IN ('admin', 'inventory_person')
    THEN 'Should allow INSERT/UPDATE'
    ELSE 'BLOCKED - Need to fix RLS'
  END as result;

-- ============ 2. CHECK AGED_BATTERIES TABLE ============
SELECT 
  'aged_batteries' as table_name,
  COUNT(*) as total_records,
  COUNT(DISTINCT status) as unique_statuses
FROM aged_batteries;

SELECT 
  'aged_batteries_policies' as check_type,
  policyname,
  permissive,
  roles
FROM pg_policies 
WHERE tablename = 'aged_batteries'
ORDER BY policyname;

-- ============ 3. CHECK AGED_BATTERY_RENTALS TABLE ============
SELECT 
  'aged_battery_rentals' as table_name,
  COUNT(*) as total_rentals,
  COUNT(CASE WHEN status = 'ACTIVE' THEN 1 END) as active_rentals
FROM aged_battery_rentals;

SELECT 
  'aged_battery_rentals_policies' as check_type,
  policyname,
  permissive,
  roles
FROM pg_policies 
WHERE tablename = 'aged_battery_rentals'
ORDER BY policyname;

-- ============ 4. VERIFY USER ROLE SETUP ============
SELECT 
  'user_roles_status' as check_type,
  COUNT(DISTINCT user_id) as total_users,
  COUNT(DISTINCT role) as unique_roles,
  STRING_AGG(DISTINCT role::text, ', ') as all_roles
FROM user_roles;

-- Check if inventory_person role exists
SELECT 
  CASE 
    WHEN EXISTS(SELECT 1 FROM user_roles WHERE role = 'inventory_person'::app_role)
    THEN 'inventory_person role EXISTS ✓'
    ELSE 'inventory_person role NOT FOUND ✗'
  END as role_status;

-- ============ 5. FIND ALL INVENTORY_PERSON USERS ============
SELECT 
  'Inventory Person Users' as category,
  ur.user_id,
  COALESCE(p.name, 'Unknown') as name,
  COALESCE(p.email, 'No email') as email,
  ur.role,
  ur.created_at
FROM user_roles ur
LEFT JOIN profiles p ON ur.user_id = p.user_id
WHERE ur.role = 'inventory_person'::app_role
ORDER BY ur.created_at DESC;

-- ============ 6. RLS POLICY COMPARISON TABLE ============
-- Shows which tables have which permissions for which roles

SELECT 
  policyname,
  tablename,
  CASE 
    WHEN policyname LIKE '%insert%' OR policyname LIKE '%_in_%' THEN 'INSERT'
    WHEN policyname LIKE '%update%' OR policyname LIKE '%_up_%' THEN 'UPDATE'
    WHEN policyname LIKE '%delete%' OR policyname LIKE '%_del%' THEN 'DELETE'
    WHEN policyname LIKE '%select%' OR policyname LIKE '%read%' THEN 'SELECT'
    ELSE 'OTHER'
  END as operation_type,
  permissive,
  roles
FROM pg_policies
WHERE tablename IN ('customers', 'aged_batteries', 'aged_battery_rentals', 'aged_battery_events', 'aged_transfer_batches')
ORDER BY tablename, policyname;

-- ============ 7. DIAGNOSE AGED BATTERY OPERATIONS ============
-- Check which customers can be accessed for aged battery operations

SELECT 
  'Customers available for aged batteries' as check_type,
  COUNT(*) as accessible_customers,
  COUNT(CASE WHEN email IS NOT NULL THEN 1 END) as with_email,
  COUNT(CASE WHEN address IS NOT NULL THEN 1 END) as with_address
FROM customers
WHERE created_at > now() - INTERVAL '30 days';

-- ============ 8. PENDING AGED BATTERY OPERATIONS ============
-- Check status of recent operations

SELECT 
  'Recent aged battery statuses' as check_type,
  status,
  COUNT(*) as count
FROM aged_batteries
GROUP BY status
ORDER BY count DESC;

SELECT 
  'Recent rentals status' as check_type,
  status,
  COUNT(*) as count
FROM aged_battery_rentals
GROUP BY status
ORDER BY count DESC;

-- ============ 9. FINAL VALIDATION SQL ============
-- Run this after applying the migration to confirm it works

/*
-- After migration, test inventory_person INSERT:
BEGIN;
  INSERT INTO customers (name, phone, email, address) 
  VALUES ('Test Inventory Person Customer', '9876543210', 'test@inv.com', 'Test Address')
  RETURNING id, name, created_at;
ROLLBACK; -- Comment out to actually save

-- After migration, test inventory_person UPDATE:
BEGIN;
  UPDATE customers 
  SET address = 'Updated by inventory_person'
  WHERE name = 'Test Inventory Person Customer'
  RETURNING id, address;
ROLLBACK; -- Comment out to actually save
*/

-- ============ SUMMARY ============
-- This audit shows:
-- 1. Total records in each table
-- 2. Current RLS policies
-- 3. Whether inventory_person is included
-- 4. Role setup status
-- 5. What needs to be fixed

-- Expected result AFTER applying the fix:
-- - customers table: inventory_person can INSERT ✓, UPDATE ✓, SELECT ✓, but NOT DELETE
-- - aged_batteries table: inventory_person can INSERT ✓, UPDATE ✓, SELECT ✓, but NOT DELETE
-- - aged_battery_rentals: inventory_person can INSERT ✓, UPDATE ✓, SELECT ✓, but NOT DELETE
