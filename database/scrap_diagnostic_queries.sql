-- ============================================================================
-- BATTERY SCRAP MODULE - DIAGNOSTIC QUERIES
-- ============================================================================
-- Use these queries in Supabase SQL Editor to debug the scrap flow
-- Replace placeholders like PASTE_* with actual values

-- ============================================================================
-- 1. SCRAP STATUS CHECK - Find all batteries marked as SCRAPPED
-- ============================================================================
SELECT 
  ab.id AS aged_battery_id,
  ab.barcode,
  ab.status,
  p.category,
  p.name,
  p.model,
  ab.created_at,
  ab.customer_id,
  c.name AS customer_name,
  COUNT(DISTINCT abe.id) AS event_count,
  MAX(abe.created_at) AS last_event_at,
  se.id AS scrap_entry_id,
  se.scrap_value,
  se.status AS scrap_status,
  se.recorded_by
FROM aged_batteries ab
LEFT JOIN products p ON p.id = ab.product_id
LEFT JOIN customers c ON c.id = ab.customer_id
LEFT JOIN aged_battery_events abe ON abe.aged_battery_id = ab.id
LEFT JOIN scrap_entries se ON se.aged_battery_id = ab.id
WHERE ab.status = 'SCRAPPED'
GROUP BY ab.id, ab.barcode, ab.status, p.category, p.name, p.model, ab.created_at, ab.customer_id, 
         c.name, se.id, se.scrap_value, se.status, se.recorded_by
ORDER BY ab.created_at DESC;


-- ============================================================================
-- 2. MISSING SCRAP ENTRIES - Find SCRAPPED batteries with NO scrap_entries row
-- ============================================================================
SELECT 
  ab.id AS aged_battery_id,
  ab.barcode,
  p.category,
  p.name,
  p.model,
  ab.created_at,
  MAX(abe.created_at) AS last_scrap_event,
  abe.notes AS last_event_notes
FROM aged_batteries ab
LEFT JOIN products p ON p.id = ab.product_id
LEFT JOIN aged_battery_events abe ON abe.aged_battery_id = ab.id
LEFT JOIN scrap_entries se ON se.aged_battery_id = ab.id
WHERE ab.status = 'SCRAPPED'
  AND se.id IS NULL
GROUP BY ab.id, ab.barcode, p.category, p.name, p.model, ab.created_at, abe.notes
ORDER BY ab.created_at DESC;


-- ============================================================================
-- 3. AGED BATTERY EVENT HISTORY - Full timeline for a specific battery
-- ============================================================================
-- INSTRUCTIONS: Replace 'PASTE_BARCODE_HERE' with an actual barcode
SELECT 
  abe.id,
  abe.event_type,
  abe.created_at,
  abe.notes,
  u.email AS performed_by,
  ab.status AS battery_status_at_event
FROM aged_battery_events abe
LEFT JOIN auth.users u ON u.id = abe.performed_by
LEFT JOIN aged_batteries ab ON ab.id = abe.aged_battery_id
WHERE ab.barcode = 'PASTE_BARCODE_HERE'
ORDER BY abe.created_at DESC;


-- ============================================================================
-- 4. SCRAP ENTRIES SUMMARY - View all scrap entries with links
-- ============================================================================
SELECT 
  se.id AS scrap_entry_id,
  se.customer_name,
  se.scrap_item,
  se.scrap_model,
  se.quantity,
  se.scrap_value,
  se.status,
  se.created_at,
  se.recorded_by,
  u_recorded.email AS recorded_by_email,
  se.marked_out_at,
  u_marked.email AS marked_out_by_email,
  ab.barcode AS linked_aged_battery_barcode,
  ab.id AS linked_aged_battery_id,
  ab.status AS aged_battery_status
FROM scrap_entries se
LEFT JOIN auth.users u_recorded ON u_recorded.id = se.recorded_by
LEFT JOIN auth.users u_marked ON u_marked.id = se.marked_out_by
LEFT JOIN aged_batteries ab ON ab.id = se.aged_battery_id
ORDER BY se.created_at DESC
LIMIT 100;


-- ============================================================================
-- 5. UNLINKED SCRAP ENTRIES - Scrap entries without aged_battery connection
-- ============================================================================
SELECT 
  se.id,
  se.customer_name,
  se.scrap_item,
  se.scrap_model,
  se.quantity,
  se.scrap_value,
  se.status,
  se.created_at,
  CASE 
    WHEN se.aged_battery_id IS NULL THEN 'MISSING LINK - Likely from manual entry'
    ELSE 'HAS AGED_BATTERY_LINK'
  END AS link_status
FROM scrap_entries se
WHERE se.aged_battery_id IS NULL
ORDER BY se.created_at DESC;


-- ============================================================================
-- 6. AGED BATTERY LIFECYCLE SUMMARY - Quick overview of one battery
-- ============================================================================
-- INSTRUCTIONS: Replace 'PASTE_BARCODE_HERE' with an actual barcode
WITH battery_data AS (
  SELECT 
    ab.id,
    ab.barcode,
    ab.status,
    ab.created_at,
    p.category,
    p.name,
    p.model,
    ab.customer_id,
    c.name AS customer_name
  FROM aged_batteries ab
  LEFT JOIN products p ON p.id = ab.product_id
  LEFT JOIN customers c ON c.id = ab.customer_id
  WHERE ab.barcode = 'PASTE_BARCODE_HERE'
)
SELECT 
  'BATTERY INFO' AS section,
  bd.barcode AS detail,
  bd.status AS value1,
  bd.category AS value2,
  NULL::text AS value3,
  NULL::text AS value4
FROM battery_data bd

