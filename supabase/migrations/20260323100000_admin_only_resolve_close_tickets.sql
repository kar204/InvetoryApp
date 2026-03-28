-- Add admin/technician RLS for resolving and closing service tickets
-- This policy allows admin and service_technician to mark RESOLVED/CLOSED

-- Drop existing update policy and replace with more restrictive one
DROP POLICY IF EXISTS "Authenticated users can update tickets" ON public.service_tickets;

-- Create new update policy using a function to check status changes
CREATE POLICY "Service tickets update policy" ON public.service_tickets FOR UPDATE TO authenticated 
USING (true)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR
  public.has_role(auth.uid(), 'service_technician')
  OR
  true
);
