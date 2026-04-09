# Battery Scrap Module - Complete Flow Documentation

## 📋 Overview

The **Scrap Module** manages the lifecycle of aged batteries from when they're marked as scrapped to when they're removed from the system. It connects the **Aged Battery inventory** with the **Scrap Ledger** to track both the state change and financial value.

---

## 🔄 Complete Scrap Flow

### Step 1: Select Battery in Aged Batteries Component
**File:** [src/pages/AgedBatteries.tsx](src/pages/AgedBatteries.tsx)

```
User clicks "Scrap" button on an aged battery row
     ↓
Triggers: handleScrapDialog(battery)
     ↓
Opens dialog with:
  - Scrap Value input field
  - Remarks/notes field
```

### Step 2: Handle Scrap Form Submission
**Function:** `handleScrap()` in AgedBatteries.tsx

When user clicks "Confirm Scrap":

```typescript
1. Validate user authentication
2. Prepare RPC payload:
   {
     p_aged_id: battery.id,
     p_remarks: user_input,
     p_scrap_value: numeric_value,
     p_user: current_user.id
   }
3. Call: supabase.rpc('scrap_aged_battery', payload)
```

### Step 3: RPC Function Executes
**Function:** `scrap_aged_battery()` in `20260409120000_aged_battery_rpc_functions.sql`

```sql
Transaction:
  1. Verify aged_battery exists and get product_id
  2. UPDATE aged_batteries SET status = 'SCRAPPED'
  3. INSERT aged_battery_events with:
     - event_type: 'SCRAPPED'
     - performed_by: user_id
     - notes: includes remarks + scrap value
  4. Return: { success: true, message: 'Battery marked as scrapped' }
```

### Step 4: Sync to Scrap Ledger
**Function:** `syncScrapLedgerEntry()` in AgedBatteries.tsx

After RPC succeeds, sync to scrap_entries table:

```typescript
1. Check if scrap_entries already exists for this aged_battery_id
2. If EXISTS:
   UPDATE scrap_entries
   SET customer_name, scrap_item, scrap_model, scrap_value, quantity
   WHERE aged_battery_id = battery.id
   
3. If NOT EXISTS:
   INSERT into scrap_entries
   VALUES {
     customer_name: (from battery.customer or 'Aged Battery Inventory'),
     scrap_item: inferScrapCategory(battery.product),
     scrap_model: battery.product.name + model,
     scrap_value: numeric_value,
     quantity: 1,
     aged_battery_id: battery.id,
     recorded_by: current_user.id,
     status: 'IN'  // IN = in inventory, OUT = removed
   }
```

### Step 5: Display Update
- Toast confirmation: "Battery scrapped"
- Dialog closes
- Page refreshes to show updated status
- Status badge changes to **RED** "Scrapped"

---

## 💾 Database Tables Involved

### 1. **aged_batteries**
Primary record for each battery unit

| Column | Purpose |
|--------|---------|
| `id` (uuid) | Primary key |
| `product_id` (uuid) | Link to products catalog |
| `barcode` (text) | Unique barcode identifier |
| `status` (text) | IN_STOCK, RENTED, RETURNED, SOLD, **SCRAPPED** |
| `customer_id` (uuid) | Current/last customer |
| `created_at` | When battery entered aged inventory |

### 2. **aged_battery_events**
Audit log of state transitions

| Column | Purpose |
|--------|---------|
| `id` (uuid) | Primary key |
| `aged_battery_id` (uuid) | References aged_batteries |
| `event_type` (text) | RENTED, RETURNED, SOLD, **SCRAPPED** |
| `performed_by` (uuid) | User who performed action |
| `notes` (text) | Additional details (e.g., scrap value, remarks) |
| `created_at` | Timestamp of event |

**💡 Key:** Every scrap action creates an audit trail here.

### 3. **scrap_entries**
Scrap ledger for valuations and tracking

| Column | Purpose |
|--------|---------|
| `id` (uuid) | Primary key |
| `aged_battery_id` (uuid) | **LINK BACK TO aged_batteries** ⭐ |
| `customer_name` (text) | Who scrapped it (or "Aged Battery Inventory") |
| `scrap_item` (text) | Category: Car/Bike/Inverter Battery, SMF |
| `scrap_model` (text) | Product name + model number |
| `scrap_value` (numeric) | Estimated/declared value |
| `quantity` (integer) | How many units (default 1) |
| `status` (text) | IN = received, OUT = removed/sold |
| `recorded_by` (uuid) | Which user created this entry |
| `marked_out_at` (timestamp) | When scrap was marked as OUT |
| `marked_out_by` (uuid) | Who marked it OUT |
| `created_at` | Timestamp |

---

## 🔗 Data Relationships

```
aged_batteries (status='SCRAPPED')
        ↓
aged_battery_events (event_type='SCRAPPED')
        ↓ (foreign key: aged_battery_id)
scrap_entries (status='IN')


Additional:
aged_batteries.product_id → products
aged_batteries.customer_id → customers
aged_battery_events.performed_by → auth.users
scrap_entries.recorded_by → auth.users
scrap_entries.marked_out_by → auth.users (optional)
```

