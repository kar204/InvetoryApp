-- Add FOC to payment method constraint for home_service_resolutions
-- This allows "Free of Cost (FOC)" as a valid payment method

-- Drop the existing constraint
ALTER TABLE public.home_service_resolutions
DROP CONSTRAINT home_service_resolutions_payment_method_check;

-- Add new constraint that includes FOC
ALTER TABLE public.home_service_resolutions
ADD CONSTRAINT home_service_resolutions_payment_method_check
CHECK (
  (payment_method = any (array['CASH'::text, 'CARD'::text, 'UPI'::text, 'FOC'::text]))
);

-- Also update the service_tickets table if it has a similar constraint
-- (Check comment at end if this is needed)
