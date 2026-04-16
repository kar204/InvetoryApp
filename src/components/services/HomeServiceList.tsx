import { useCallback, useDeferredValue, useEffect, useRef, useState } from 'react';
import { AlertCircle, Battery, ChevronRight, MapPin, Phone, Zap } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { HomeServiceRequest, HomeServiceResolution, Profile } from '@/types/database';

interface HomeServiceListProps {
  viewMode: 'service_desk' | 'technician' | 'counter_staff';
  onSelectRequest: (request: HomeServiceRequest) => void;
  refreshTrigger?: number;
  initialSearch?: string;
}

type HomeServiceRequestResolution = Pick<HomeServiceResolution, 'request_id' | 'total_amount' | 'battery_resolution_notes' | 'inverter_resolution_notes'> & {
  battery_price: number | null;
  battery_within_warranty: boolean | null;
  inverter_price: number | null;
};

type HomeServiceRequestWithResolution = HomeServiceRequest & {
  resolution: HomeServiceRequestResolution | null;
};

const statusColors: Record<string, string> = {
  OPEN: 'bg-amber-500/10 text-amber-500 border-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.2)]',
  IN_PROGRESS: 'bg-[#4F8CFF]/10 text-[#4F8CFF] border-[#4F8CFF]/20 shadow-[0_0_10px_rgba(79,140,255,0.2)]',
  RESOLVED: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 shadow-[0_0_10px_rgba(34,197,94,0.2)]',
  CLOSED: 'bg-rose-500/10 text-rose-500 border-rose-500/20 shadow-[0_0_10px_rgba(244,63,94,0.2)]',
};

const priorityColors: Record<string, string> = {
  LOW: 'bg-green-500/10 text-green-600 dark:text-green-400',
  MEDIUM: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  HIGH: 'bg-red-500/10 text-red-600 dark:text-red-400',
};

