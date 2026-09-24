-- Add resolution and payment fields to service_tickets
ALTER TABLE public.service_tickets
ADD COLUMN IF NOT EXISTS resolution_notes text,
ADD COLUMN IF NOT EXISTS service_price numeric(10,2),
ADD COLUMN IF NOT EXISTS payment_method text;

