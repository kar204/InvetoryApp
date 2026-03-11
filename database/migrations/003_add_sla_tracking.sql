-- ============================================
-- SLA TRACKING FOR SERVICE TICKETS
-- ============================================

-- Create SLA tracking table for in-shop service tickets
CREATE TABLE IF NOT EXISTS public.service_ticket_sla (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL UNIQUE REFERENCES public.service_tickets(id) ON DELETE CASCADE,

  -- Time tracking
  time_opened timestamp with time zone NOT NULL,
  time_assigned timestamp with time zone,
  time_resolved timestamp with time zone,
  time_closed timestamp with time zone,

  -- Duration calculations (in hours)
  duration_open_to_assigned numeric,
  duration_assigned_to_resolved numeric,
  duration_resolved_to_closed numeric,
  total_duration numeric,

  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT service_ticket_sla_pkey PRIMARY KEY (id)
);

-- Create SLA tracking table for home service requests
CREATE TABLE IF NOT EXISTS public.home_service_request_sla (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE REFERENCES public.home_service_requests(id) ON DELETE CASCADE,

  -- Time tracking
  time_opened timestamp with time zone NOT NULL,
  time_assigned timestamp with time zone,
  time_resolved timestamp with time zone,
  time_closed timestamp with time zone,

  -- Duration calculations (in hours)
  duration_open_to_assigned numeric,
  duration_assigned_to_resolved numeric,
  duration_resolved_to_closed numeric,
  total_duration numeric,

  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT home_service_request_sla_pkey PRIMARY KEY (id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_service_ticket_sla_ticket_id ON public.service_ticket_sla(ticket_id);
CREATE INDEX IF NOT EXISTS idx_home_service_request_sla_request_id ON public.home_service_request_sla(request_id);

-- ============================================
-- TRIGGERS TO AUTO-POPULATE SLA TIMES
-- ============================================

-- Function to handle service_tickets SLA tracking
CREATE OR REPLACE FUNCTION public.track_service_ticket_sla()
RETURNS TRIGGER AS $$
BEGIN
  -- When ticket is created
  IF NEW.created_at IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.service_ticket_sla WHERE ticket_id = NEW.id
  ) THEN
    INSERT INTO public.service_ticket_sla (ticket_id, time_opened)
    VALUES (NEW.id, NEW.created_at);
  END IF;

  -- When assigned (status changes to IN_PROGRESS or assigned_to changes)
  IF (OLD.assigned_to IS NULL AND NEW.assigned_to IS NOT NULL) OR
     (OLD.status = 'OPEN' AND NEW.status = 'IN_PROGRESS') THEN
    UPDATE public.service_ticket_sla
    SET
      time_assigned = now(),
      duration_open_to_assigned = EXTRACT(EPOCH FROM (now() - time_opened)) / 3600
    WHERE ticket_id = NEW.id AND time_assigned IS NULL;
  END IF;

  -- When resolved (any part resolved)
  IF (OLD.battery_resolved IS FALSE AND NEW.battery_resolved IS TRUE) OR
     (OLD.invertor_resolved IS FALSE AND NEW.invertor_resolved IS TRUE) THEN
    UPDATE public.service_ticket_sla
    SET
      time_resolved = GREATEST(
        COALESCE(NEW.battery_resolved_at, now()),
        COALESCE(NEW.invertor_resolved_at, now())
      ),
      duration_assigned_to_resolved = EXTRACT(EPOCH FROM (
        GREATEST(
          COALESCE(NEW.battery_resolved_at, now()),
          COALESCE(NEW.invertor_resolved_at, now())
        ) - COALESCE(time_assigned, time_opened)
      )) / 3600
    WHERE ticket_id = NEW.id AND time_resolved IS NULL;
  END IF;

  -- When closed
  IF OLD.status != 'CLOSED' AND NEW.status = 'CLOSED' THEN
    UPDATE public.service_ticket_sla
    SET
      time_closed = now(),
      duration_resolved_to_closed = EXTRACT(EPOCH FROM (now() - COALESCE(time_resolved, now()))) / 3600,
      total_duration = EXTRACT(EPOCH FROM (now() - time_opened)) / 3600
    WHERE ticket_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for service_tickets
DROP TRIGGER IF EXISTS service_ticket_sla_trigger ON public.service_tickets;
CREATE TRIGGER service_ticket_sla_trigger
AFTER INSERT OR UPDATE ON public.service_tickets
FOR EACH ROW
EXECUTE FUNCTION public.track_service_ticket_sla();

-- Function to handle home_service_requests SLA tracking
CREATE OR REPLACE FUNCTION public.track_home_service_request_sla()
RETURNS TRIGGER AS $$
BEGIN
  -- When request is created
  IF NEW.created_at IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.home_service_request_sla WHERE request_id = NEW.id
  ) THEN
    INSERT INTO public.home_service_request_sla (request_id, time_opened)
    VALUES (NEW.id, NEW.created_at);
  END IF;

  -- When assigned
  IF (OLD.assigned_to IS NULL AND NEW.assigned_to IS NOT NULL) OR
     (OLD.status = 'OPEN' AND NEW.status = 'IN_PROGRESS') THEN
    UPDATE public.home_service_request_sla
    SET
      time_assigned = COALESCE(NEW.assigned_at, now()),
      duration_open_to_assigned = EXTRACT(EPOCH FROM (COALESCE(NEW.assigned_at, now()) - time_opened)) / 3600
    WHERE request_id = NEW.id AND time_assigned IS NULL;
  END IF;

  -- When resolved (when resolution record is created, we need to update this via resolution insert trigger)
  -- This will be handled by the home_service_resolutions trigger

  -- When closed
  IF OLD.status != 'CLOSED' AND NEW.status = 'CLOSED' THEN
    UPDATE public.home_service_request_sla
    SET
      time_closed = now(),
      duration_resolved_to_closed = EXTRACT(EPOCH FROM (now() - COALESCE(time_resolved, now()))) / 3600,
      total_duration = EXTRACT(EPOCH FROM (now() - time_opened)) / 3600
    WHERE request_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for home_service_requests