const statusFilterOptions: Array<'all' | HomeServiceRequest['status']> = ['all', 'OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];

export function HomeServiceList({ viewMode, onSelectRequest, refreshTrigger, initialSearch }: HomeServiceListProps) {
  const { user } = useAuth();
  const [requests, setRequests] = useState<HomeServiceRequestWithResolution[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(initialSearch ?? '');
  const [statusFilter, setStatusFilter] = useState<'all' | HomeServiceRequest['status']>('all');
  const deferredSearch = useDeferredValue(search.trim());
  const hasFetchedRef = useRef(false);
  const formatCurrency = (amount: number) => `Rs. ${amount.toLocaleString('en-IN')}`;

  useEffect(() => {
    if (typeof initialSearch === 'string') {
      setSearch(initialSearch);
    }
  }, [initialSearch]);

  const fetchRequests = useCallback(async (showLoading = false) => {
    try {
      if (showLoading) {
        setLoading(true);
      }

      // First fetch requests
      let query = supabase
        .from('home_service_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (viewMode === 'technician') {
        query = query.eq('assigned_to', user?.id);
      }

      if (viewMode === 'counter_staff') {
        query = query.eq('created_by', user?.id);
      }

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      if (deferredSearch) {
        query = query.or(
          `customer_name.ilike.%${deferredSearch}%,customer_phone.ilike.%${deferredSearch}%,request_number.ilike.%${deferredSearch}%`
        );
      }

      const { data, error } = await query;
      if (error) throw error;
      const requestRows = (data as HomeServiceRequest[] | null) || [];

      const requestIds = requestRows.map((request) => request.id);
      const resolutionsMap: Record<string, HomeServiceRequestResolution> = {};

      if (requestIds.length > 0) {
        const { data: resolutions } = await supabase
          .from('home_service_resolutions')
          .select('*')
          .in('request_id', requestIds);

        ((resolutions as HomeServiceRequestResolution[] | null) || []).forEach((resolution) => {
          resolutionsMap[resolution.request_id] = resolution;
        });
      }

      setRequests(
        requestRows.map((request) => ({
          ...request,
          resolution: resolutionsMap[request.id] || null,
        })),
      );
    } catch (error) {
      console.error('Error fetching requests:', error);
    } finally {
      setLoading(false);
    }
  }, [deferredSearch, statusFilter, user?.id, viewMode]);

  useEffect(() => {
    fetchRequests(!hasFetchedRef.current);
    hasFetchedRef.current = true;
  }, [fetchRequests, refreshTrigger]);

  // Fetch profiles once
  useEffect(() => {
    const fetchProfiles = async () => {
      const { data } = await supabase.from('profiles').select('*');
      setProfiles((data as Profile[]) || []);
    };
    fetchProfiles();
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel(`home-service-requests-realtime-${viewMode}-${user?.id || 'anon'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'home_service_requests' }, () => {
        fetchRequests(false);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'home_service_resolutions' }, () => {
        fetchRequests(false);
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [fetchRequests, viewMode, user?.id]);

  const getProfileName = (userId: string) => {
    return profiles.find((p) => p.user_id === userId)?.name || 'Unassigned';
  };

  if (loading) {
    return <div className="py-8 text-center">Loading requests...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 justify-between rounded-lg border border-slate-200 bg-white p-3 dark:border-white/5 dark:bg-[#111827]/40 lg:flex-row lg:items-center">
        <div className="flex overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-white/5 dark:bg-[#0B0F19]">
          {statusFilterOptions.map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`whitespace-nowrap rounded-md px-4 py-2 text-xs font-semibold transition-all ${
                statusFilter === status
                  ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
              }`}
            >
              {status === 'all' ? 'All' : status.replace('_', ' ')}
            </button>
          ))}
        </div>

        <Input
          placeholder="Search by name, phone, request #..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm flex-1"
        />
      </div>

      {requests.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <AlertCircle className="mx-auto mb-2 h-8 w-8 opacity-50" />
            {viewMode === 'technician' ? 'No assigned requests' : 'No requests found'}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {requests.map((request) => (
            <Card
              key={request.id}
              className="cursor-pointer transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              onClick={() => onSelectRequest(request)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectRequest(request);
                }
              }}
              role="button"
              tabIndex={0}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold">{request.customer_name}</h3>
                      <Badge className={statusColors[request.status]}>{request.status}</Badge>
                      <Badge className={priorityColors[request.priority]}>{request.priority}</Badge>
                    </div>

                    <div className="space-y-1 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-muted px-2 py-1 text-xs">#{request.request_number}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4" />
                        {request.customer_phone}
                      </div>

                      {request.address && (
                        <div className="flex items-start gap-2">
                          <MapPin className="mt-0.5 h-4 w-4" />
                          <span>{request.address}</span>
                        </div>
                      )}

                      <div className="space-y-1 pt-2 text-xs">
                        {request.battery_model && (
                          <div className="flex items-center gap-2">
                            <Battery className="h-3.5 w-3.5" />
                            <span>Battery: {request.battery_model}</span>
                            {(request.resolution?.battery_price || 0) > 0 && (
                              <span className="font-semibold text-emerald-500">
                                {formatCurrency(request.resolution?.battery_price || 0)}
                              </span>
                            )}
                            {request.resolution?.battery_within_warranty && (
                              <Badge className="bg-emerald-500/10 text-emerald-500 text-[10px]">Warranty</Badge>
                            )}
                          </div>
                        )}
                        {request.inverter_model && (
                          <div className="flex items-center gap-2">
                            <Zap className="h-3.5 w-3.5" />
                            <span>Inverter: {request.inverter_model}</span>
                            {(request.resolution?.inverter_price || 0) > 0 && (
                              <span className="font-semibold text-emerald-500">
                                {formatCurrency(request.resolution?.inverter_price || 0)}
                              </span>
                            )}
                          </div>
                        )}
                        {request.spare_supplied && (
                          <div className="flex items-center gap-2">
                            <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border text-[9px] font-bold">S</span>
                            <span>Spare: {request.spare_supplied}</span>
                          </div>
                        )}
                        {(request.resolution?.total_amount || 0) > 0 && (
                          <div className="mt-1 flex items-center gap-2 border-t pt-1">
                            <span className="font-bold text-emerald-600">
                              Total: {formatCurrency(request.resolution?.total_amount || 0)}
                            </span>
                            {(request.resolution?.battery_price || 0) > 0 && (
                              <span className="text-slate-500">
                                (Battery: {formatCurrency(request.resolution?.battery_price || 0)})
                              </span>
                            )}
                            {(request.resolution?.inverter_price || 0) > 0 && (
                              <span className="text-slate-500">
                                (Inverter: {formatCurrency(request.resolution?.inverter_price || 0)})
                              </span>
                            )}
                          </div>
                        )}

                        {request.status === 'CLOSED' && (request.resolution?.battery_resolution_notes || request.resolution?.inverter_resolution_notes) && (
                          <div className="mt-2 space-y-1 border-t pt-1">
                            <p className="text-xs font-semibold text-muted-foreground">Resolution Notes:</p>
                            {request.resolution?.battery_resolution_notes && (
                              <p className="text-xs text-slate-600 dark:text-slate-400">🔋 {request.resolution.battery_resolution_notes}</p>
                            )}
                            {request.resolution?.inverter_resolution_notes && (
                              <p className="text-xs text-slate-600 dark:text-slate-400">⚡ {request.resolution.inverter_resolution_notes}</p>
                            )}
                          </div>
                        )}
                      </div>

                      {(viewMode === 'service_desk' || viewMode === 'counter_staff') && request.assigned_to && (
                        <div className="pt-2 text-xs">
                          Assigned to: <strong>{getProfileName(request.assigned_to)}</strong>
                        </div>
                      )}

                      <div className="pt-2 text-xs">
                        {formatDistanceToNow(new Date(request.created_at), { addSuffix: true })}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 text-sm font-medium text-primary">
                    <span>View</span>
                    <ChevronRight className="h-4 w-4" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {/* pagination removed */}
    </div>
  );
}
