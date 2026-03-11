import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow, format } from 'date-fns';
import { Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import { formatSLADuration } from '@/utils/slaUtils';
import { Input } from '@/components/ui/input';

interface SLAData {
  id: string;
  ticket_number?: string;
  request_number?: string;
  customer_name: string;
  status: string;
  time_opened: string;
  time_assigned: string | null;
  time_resolved: string | null;
  time_closed: string | null;
  duration_open_to_assigned: number | null;
  duration_assigned_to_resolved: number | null;
  duration_resolved_to_closed: number | null;
  total_duration: number | null;
  type: 'in_shop' | 'home_service';
}

export function SLATracking() {
  const [tickets, setTickets] = useState<SLAData[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<SLAData | null>(null);
  const [ticketType, setTicketType] = useState<'all' | 'in_shop' | 'home_service'>('all');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTickets();
  }, [ticketType, dateFrom, dateTo]);

  const fetchTickets = async () => {
    setLoading(true);
    try {
      let allTickets: SLAData[] = [];
      const fromIso = dateFrom ? (() => {
        const d = new Date(dateFrom);
        d.setHours(0, 0, 0, 0);
        return d.toISOString();
      })() : null;
      const toIso = dateTo ? (() => {
        const d = new Date(dateTo);
        d.setHours(23, 59, 59, 999);
        return d.toISOString();
      })() : null;

      // Fetch in-shop service tickets with SLA - GET FROM SLA TABLE DIRECTLY
      if (ticketType === 'all' || ticketType === 'in_shop') {
        let inShopQuery = supabase
          .from('service_ticket_sla')
          .select(`
            id,
            ticket_id,
            time_opened,
            time_assigned,
            time_resolved,
            time_closed,
            duration_open_to_assigned,
            duration_assigned_to_resolved,
            duration_resolved_to_closed,
            total_duration
          `)
          .order('created_at', { ascending: false });

        if (fromIso) inShopQuery = inShopQuery.gte('time_opened', fromIso);
        if (toIso) inShopQuery = inShopQuery.lte('time_opened', toIso);

        const { data: inShopData, error: inShopError } = await inShopQuery;

        if (!inShopError && inShopData) {
          // Now get ticket details for each SLA record
          const ticketIds = inShopData.map((s: any) => s.ticket_id);

          if (ticketIds.length > 0) {
            const { data: ticketData } = await supabase
              .from('service_tickets')
              .select('id, ticket_number, customer_name, status')
              .in('id', ticketIds);

            if (ticketData) {
              const formatted = inShopData.map((sla: any) => {
                const ticket = ticketData.find(t => t.id === sla.ticket_id);
                return {
                  id: sla.id,
                  ticket_number: ticket?.ticket_number,
                  customer_name: ticket?.customer_name || 'Unknown',
                  status: ticket?.status || 'UNKNOWN',
                  time_opened: sla.time_opened,
                  time_assigned: sla.time_assigned,
                  time_resolved: sla.time_resolved,
                  time_closed: sla.time_closed,
                  duration_open_to_assigned: sla.duration_open_to_assigned,
                  duration_assigned_to_resolved: sla.duration_assigned_to_resolved,
                  duration_resolved_to_closed: sla.duration_resolved_to_closed,
                  total_duration: sla.total_duration,
                  type: 'in_shop' as const,
                };
              });
              allTickets = [...allTickets, ...formatted];
            }
          }
        }
      }

      // Fetch home service requests with SLA - GET FROM SLA TABLE DIRECTLY
      if (ticketType === 'all' || ticketType === 'home_service') {
        let homeQuery = supabase
          .from('home_service_request_sla')
          .select(`
            id,
            request_id,
            time_opened,
            time_assigned,
            time_resolved,
            time_closed,
            duration_open_to_assigned,
            duration_assigned_to_resolved,
            duration_resolved_to_closed,
            total_duration
          `)
          .order('created_at', { ascending: false });

        if (fromIso) homeQuery = homeQuery.gte('time_opened', fromIso);
        if (toIso) homeQuery = homeQuery.lte('time_opened', toIso);

        const { data: homeData, error: homeError } = await homeQuery;

        if (!homeError && homeData) {
          // Now get request details for each SLA record
          const requestIds = homeData.map((s: any) => s.request_id);

          if (requestIds.length > 0) {
            const { data: requestData } = await supabase
              .from('home_service_requests')
              .select('id, request_number, customer_name, status')
              .in('id', requestIds);

            if (requestData) {
              const formatted = homeData.map((sla: any) => {
                const request = requestData.find(r => r.id === sla.request_id);
                return {
                  id: sla.id,
                  request_number: request?.request_number,
                  customer_name: request?.customer_name || 'Unknown',
                  status: request?.status || 'UNKNOWN',
                  time_opened: sla.time_opened,
                  time_assigned: sla.time_assigned,
                  time_resolved: sla.time_resolved,
                  time_closed: sla.time_closed,
                  duration_open_to_assigned: sla.duration_open_to_assigned,
                  duration_assigned_to_resolved: sla.duration_assigned_to_resolved,
                  duration_resolved_to_closed: sla.duration_resolved_to_closed,
                  total_duration: sla.total_duration,
                  type: 'home_service' as const,
                };
              });
              allTickets = [...allTickets, ...formatted];
            }
          }
        }
      }

      setTickets(allTickets);
      if (allTickets.length > 0 && !selectedTicket) {
        setSelectedTicket(allTickets[0]);
      }
    } catch (error) {
      console.error('Error fetching SLA data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (date: string | null) => {
    if (!date) return 'Not yet';
    return format(new Date(date), 'MMM dd, yyyy HH:mm');
  };

  const formatDuration = (hours: number | null) => {
    return formatSLADuration(hours);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'OPEN':
        return 'bg-amber-500/10 text-amber-600 dark:text-amber-400';
      case 'IN_PROGRESS':
        return 'bg-blue-500/10 text-blue-600 dark:text-blue-400';
      case 'RESOLVED':
        return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
      case 'CLOSED':
        return 'bg-slate-500/10 text-slate-600 dark:text-slate-400';
      default:
        return 'bg-slate-500/10 text-slate-600 dark:text-slate-400';
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading SLA data...</div>;
  }

  const q = search.trim().toLowerCase();
  const visibleTickets = q
    ? tickets.filter((t) => {
        const idPart = (t.ticket_number || t.request_number || '').toLowerCase();
        const cust = (t.customer_name || '').toLowerCase();
        return idPart.includes(q) || cust.includes(q);
      })
    : tickets;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-4">SLA Tracking Dashboard</h2>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <Select value={ticketType} onValueChange={(v) => setTicketType(v as any)}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tickets</SelectItem>
              <SelectItem value="in_shop">In-Shop Service</SelectItem>
              <SelectItem value="home_service">Home Service</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <Input
              placeholder="Search ticket/customer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') fetchTickets();
              }}
              className="w-full md:w-64"
            />
            <div className="flex gap-2 items-center">
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-[150px]"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-[150px]"
              />
            </div>
            <Button variant="outline" onClick={fetchTickets}>
              Apply
            </Button>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Ticket List */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg">Tickets ({visibleTickets.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 h-[600px] overflow-y-auto pr-2 styled-scrollbar">
            {visibleTickets.length === 0 ? (
              <p className="text-muted-foreground text-sm">No tickets found</p>
            ) : (
              visibleTickets.map((ticket) => (
                <div
                  key={ticket.id}
                  onClick={() => setSelectedTicket(ticket)}
                  className={`p-3 rounded-lg cursor-pointer border transition-all ${
                    selectedTicket?.id === ticket.id
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
                      : 'border-slate-200 dark:border-slate-700 hover:border-blue-300'
                  }`}
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex-1">
                      <div className="font-semibold text-sm">
                        {ticket.ticket_number || ticket.request_number}
                      </div>
                      <div className="text-xs text-muted-foreground">{ticket.customer_name}</div>
                      <Badge className={`mt-1 text-xs ${getStatusColor(ticket.status)}`}>
                        {ticket.status}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {ticket.type === 'in_shop' ? 'In-Shop' : 'Home'}
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* SLA Details */}
        {selectedTicket && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-lg">
                    {selectedTicket.ticket_number || selectedTicket.request_number}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">{selectedTicket.customer_name}</p>
                </div>
                <Badge className={getStatusColor(selectedTicket.status)}>
                  {selectedTicket.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Timeline */}
              <div className="space-y-4">
                {/* Time Opened */}
                <div className="flex gap-4">
                  <div className="flex-shrink-0">
                    <Clock className="w-5 h-5 text-amber-500 mt-1" />
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-sm">Opened</div>
                    <div className="text-sm text-muted-foreground">
                      {formatTime(selectedTicket.time_opened)}
                    </div>
                  </div>
                </div>

                {/* Time Assigned */}
                <div className="flex gap-4">
                  <div className="flex-shrink-0">
                    {selectedTicket.time_assigned ? (
                      <CheckCircle2 className="w-5 h-5 text-blue-500 mt-1" />
                    ) : (
                      <Clock className="w-5 h-5 text-slate-400 mt-1" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-sm">Assigned</div>
                    <div className="text-sm text-muted-foreground">
                      {formatTime(selectedTicket.time_assigned)}
                    </div>
                    {selectedTicket.time_assigned && selectedTicket.duration_open_to_assigned !== null && (
                      <div className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                        ⏱️ {formatDuration(selectedTicket.duration_open_to_assigned)} from open
                      </div>
                    )}
                  </div>
                </div>

                {/* Time Resolved */}
                <div className="flex gap-4">
                  <div className="flex-shrink-0">
                    {selectedTicket.time_resolved ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-1" />
                    ) : (
                      <Clock className="w-5 h-5 text-slate-400 mt-1" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-sm">Resolved</div>
                    <div className="text-sm text-muted-foreground">
                      {formatTime(selectedTicket.time_resolved)}
                    </div>
                    {selectedTicket.time_resolved && selectedTicket.duration_assigned_to_resolved !== null && (
                      <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                        ⏱️ {formatDuration(selectedTicket.duration_assigned_to_resolved)} from assignment
                      </div>
                    )}
                  </div>
                </div>

                {/* Time Closed */}
                <div className="flex gap-4">
                  <div className="flex-shrink-0">
                    {selectedTicket.time_closed ? (
                      <CheckCircle2 className="w-5 h-5 text-slate-500 mt-1" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-slate-400 mt-1" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-sm">Closed</div>
                    <div className="text-sm text-muted-foreground">
                      {formatTime(selectedTicket.time_closed)}
                    </div>
                    {selectedTicket.time_closed && selectedTicket.duration_resolved_to_closed !== null && (
                      <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                        ⏱️ {formatDuration(selectedTicket.duration_resolved_to_closed)} from resolution
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Total Duration */}
              {selectedTicket.total_duration !== null && (
                <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded-lg mt-4">
                  <div className="text-sm font-semibold">Total Duration</div>
                  <div className="text-lg font-bold mt-1">
                    {formatDuration(selectedTicket.total_duration)}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
