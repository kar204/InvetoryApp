# Aged Batteries - Frontend Permissions & Database RLS Audit

## Frontend Permissions

### Route Access (AppSidebar.tsx - Line 41)
```typescript
{ title: 'Aged Batteries', icon: Battery, path: '/aged', roles: ['admin', 'warehouse_staff'] }
```
**Who can see the menu:** `admin`, `warehouse_staff`

⚠️ **Issue:** `inventory_person` role cannot see the menu link despite having permissions to use features

---

## Component Feature Permissions (AgedBatteries.tsx)

### 1. **Manage Operations** (canManage)
```typescript
const canManage = hasAnyRole(['admin', 'warehouse_staff', 'procurement_staff', 'inventory_person']);
```
**Can perform:** Return batteries, Scrap batteries, Delete batteries
**Roles:** `admin`, `warehouse_staff`, `procurement_staff`, `inventory_person`

### 2. **Sell/Rent Operations** (canSellRent)
```typescript
const canSellRent = hasAnyRole(['admin', 'warehouse_staff', 'procurement_staff', 'inventory_person', 'seller']);
```
**Can perform:** Rent batteries, Sell batteries
**Roles:** `admin`, `warehouse_staff`, `procurement_staff`, `inventory_person`, `seller`

### 3. **Scrap Operations** (canScrap)
```typescript
const canScrap = hasAnyRole(['admin', 'warehouse_staff', 'procurement_staff', 'inventory_person', 'scrap_manager']);
```
**Can perform:** Scrap aged batteries
**Roles:** `admin`, `warehouse_staff`, `procurement_staff`, `inventory_person`, `scrap_manager`

### 4. **Admin Only**
```typescript
const isAdmin = hasRole('admin');
```
**Can perform:** Delete aged batteries (admin exclusive)
**Roles:** `admin`

---

## Permission Summary Table

| Feature | Admin | Warehouse Staff | Procurement Staff | Inventory Person | Seller | Scrap Manager | Can See Menu |
|---------|-------|-----------------|-------------------|------------------|--------|---------------|--------------|
| View Inventory | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| Sell Battery | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Rent Battery | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Return Battery | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| Scrap Battery | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Delete Battery | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Menu Visibility** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | **Issue** |

---

## ⚠️ **Identified Issues**

### Issue 1: Menu Visibility Mismatch
- **Location:** `src/components/layout/AppSidebar.tsx` line 41
- **Problem:** Only `admin` and `warehouse_staff` can see the menu, but `inventory_person`, `procurement_staff`, `seller`, and `scrap_manager` can perform operations
- **Impact:** Users won't find the menu to access features they have permission to use

### Issue 2: Missing Route Access Definition
- **Location:** `src/config/routeAccess.ts`
- **Problem:** The `/aged` route is NOT defined in `APP_ROUTE_ACCESS` array
- **Impact:** Route protection might not work consistently

---

## Database RLS Check SQL

Run these queries in your Supabase dashboard to verify RLS policies exist:

```sql
-- 1. Check if aged_batteries table exists and has RLS enabled
SELECT 
  tablename,
  (SELECT relrowsecurity FROM pg_class WHERE relname = tablename) as row_security_enabled
FROM pg_tables 
WHERE schemaname = 'public' AND tablename LIKE 'aged%'
ORDER BY tablename;

-- 2. View all RLS policies on aged_batteries table
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  qual,
  with_check
FROM pg_policies 
WHERE tablename LIKE 'aged%'
ORDER BY tablename, policyname;

-- 3. Check if RLS is enabled on all tables
SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'aged%';

-- 4. Detailed RLS policy check (execute in each table)
SELECT * FROM pg_policies WHERE tablename = 'aged_batteries';
SELECT * FROM pg_policies WHERE tablename = 'aged_battery_rentals';
SELECT * FROM pg_policies WHERE tablename = 'aged_battery_events';
SELECT * FROM pg_policies WHERE tablename = 'aged_transfer_batches';

-- 5. Check role-based policies using is_claims_ready
SELECT 
  auth.uid() as current_user,
  auth.jwt() ->> 'role' as current_role,
  (SELECT count(*) FROM aged_batteries) as total_batteries
LIMIT 1;

-- 6. Test RLS by checking what data current user can access
SELECT id, status, customer_id, created_at 
FROM aged_batteries 
LIMIT 5;

-- 7. Show grants on aged tables to different roles
SELECT 
  grantee,
  table_schema,
  table_name,
  privilege_type
FROM information_schema.role_table_grants 
WHERE table_schema = 'public' AND table_name LIKE 'aged%'
ORDER BY table_name, grantee;
```

---

## Recommended SQL for RLS Policies

If RLS policies are missing, here's what should be implemented:

```sql
-- Enable RLS on aged_batteries table
ALTER TABLE aged_batteries ENABLE ROW LEVEL SECURITY;

-- Policy: Users with warehouse_staff, admin, or procurement roles can view
CREATE POLICY "view_aged_batteries" ON aged_batteries
  FOR SELECT
  USING (
    auth.jwt() ->> 'user_role' IN ('admin', 'warehouse_staff', 'procurement_staff', 'inventory_person', 'seller')
  );

-- Policy: Only admin and warehouse_staff can update
CREATE POLICY "update_aged_batteries" ON aged_batteries
  FOR UPDATE
  USING (
    auth.jwt() ->> 'user_role' IN ('admin', 'warehouse_staff', 'procurement_staff', 'inventory_person')
  )
  WITH CHECK (
    auth.jwt() ->> 'user_role' IN ('admin', 'warehouse_staff', 'procurement_staff', 'inventory_person')
  );

-- Policy: Only admin can delete
CREATE POLICY "delete_aged_batteries" ON aged_batteries
  FOR DELETE
  USING (
    auth.jwt() ->> 'user_role' = 'admin'
  );

-- Similar policies needed for:
-- - aged_battery_rentals
-- - aged_battery_events
-- - aged_transfer_batches
```

---

## Critical Notes

❌ **Database Status:** Based on migration analysis, the aged_batteries tables may not be properly created with RLS enabled. The RPC functions reference these tables but they might not exist or lack proper RLS policies.

⚠️ **Testing Required:** 
1. Verify tables exist in your Supabase database
2. Run the provided SQL to check RLS status
3. Create policies if missing
4. Update menu visibility to match component permissions
5. Add `/aged` route to `routeAccess.ts`
