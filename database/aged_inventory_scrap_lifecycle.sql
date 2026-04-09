-- Inventory -> Aged Battery -> Scrap lifecycle reference queries
-- These are read-only inspection queries to help understand how data flows today.

-- 1. Product-level snapshot across warehouse, aged inventory, and scrap
WITH warehouse AS (
  SELECT
    product_id,
    quantity AS warehouse_quantity
  FROM warehouse_stock
),
aged AS (
  SELECT
    product_id,
    COUNT(*) FILTER (WHERE status = 'IN_STOCK') AS aged_in_stock_count,
    COUNT(*) FILTER (WHERE status = 'RENTED') AS aged_rented_count,
    COUNT(*) FILTER (WHERE status = 'RETURNED') AS aged_returned_count,
    COUNT(*) FILTER (WHERE status = 'SOLD') AS aged_sold_count,
    COUNT(*) FILTER (WHERE status = 'SCRAPPED') AS aged_scrapped_count
  FROM aged_batteries
  GROUP BY product_id
),
scrap AS (
  SELECT
    ab.product_id,
    COALESCE(SUM(se.quantity) FILTER (WHERE se.status = 'IN'), 0) AS scrap_in_quantity,
    COALESCE(SUM(se.quantity) FILTER (WHERE se.status = 'OUT'), 0) AS scrap_out_quantity,
    COALESCE(SUM(se.scrap_value) FILTER (WHERE se.status = 'IN'), 0) AS scrap_in_value,
    COALESCE(SUM(se.scrap_value) FILTER (WHERE se.status = 'OUT'), 0) AS scrap_out_value
  FROM scrap_entries se
  LEFT JOIN aged_batteries ab ON ab.id = se.aged_battery_id
  GROUP BY ab.product_id
)
SELECT
  p.id AS product_id,
  p.name,
  p.model,
  p.category,
  COALESCE(w.warehouse_quantity, 0) AS warehouse_quantity,
  COALESCE(a.aged_in_stock_count, 0) AS aged_in_stock_count,
  COALESCE(a.aged_rented_count, 0) AS aged_rented_count,
  COALESCE(a.aged_returned_count, 0) AS aged_returned_count,
  COALESCE(a.aged_sold_count, 0) AS aged_sold_count,
  COALESCE(a.aged_scrapped_count, 0) AS aged_scrapped_count,
  COALESCE(s.scrap_in_quantity, 0) AS scrap_in_quantity,
  COALESCE(s.scrap_out_quantity, 0) AS scrap_out_quantity,
  COALESCE(s.scrap_in_value, 0) AS scrap_in_value,
  COALESCE(s.scrap_out_value, 0) AS scrap_out_value
FROM products p
LEFT JOIN warehouse w ON w.product_id = p.id
LEFT JOIN aged a ON a.product_id = p.id
LEFT JOIN scrap s ON s.product_id = p.id
ORDER BY p.category, p.name, p.model;


-- 2. See how warehouse transactions connect into aged inventory
SELECT
  ab.id AS aged_battery_id,
  ab.barcode,
  ab.status AS aged_status,
  ab.created_at AS aged_created_at,
  p.name AS product_name,
  p.model AS product_model,
  p.category AS product_category,
  st.id AS transfer_transaction_id,
  st.transaction_type,
  st.source,
  st.quantity AS transaction_quantity,
  st.remarks AS transaction_remarks,
  st.created_at AS transaction_created_at,
  atb.id AS batch_id,
  atb.batch_name,
  atb.status AS batch_status,
  atb.created_at AS batch_created_at
FROM aged_batteries ab
LEFT JOIN products p ON p.id = ab.product_id
LEFT JOIN stock_transactions st ON st.id = ab.transfer_transaction_id
LEFT JOIN aged_transfer_batches atb ON atb.id = ab.batch_id
ORDER BY ab.created_at DESC;


