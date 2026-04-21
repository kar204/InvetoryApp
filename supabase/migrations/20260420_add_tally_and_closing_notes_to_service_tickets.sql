-- Add tally_ticket_number and closing_notes columns to service_tickets table
ALTER TABLE public.service_tickets
ADD COLUMN IF NOT EXISTS tally_ticket_number text,
ADD COLUMN IF NOT EXISTS closing_notes text;

-- Create index for tally_ticket_number for faster lookups
CREATE INDEX IF NOT EXISTS idx_service_tickets_tally_number ON public.service_tickets(tally_ticket_number);

-- Add comment for clarity
COMMENT ON COLUMN public.service_tickets.tally_ticket_number IS 'Reference number from Tally accounting software for ticket linkage';
COMMENT ON COLUMN public.service_tickets.closing_notes IS 'Optional notes recorded when closing the ticket and collecting payment';
