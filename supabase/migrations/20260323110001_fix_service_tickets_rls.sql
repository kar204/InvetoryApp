-- Fix admin RLS for service_tickets using has_role function

-- Drop existing update policy
DROP POLICY IF EXISTS "Authenticated users can update tickets" ON public.service_tickets;
DROP POLICY IF EXISTS "Service tickets update policy" ON public.service_tickets;

-- Admin and service_technician can update tickets
CREATE POLICY "Service tickets update policy" ON public.service_tickets FOR UPDATE TO authenticated 
USING (true)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR
  public.has_role(auth.uid(), 'service_technician')
);
