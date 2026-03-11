-- ============================================
-- ADD SERVICE_TECHNICIAN ROLE TO ENUM
-- ============================================

-- Add service_technician to app_role enum if it doesn't exist
ALTER TYPE public.app_role ADD VALUE 'service_technician' BEFORE 'scrap_manager';
