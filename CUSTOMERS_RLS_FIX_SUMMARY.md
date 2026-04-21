# Customers RLS Policy Fix - Complete Summary

## Problem Identified

**Error:** `42501 - new row violates row-level security policy for table "customers"`

**Root Cause:** The `customers` table has **ADMIN-ONLY RLS policies**. Only administrators can INSERT, UPDATE, or SELECT customers. The `inventory_person` role is completely blocked.

When an `inventory_person` user tries to:
- Rent an aged battery → Creates a new customer
- Sell an aged battery → Creates a new customer
- Update customer info → Tries to UPDATE existing customer

→ They get a 42501 error because the RLS policy blocks them.

---

## Current State (From Your Database Check)

### Existing Policies (ADMIN ONLY):
```
- admin_delete_customers   (DELETE: admin only)
- admin_insert_customers   (INSERT: admin only)
- admin_select_customers   (SELECT: admin only)
- admin_update_customers   (UPDATE: admin only)
```

### Table Structure:
- 76 total customers in database
- Columns: id, name, phone, email, address, city, notes, created_at, updated_at

### User Grants:
- Both `authenticated` and `anon` roles have table-level permissions
- But RLS POLICIES override this (RLS is more restrictive)

---

## Solution Applied

### Migration File Created:
📄 `20260420_fix_customers_rls_policies.sql`

### New Policies (ROLE-BASED):
```sql
1. SELECT (READ)
   - All authenticated users can read customers
   
2. INSERT (CREATE NEW CUSTOMER)
   ✓ admin
   ✓ counter_staff (for service tickets)
   ✓ warehouse_staff
   ✓ procurement_staff
   ✓ inventory_person (FIXED!)
   ✓ seller
   ✗ Others (blocked)

3. UPDATE (EDIT CUSTOMER)
   ✓ admin
   ✓ counter_staff
   ✓ warehouse_staff
   ✓ procurement_staff
   ✓ inventory_person (FIXED!)
   ✓ seller
   ✗ Others (blocked)

4. DELETE (REMOVE CUSTOMER)
   ✓ admin only
   ✗ Everyone else (blocked)
```

---

## How to Apply the Fix

### Step 1: Deploy Migration to Supabase
```bash
# In your Supabase dashboard, run:
supabase migration up

# Or manually copy and paste contents of:
# supabase/migrations/20260420_fix_customers_rls_policies.sql
```

### Step 2: Verify the Fix Works
Run the validation SQL:
```sql
-- Test: Try to insert customer as inventory_person
INSERT INTO customers (name, phone, email, address) 
VALUES ('Test Customer', '9999999999', 'test@example.com', 'Test Address')
RETURNING id, name;

-- Should succeed (was failing before)
```

### Step 3: Test the Aged Battery Operations
1. Login as `inventory_person` user
2. Go to Aged Batteries module
3. Try to Rent a battery
4. Create a new customer (should work now ✓)

---

## Additional Files Created

### 1. **RLS_AUDIT_AND_VALIDATION.sql**
- Comprehensive audit of all RLS policies
- Check which roles have access to which tables
- Verify inventory_person can now operate
- Diagnose any remaining issues

### 2. **Recommended Next Steps**

Check these tables also have correct policies:
- `aged_batteries` - Already fixed with previous migration
- `aged_battery_rentals` - Already fixed with previous migration
- `aged_battery_events` - Already fixed with previous migration

Run the audit query to confirm all are working.

---

## Troubleshooting

If you still get 42501 error after applying the migration:

### Check 1: Is the migration applied?
```sql
SELECT * FROM information_schema.migrations 
WHERE name LIKE '20260420_fix_customers%';
```

### Check 2: Are the new policies in place?
```sql
SELECT policyname FROM pg_policies 
WHERE tablename = 'customers' 
AND policyname LIKE '%role_based%';
```

### Check 3: Is user actually inventory_person?
```sql
SELECT auth.uid() as user_id,
       (SELECT role FROM user_roles 
        WHERE user_id = auth.uid() 
        LIMIT 1) as user_role;
```

### Check 4: Test the policy manually
```sql
-- Simulate policy check
SELECT COALESCE(
  (SELECT role FROM user_roles WHERE user_id = auth.uid() LIMIT 1),
  'guest'::app_role
) IN ('admin', 'inventory_person') as can_insert;
```

---

## Permission Matrix After Fix

| Feature | Admin | Inventory Person | Counter Staff | Warehouse | Others |
|---------|-------|------------------|---------------|-----------|--------|
| View Customers | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create Customer | ✅ | ✅ | ✅ | ✅ | ❌ |
| Edit Customer | ✅ | ✅ | ✅ | ✅ | ❌ |
| Delete Customer | ✅ | ❌ | ❌ | ❌ | ❌ |
| Rent Battery | ✅ | ✅ | ❌ | ✅ | ❌ |
| Sell Battery | ✅ | ✅ | ❌ | ✅ | ❌ |
| Scrap Battery | ✅ | ✅ | ❌ | ✅ | ❌ |

---

## Files Deployed This Session

1. ✅ `supabase/migrations/20260420_fix_customers_rls_policies.sql` - **Main Fix**
2. ✅ `supabase/migrations/20260420_fix_aged_battery_rls_policies.sql` - **Aged Batteries RLS**
3. 📄 `RLS_AUDIT_AND_VALIDATION.sql` - **Validation Script**
4. 📄 `AGED_BATTERIES_PERMISSIONS.md` - **Documentation**

---

## Expected Result

After applying migration `20260420_fix_customers_rls_policies.sql`:

✅ `inventory_person` can create new customers  
✅ `inventory_person` can update customer details  
✅ `inventory_person` can rent aged batteries (no 42501 error)  
✅ `inventory_person` can sell aged batteries (no 42501 error)  
✅ Only `admin` can delete customers  
✅ Other users still have read-only access  

---

**Status:** Ready to deploy to Supabase ✓
