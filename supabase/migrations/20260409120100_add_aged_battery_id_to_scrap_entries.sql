-- Add missing aged_battery_id column to scrap_entries
-- This column links scrap entries back to aged batteries for proper tracking

ALTER TABLE public.scrap_entries 
ADD COLUMN IF NOT EXISTS aged_battery_id uuid;

-- Add foreign key constraint
ALTER TABLE public.scrap_entries
ADD CONSTRAINT scrap_entries_aged_battery_id_fkey 
FOREIGN KEY (aged_battery_id) REFERENCES public.aged_batteries(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_scrap_entries_aged_battery_id ON public.scrap_entries(aged_battery_id);

-- Add index on status for scrap ledger queries
CREATE INDEX IF NOT EXISTS idx_scrap_entries_status ON public.scrap_entries(status);

-- Add composite index for common queries
CREATE INDEX IF NOT EXISTS idx_scrap_entries_aged_battery_status ON public.scrap_entries(aged_battery_id, status);
