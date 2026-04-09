-- ============================================================================
-- DATABASE STATUS CHECK - RUN THIS TO DIAGNOSE CURRENT DB STATE
-- ============================================================================

-- 1. CHECK ALL PUBLIC FUNCTIONS
SELECT 
  n.nspname as schema,
  p.proname as function_name,
  pg_get_functiondef(p.oid) as function_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
ORDER BY p.proname;

-- ============================================================================

-- 2. CHECK ALL TRIGGERS
SELECT 
  t.trigger_name,
  t.event_manipulation,
  t.event_object_table,
  t.action_statement
FROM information_schema.triggers t
WHERE t.trigger_schema = 'public'
ORDER BY t.event_object_table, t.trigger_name;

-- ============================================================================

-- 3. CHECK AGED_BATTERIES TABLE STRUCTURE
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'aged_batteries' AND table_schema = 'public'
ORDER BY ordinal_position;

-- ============================================================================

-- 4. CHECK AGED_BATTERY_EVENTS TABLE STRUCTURE
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'aged_battery_events' AND table_schema = 'public'
ORDER BY ordinal_position;

-- ============================================================================

-- 5. CHECK SCRAP_ENTRIES TABLE STRUCTURE
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'scrap_entries' AND table_schema = 'public'
ORDER BY ordinal_position;

-- ============================================================================

-- 6. CHECK FOREIGN KEYS IN AGED_BATTERIES
SELECT 
  kcu.constraint_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.key_column_usage kcu
JOIN information_schema.constraint_column_usage ccu ON kcu.constraint_name = ccu.constraint_name
WHERE kcu.table_name = 'aged_batteries' AND kcu.table_schema = 'public';

-- ============================================================================

-- 7. CHECK FOREIGN KEYS IN SCRAP_ENTRIES
SELECT 
  kcu.constraint_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.key_column_usage kcu
JOIN information_schema.constraint_column_usage ccu ON kcu.constraint_name = ccu.constraint_name
WHERE kcu.table_name = 'scrap_entries' AND kcu.table_schema = 'public';

-- ============================================================================

-- 8. CHECK ALL INDEXES
SELECT 
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- ============================================================================

-- 9. CHECK RLS POLICIES ON SCRAP_ENTRIES
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'scrap_entries';

-- ============================================================================

-- 10. CHECK RLS POLICIES ON AGED_BATTERIES
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'aged_batteries';

-- ============================================================================

-- 11. CHECK RLS POLICIES ON AGED_BATTERY_EVENTS
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'aged_battery_events';

-- ============================================================================

-- 12. CHECK IF AGED_BATTERIES TABLE HAS RLS ENABLED
SELECT 
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public' AND tablename IN ('aged_batteries', 'aged_battery_events', 'scrap_entries');

-- ============================================================================

-- 13. SAMPLE DATA - AGED_BATTERIES COUNT
SELECT COUNT(*) as total_aged_batteries FROM aged_batteries;

-- ============================================================================

-- 14. SAMPLE DATA - AGED_BATTERY_EVENTS COUNT
SELECT COUNT(*) as total_events FROM aged_battery_events;

-- ============================================================================

-- 15. SAMPLE DATA - SCRAP_ENTRIES COUNT
SELECT COUNT(*) as total_scrap_entries FROM scrap_entries;

-- ============================================================================

-- 16. CHECK AGED_BATTERY_ID COLUMN IN SCRAP_ENTRIES
SELECT EXISTS (
  SELECT FROM information_schema.columns 
  WHERE table_name = 'scrap_entries' 
  AND column_name = 'aged_battery_id'
) AS aged_battery_id_exists;

-- ============================================================================

-- 17. VERIFY RPC FUNCTION EXISTS - scrap_aged_battery
SELECT EXISTS (
  SELECT FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public' AND p.proname = 'scrap_aged_battery'
) AS scrap_aged_battery_exists;

-- ============================================================================

-- 18. VERIFY RPC FUNCTION EXISTS - rent_aged_battery
SELECT EXISTS (
  SELECT FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public' AND p.proname = 'rent_aged_battery'
) AS rent_aged_battery_exists;

-- ============================================================================

-- 19. VERIFY RPC FUNCTION EXISTS - sell_aged_battery
SELECT EXISTS (
  SELECT FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public' AND p.proname = 'sell_aged_battery'
) AS sell_aged_battery_exists;

-- ============================================================================

-- 20. VERIFY RPC FUNCTION EXISTS - return_aged_battery
SELECT EXISTS (
  SELECT FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public' AND p.proname = 'return_aged_battery'
) AS return_aged_battery_exists;

-- ============================================================================

-- 21. LIST ALL TABLES IN PUBLIC SCHEMA
SELECT 
  table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- ============================================================================

-- 22. CHECK AGED_TRANSFER_BATCHES TABLE STRUCTURE
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'aged_transfer_batches' AND table_schema = 'public'
ORDER BY ordinal_position;

-- ============================================================================

-- 23. CHECK AGED_BATTERY_RENTALS TABLE STRUCTURE
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'aged_battery_rentals' AND table_schema = 'public'
ORDER BY ordinal_position;

-- ============================================================================

-- 24. LIST ALL ENUMS
SELECT
  n.nspname as schema,
  t.typname as enum_name,
  array_agg(e.enumlabel ORDER BY e.enumsortorder) as enum_values
FROM pg_type t
JOIN pg_namespace n ON t.typnamespace = n.oid
LEFT JOIN pg_enum e ON t.oid = e.enumtypid
WHERE n.nspname = 'public'
GROUP BY n.nspname, t.typname
ORDER BY t.typname;

-- ============================================================================

-- 25. LOOK FOR CONSTRAINT DEFINITIONS ON AGED_BATTERIES
SELECT 
  constraint_name,
  constraint_type,
  table_name
FROM information_schema.table_constraints
WHERE table_name = 'aged_batteries' AND table_schema = 'public';

-- ============================================================================