UNION ALL

SELECT 
  'PRODUCT' AS section,
  bd.name AS detail,
  bd.model AS value1,
  NULL::text AS value2,
  NULL::text AS value3,
  NULL::text AS value4
FROM battery_data bd

UNION ALL

SELECT 
  'CUSTOMER' AS section,
  bd.customer_name AS detail,
  (SELECT STRING_AGG(event_type, ', ') FROM aged_battery_events WHERE aged_battery_id = bd.id) AS value1,
  NULL::text AS value2,
  NULL::text AS value3,
  NULL::text AS value4
FROM battery_data bd

UNION ALL

SELECT 
  'SCRAP ENTRY' AS section,
  COALESCE(se.scrap_model, 'NO SCRAP ENTRY') AS detail,
  se.status AS value1,
  '₹' || se.scrap_value::text AS value2,
  NULL::text AS value3,
  NULL::text AS value4
FROM battery_data bd
LEFT JOIN scrap_entries se ON se.aged_battery_id = bd.id;


-- ============================================================================
-- 7. AGED BATTERIES IN STOCK - Find all aged batteries by status
-- ============================================================================
SELECT 
  ab.status,
  COUNT(*) AS count,
  COUNT(DISTINCT ab.product_id) AS distinct_products,
  STRING_AGG(DISTINCT p.category, ', ') AS categories,
  MAX(ab.created_at) AS most_recent_added,
  MIN(ab.created_at) AS oldest_in_inventory
FROM aged_batteries ab
LEFT JOIN products p ON p.id = ab.product_id
GROUP BY ab.status
ORDER BY 
  CASE ab.status
    WHEN 'IN_STOCK' THEN 1
    WHEN 'RENTED' THEN 2
    WHEN 'RETURNED' THEN 3
    WHEN 'SOLD' THEN 4
    WHEN 'SCRAPPED' THEN 5
  END;


-- ============================================================================
-- 8. SCRAP VALUE SUMMARY - Total scrap value by status and category
-- ============================================================================
SELECT 
  se.status,
  p.category,
  COUNT(se.id) AS entry_count,
  SUM(se.quantity) AS total_quantity,
  SUM(se.scrap_value) AS total_value,
  ROUND(AVG(se.scrap_value), 2) AS avg_value_per_entry,
  ROUND(SUM(CASE WHEN se.aged_battery_id IS NOT NULL THEN se.scrap_value ELSE 0 END), 2) AS value_from_aged,
  ROUND(SUM(CASE WHEN se.aged_battery_id IS NULL THEN se.scrap_value ELSE 0 END), 2) AS value_from_manual
FROM scrap_entries se
LEFT JOIN aged_batteries ab ON ab.id = se.aged_battery_id
LEFT JOIN products p ON p.id = ab.product_id
GROUP BY se.status, p.category
ORDER BY se.status, total_value DESC;


-- ============================================================================
-- 9. DATA CONSISTENCY CHECK - Aged batteries vs Scrap entries connection
-- ============================================================================
SELECT 
  'Scrapped Batteries' AS metric,
  COUNT(*) AS count
FROM aged_batteries
WHERE status = 'SCRAPPED'

UNION ALL

SELECT 
  'Scrap Entries Linked' AS metric,
  COUNT(DISTINCT aged_battery_id) AS count
FROM scrap_entries
WHERE aged_battery_id IS NOT NULL

UNION ALL

SELECT 
  'Scrapped But Not In Scrap' AS metric,
  COUNT(*) AS count
FROM aged_batteries ab
WHERE ab.status = 'SCRAPPED'
  AND NOT EXISTS(
    SELECT 1 FROM scrap_entries se 
    WHERE se.aged_battery_id = ab.id
  )

UNION ALL

SELECT 
  'Scrap Events Created' AS metric,
  COUNT(*) AS count
FROM aged_battery_events
WHERE event_type = 'SCRAPPED';


-- ============================================================================
-- 10. SCRAP WORKFLOW DEBUG - Complete timeline for recent scraps
-- ============================================================================
SELECT 
  ab.barcode,
  ab.status,
  ab.created_at AS battery_added,
  MAX(abe.created_at) FILTER (WHERE abe.event_type = 'SCRAPPED') AS scrapped_at,
  COUNT(DISTINCT abe.id) FILTER (WHERE abe.event_type = 'SCRAPPED') AS scrap_events,
  se.id AS scrap_entry_id,
  se.created_at AS scrap_entry_created,
  se.scrap_value,
  se.status AS scrap_status,
  CASE 
    WHEN se.id IS NULL AND ab.status = 'SCRAPPED' THEN '❌ MISSING SCRAP ENTRY'
    WHEN se.id IS NOT NULL AND ab.status != 'SCRAPPED' THEN '⚠️  SCRAP ENTRY BUT NOT MARKED SCRAPPED'
    WHEN se.id IS NOT NULL AND ab.status = 'SCRAPPED' THEN '✅ OK'
    ELSE '❓ UNKNOWN'
  END AS status_check
FROM aged_batteries ab
LEFT JOIN aged_battery_events abe ON abe.aged_battery_id = ab.id
LEFT JOIN scrap_entries se ON se.aged_battery_id = ab.id
WHERE ab.status = 'SCRAPPED' OR EXISTS(
  SELECT 1 FROM aged_battery_events abe2 
  WHERE abe2.aged_battery_id = ab.id AND abe2.event_type = 'SCRAPPED'
)
GROUP BY ab.id, ab.barcode, ab.status, ab.created_at, se.id, se.created_at, se.scrap_value, se.status
ORDER BY ab.created_at DESC
LIMIT 50;