-- 3. Full timeline for one aged battery
-- Replace the barcode literal before running.
WITH target_battery AS (
  SELECT id, barcode
  FROM aged_batteries
  WHERE barcode = 'PASTE_BARCODE_HERE'
  LIMIT 1
)
SELECT
  timeline.stage,
  timeline.occurred_at,
  timeline.detail,
  timeline.notes,
  timeline.reference_id
FROM (
  SELECT
    'AGED_EVENT' AS stage,
    abe.created_at AS occurred_at,
    abe.event_type AS detail,
    abe.notes,
    abe.id::text AS reference_id
  FROM aged_battery_events abe
  JOIN target_battery tb ON tb.id = abe.aged_battery_id

  UNION ALL

  SELECT
    'RENTAL' AS stage,
    abr.rented_at AS occurred_at,
    'RENTED_OUT' AS detail,
    NULL::text AS notes,
    abr.id::text AS reference_id
  FROM aged_battery_rentals abr
  JOIN target_battery tb ON tb.id = abr.aged_battery_id

  UNION ALL

  SELECT
    'RENTAL_RETURN' AS stage,
    abr.returned_at AS occurred_at,
    'RETURNED' AS detail,
    NULL::text AS notes,
    abr.id::text AS reference_id
  FROM aged_battery_rentals abr
  JOIN target_battery tb ON tb.id = abr.aged_battery_id
  WHERE abr.returned_at IS NOT NULL

  UNION ALL

  SELECT
    'SCRAP_LEDGER' AS stage,
    se.created_at AS occurred_at,
    'SCRAP_' || se.status AS detail,
    NULL::text AS notes,
    se.id::text AS reference_id
  FROM scrap_entries se
  JOIN target_battery tb ON tb.id = se.aged_battery_id
) AS timeline
ORDER BY timeline.occurred_at NULLS LAST;


-- 4. Find scrapped aged batteries that still have no scrap_entries row
SELECT
  ab.id AS aged_battery_id,
  ab.barcode,
  p.name AS product_name,
  p.model AS product_model,
  p.category AS product_category,
  ab.created_at AS aged_created_at,
  MAX(abe.created_at) FILTER (WHERE abe.event_type ILIKE '%SCRAP%') AS last_scrap_event_at
FROM aged_batteries ab
LEFT JOIN products p ON p.id = ab.product_id
LEFT JOIN aged_battery_events abe ON abe.aged_battery_id = ab.id
LEFT JOIN scrap_entries se ON se.aged_battery_id = ab.id
WHERE ab.status = 'SCRAPPED'
  AND se.id IS NULL
GROUP BY ab.id, ab.barcode, p.name, p.model, p.category, ab.created_at
ORDER BY ab.created_at DESC;


-- 5. Scrap register with aged-battery origin when available
SELECT
  se.id AS scrap_entry_id,
  se.customer_name,
  se.scrap_item,
  se.scrap_model,
  se.quantity,
  se.scrap_value,
  se.status,
  se.created_at AS scrap_created_at,
  se.marked_out_at,
  ab.id AS aged_battery_id,
  ab.barcode,
  p.name AS product_name,
  p.model AS product_model,
  p.category AS product_category
FROM scrap_entries se
LEFT JOIN aged_batteries ab ON ab.id = se.aged_battery_id
LEFT JOIN products p ON p.id = ab.product_id
ORDER BY se.created_at DESC;


-- 6. High-level relationship reminder
-- products               -> master catalog
-- warehouse_stock        -> current warehouse on-hand by product
-- stock_transactions     -> movement log in/out of warehouse
-- aged_transfer_batches  -> transfer group when items are moved into aged flow
-- aged_batteries         -> one row per aged battery instance / barcode
-- aged_battery_events    -> lifecycle log for each aged battery
-- aged_battery_rentals   -> rental history for aged batteries
-- scrap_entries          -> scrap ledger, optionally linked back with aged_battery_id