DROP TRIGGER IF EXISTS home_service_request_sla_trigger ON public.home_service_requests;
CREATE TRIGGER home_service_request_sla_trigger
AFTER INSERT OR UPDATE ON public.home_service_requests
FOR EACH ROW
EXECUTE FUNCTION public.track_home_service_request_sla();

-- Function to track resolution time
CREATE OR REPLACE FUNCTION public.track_home_service_resolution_sla()
RETURNS TRIGGER AS $$
BEGIN
  -- When resolution is created, update the resolved time
  UPDATE public.home_service_request_sla
  SET
    time_resolved = NEW.resolved_at,
    duration_assigned_to_resolved = EXTRACT(EPOCH FROM (NEW.resolved_at - COALESCE(time_assigned, time_opened))) / 3600
  WHERE request_id = NEW.request_id AND time_resolved IS NULL;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for home_service_resolutions
DROP TRIGGER IF EXISTS home_service_resolution_sla_trigger ON public.home_service_resolutions;
CREATE TRIGGER home_service_resolution_sla_trigger
AFTER INSERT ON public.home_service_resolutions
FOR EACH ROW
EXECUTE FUNCTION public.track_home_service_resolution_sla();

-- ============================================
-- RLS POLICIES FOR SLA TABLES
-- ============================================

ALTER TABLE public.service_ticket_sla ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_service_request_sla ENABLE ROW LEVEL SECURITY;

-- Admins can view all SLA data
CREATE POLICY "admin_view_all_sla"
  ON public.service_ticket_sla
  FOR SELECT
  USING (
    (SELECT role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1) = 'admin'
  );

CREATE POLICY "admin_view_all_home_sla"
  ON public.home_service_request_sla
  FOR SELECT
  USING (
    (SELECT role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1) = 'admin'
  );

-- Service desk can view their created tickets' SLA
CREATE POLICY "counter_staff_view_own_sla"
  ON public.service_ticket_sla
  FOR SELECT
  USING (
    (SELECT created_by FROM public.service_tickets WHERE id = ticket_id) = auth.uid()
  );

CREATE POLICY "counter_staff_view_own_home_sla"
  ON public.home_service_request_sla
  FOR SELECT
  USING (
    (SELECT created_by FROM public.home_service_requests WHERE id = request_id) = auth.uid()
  );
