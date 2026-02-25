

# Plan: Multi-product Forms, Search, Trolley Category, Bulk Import Fix, and Scrap Overhaul

## 1. Add "Trolley" as a new product category

**Database migration:**
- No enum change needed (category is a text column on `products` table), so "Trolley" just needs to be added in UI dropdowns.

**UI updates across all pages:**
- Add `<SelectItem value="Trolley">Trolley</SelectItem>` in:
  - Inventory: Add Product form category selector (line ~473)
  - Inventory: Tab filters (add Trolley tab)
  - Shop: Sale form product type selector (line ~288-291)
  - Shop: Tab filters and stats cards
  - Shop: Stats card for Trolley stock

## 2. Add search/filter in product selection dropdowns

Both the **Inventory Stock Transfer** form and **Shop Record Sale** form currently use plain `<Select>` dropdowns for choosing products. These will be replaced with a searchable input pattern:

- Add a text `<Input>` filter field above each product selector dropdown
- Filter the product list in real-time as the user types
- This applies to:
  - **Inventory** > Stock Transfer > "Add Products" dropdown (line ~579)
  - **Shop** > Record Sale > Product selector per item (line ~296)

Implementation: Add a local `productSearch` state. Render an `<Input>` for searching, then a scrollable list of matching products as clickable items (similar to a combobox pattern). This avoids adding new dependencies.

## 3. Redesign Shop "Record Sale" form to match Inventory transfer pattern

Currently each sale item is a separate card with dropdowns. Redesign to match the reference image:

- Single product selector with search at the top (select product to add)
- Products appear as a list below with name/model, quantity +/- controls, and remove (X) button
- Keep customer name, price per item, and quantity controls
- Add Remarks (Optional) textarea
- "Record Sale" button at bottom

## 4. Fix Bulk Import to support new products (not just quantity updates)

Current issue: Bulk upload only updates existing `warehouse_stock` rows by `Product ID`. Users can't add new products via Excel because IDs are auto-generated UUIDs.

**Solution:**
- Change the bulk import logic to support **two modes**:
  1. **Update existing**: If `Product ID` column has a value, update quantity (current behavior)
  2. **Add new products**: If `Product ID` is empty but `Product Name`, `Model`, and `Category` are filled, insert a new product + warehouse_stock row
- Update the template to include a note/instruction row or clearly label which columns are required for new products
- Auto-generate UUIDs server-side (Supabase handles this via `gen_random_uuid()`)

## 5. Overhaul Scrap module with proper categories and transaction tracking

**Scrap categories** (replace free-text `scrap_item` with structured categories):
- Car Battery
- Bike Battery
- Inverter Battery
- SMF Battery

**UI changes to Scrap page:**
- Replace the free-text "Scrap Item" input with a `<Select>` dropdown containing the 4 categories above
- Keep `scrap_model` as free text for the specific model
- Keep IN/OUT tabs as they are
- Add scrap transactions to the **Transactions page** as a sub-module tab

**Transactions page updates:**
- Add tabs: "Stock Transactions" (existing) | "Scrap Transactions" (new)
- Scrap Transactions tab shows all scrap entries with IN/OUT status, dates, values, and who recorded them

## Technical Details

### Files to modify:

| File | Changes |
|------|---------|
| `src/pages/Inventory.tsx` | Add Trolley category in Add Product form and tabs; add search input in Stock Transfer product selector; update bulk import logic to support new product creation |
| `src/pages/Shop.tsx` | Add Trolley to product type selector and tabs/stats; redesign Record Sale form with single searchable product picker and list pattern; add search in product selection |
| `src/pages/Scrap.tsx` | Replace free-text scrap_item with category dropdown (Car, Bike, Inverter Battery, SMF); keep model as text |
| `src/pages/Transactions.tsx` | Add Tabs for "Stock Transactions" and "Scrap Transactions"; fetch and display scrap_entries in new tab |

### No database migration needed:
- `scrap_item` is already a text column -- we just constrain it via UI dropdown
- `category` on products is a text column -- "Trolley" works without schema changes
- Bulk import creates new products using existing `products` + `warehouse_stock` insert APIs

