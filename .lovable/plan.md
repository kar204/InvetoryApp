

# Plan: Enhanced Dashboard, Inventory Defaults, Shop Sales History, and Scrap Improvements

## 1. Enhanced Dashboard - Full Business Overview

The current dashboard only shows ticket stats and warehouse low-stock alerts. It needs to show a complete picture for a shop owner.

**New stats/sections to add to `src/pages/Dashboard.tsx`:**
- **Shop Stats**: Total shop stock, today's sales count, today's sales revenue
- **Warehouse Stats**: Total warehouse stock (already there), recent stock-in/stock-out counts
- **Scrap Stats**: Scrap items in stock, total scrap value (IN)
- **Service Stats**: Already present (open, in-progress, closed today)

**Data fetching additions:**
- Query `shop_stock` for total shop inventory
- Query `shop_sales` + `shop_sale_items` for today's sales count and revenue
- Query `scrap_entries` for scrap in-stock count and value
- Query `stock_transactions` for today's stock movements

**Layout**: Reorganize the overview banner into sections: Service, Inventory, Shop, Scrap -- giving a holistic view.

## 2. Inventory - Default Stock In to Warehouse, Stock Out to Shop

In `src/pages/Inventory.tsx`, the Stock Transfer form currently leaves transaction_type and source blank by default.

**Changes:**
- Set `transferForm` initial state to `{ transaction_type: 'IN', source: 'WAREHOUSE' }` for Stock In
- When user selects "Stock In", auto-set source to "WAREHOUSE" (destination is warehouse)
- When user selects "Stock Out", auto-set source to "SHOP" (destination is shop)
- For role-restricted users (warehouse_staff, procurement_staff), auto-fill both fields on dialog open since they only have one option each

## 3. Shop - Sales History with Item Details

The current Sales History table shows Date, Customer, Items (as badges), and Total. The user wants to see individual item model and quantity more clearly.

**Changes to `src/pages/Shop.tsx` Sales History tab:**
- Add columns: "Items", "Model", "Qty" or restructure the Items column to show each item on its own row with model_number and quantity clearly displayed
- Use a sub-row or expanded detail approach: each sale row shows the items as a mini-table beneath

## 4. Scrap Form - Add Quantity Field, Make Value Optional

**Database migration needed:**
- Add `quantity` column (integer, default 1, not null) to `scrap_entries` table

**Changes to `src/pages/Scrap.tsx`:**
- Add a "Quantity" number input field to the Record Scrap form
- Make the "Scrap Value" field optional (remove `required`, allow empty/0)
- Update the ScrapEntry interface to include `quantity`
- Show quantity in the scrap tables
- Update stats to reflect quantities

## 5. Scrap Transactions - Record Both IN and OUT in Transaction History

Currently, the Transactions page just reads from `scrap_entries` and shows their current status. The user wants both the "mark in" (creation) and "mark out" events to appear as separate transaction records.

**Approach:** Instead of a separate transactions table, enhance the Transactions page scrap tab to show:
- All entries with status "IN" as an IN transaction (using `created_at` as the date)
- All entries with status "OUT" shown TWICE: once as IN (created_at) and once as OUT (marked_out_at)

This gives a full audit trail without a new table. Both the recording event and the mark-out event appear.

**Changes to `src/pages/Transactions.tsx`:**
- Transform scrap entries into transaction-like rows: for each OUT entry, create two rows (IN at created_at, OUT at marked_out_at)
- Add quantity column to the scrap transactions table

---

## Technical Summary

| File | Changes |
|------|---------|
| `src/pages/Dashboard.tsx` | Fetch shop_stock, shop_sales, shop_sale_items, scrap_entries, stock_transactions; add Shop, Scrap, Warehouse sections to overview |
| `src/pages/Inventory.tsx` | Set default transferForm to `transaction_type: 'IN', source: 'WAREHOUSE'`; auto-switch source when type changes |
| `src/pages/Shop.tsx` | Restructure Sales History table to clearly show item model, quantity per line |
| `src/pages/Scrap.tsx` | Add quantity field to form and interface; make scrap_value optional |
| `src/pages/Transactions.tsx` | Show dual rows for OUT scrap entries (IN record + OUT record); add quantity column |
| **DB Migration** | `ALTER TABLE scrap_entries ADD COLUMN quantity integer NOT NULL DEFAULT 1;` |