---

## 🐛 Common Issues & Debugging

### Issue #1: RPC Function Not Found
**Error:** `"scrap_aged_battery is not a known function"`

**Solution:** 
- Run migration: `20260409120000_aged_battery_rpc_functions.sql`
- Verify in Supabase → Database → Functions
- Ensure all 5 RPC functions are present

### Issue #2: aged_battery_id Missing from scrap_entries
**Error:** Query fails when trying to link scrapped batteries to scrap entries

**Solution:**
- Run migration: `20260409120100_add_aged_battery_id_to_scrap_entries.sql`
- Verify column exists: `SELECT aged_battery_id FROM scrap_entries LIMIT 1`

### Issue #3: Battery Marked SCRAPPED but No Scrap Entry
**Scenario:** Status shows SCRAPPED but no row in scrap_entries

**Check:**
1. Event was created? → Run Query #3 from diagnostic queries
2. Event has correct notes? → Check for scrap value in notes
3. Frontend sync failed? → Check browser console for sync error messages

**Fix:**
- Use diagnostic query #2 to find affected batteries
- Manually create scrap_entries row via diagnostic script

### Issue #4: Scrap Entry Exists but Battery Not SCRAPPED
**Scenario:** Row in scrap_entries but aged_batteries.status ≠ 'SCRAPPED'

**Possible Causes:**
- Old manual scrap entry before RPC automation
- Failed RPC but successful sync

**Check & Fix:**
- Run query #5 (UNLINKED SCRAP ENTRIES)
- Manually update battery status or remove scrap entry based on intent

---

## 🔍 How to Inspect Scrap Data

### Quick Check: Is battery scrapped?
```sql
SELECT barcode, status FROM aged_batteries 
WHERE barcode = 'YOUR_BARCODE' LIMIT 1;
```

### Find all audit events for a battery
```sql
SELECT event_type, performed_by, notes, created_at 
FROM aged_battery_events 
WHERE aged_battery_id = 'BATTERY_ID'
ORDER BY created_at DESC;
```

### Check scrap ledger entry
```sql
SELECT * FROM scrap_entries 
WHERE aged_battery_id = 'BATTERY_ID';
```

### See complete timeline
Use diagnostic query #3 from `database/scrap_diagnostic_queries.sql`

---

## 📊 Scrap Module Data Quality Queries

Run these regularly to catch data integrity issues:

| Query # | Purpose |
|---------|---------|
| #1 | Find all scrapped batteries (verify status) |
| #2 | Find scrapped batteries with NO scrap entry (data gap) |
| #3 | Event history for one battery (debugging) |
| #4 | All scrap entries with aging battery links |
| #5 | Unlinked scrap entries (legacy or orphaned) |
| #9 | Data consistency report (quick health check) |
| #10 | Recent scraps with full workflow shown |

---

## 🚀 Related RPC Functions

Besides `scrap_aged_battery`, these related operations exist:

- `rent_aged_battery(p_aged_id, p_customer)` → Status: RENTED
- `return_aged_battery(p_aged_id)` → Status: RETURNED  
- `sell_aged_battery(p_aged_id, p_customer)` → Status: SOLD
- `admin_delete_aged_battery(p_aged_id, p_user)` → Remove battery entirely
- `toggle_claim_status(p_id, p_claim)` → Claim/unclaim battery
- `transfer_aged_battery(p_product_id, p_barcode, p_batch_id, p_user)` → Create aged battery

---

## ✅ Testing the Scrap Flow

### Manual Test Steps:

1. **Go to Aged Batteries page**

2. **Select a battery in IN_STOCK status**

3. **Click "Scrap" button**

4. **Enter values:**
   - Scrap Value: `500` (or any number)
   - Remarks: `Test scrap - condition poor`

5. **Click "Confirm"**

6. **Verify:**
   - ✅ Toast shows "Battery scrapped"
   - ✅ Page refreshes
   - ✅ Battery shows RED "Scrapped" status
   - ✅ Battery no longer appears in "In Stock" tab

7. **Database verification:**
   - Run diagnostic query #1 → Should see your battery
   - Run diagnostic query #10 → Should show complete workflow
   - Check `aged_batteries` → status = SCRAPPED
   - Check `aged_battery_events` → event_type = SCRAPPED
   - Check `scrap_entries` → aged_battery_id is populated

---

## 🔐 RLS Policies

Scrap module uses these role-based permissions:

- **View scrap entries:** `authenticated` (all users)
- **Create scrap entries:** `admin`, `counter_staff`, `scrap_manager`
- **Update scrap entries:** `admin`, `counter_staff`
- **Execute RPC functions:** `authenticated` (function itself checks roles internally)

---

## 📝 Notes

- Scrap value defaults to 0 if not provided
- Multiple scrap statuses supported: IN (inventory) / OUT (removed)
- Scrap entries can be marked OUT with timestamp and performed_by user
- All operations are audited in aged_battery_events table
- Foreign key "aged_battery_id" in scrap_entries allows tracing back to original battery
