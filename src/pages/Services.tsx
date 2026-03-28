import { useEffect, useState } from 'react';
import { Plus, Search, Filter, Download, Trash2, Phone, Battery, Zap, Wrench, ChevronRight } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { supabase } from '@/integrations/supabase/client';
import { ServiceTicket, ServiceStatus, Profile, UserRole, HomeServiceRequest } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { usePollingRefresh } from '@/hooks/usePollingRefresh';
import { formatDistanceToNow } from 'date-fns';
import { PrintTicket } from '@/components/PrintTicket';
import { downloadCSV, formatTicketForExport } from '@/utils/exportUtils';
import { HomeServiceForm } from '@/components/services/HomeServiceForm';
import { HomeServiceList } from '@/components/services/HomeServiceList';
import { HomeServiceResolutionForm } from '@/components/services/HomeServiceResolutionForm';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const statusColors: Record<string, string> = {
  OPEN: 'bg-amber-500/10 text-amber-500 border-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.2)]',
  IN_PROGRESS: 'bg-[#4F8CFF]/10 text-[#4F8CFF] border-[#4F8CFF]/20 shadow-[0_0_10px_rgba(79,140,255,0.2)]',
  RESOLVED: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 shadow-[0_0_10px_rgba(34,197,94,0.2)]',
  CLOSED: 'bg-rose-500/10 text-rose-500 border-rose-500/20 shadow-[0_0_10px_rgba(244,63,94,0.2)]',
};

// NOTE:
// These Home Service views must live at module scope.
// If defined inside the Services component, they get recreated on every render,
// which makes React unmount/remount them and causes dialogs/forms to close mid-action.
type HomeServiceAdminViewProps = {
  homeSearch: string;
  onRefresh: () => void;
  externalRefreshTrigger?: number;
};

function HomeServiceAdminView({ homeSearch, onRefresh, externalRefreshTrigger = 0 }: HomeServiceAdminViewProps) {
  const { toast } = useToast();
  const [selectedRequest, setSelectedRequest] = useState<HomeServiceRequest | null>(null);
  const [technicians, setTechnicians] = useState<Profile[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [showResolutionForm, setShowResolutionForm] = useState(false);

  useEffect(() => {
    const run = async () => {
      try {
        const { data, error: rolesError } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('role', 'service_technician');

        if (rolesError) {
          console.error('Error fetching technician roles:', rolesError);
          return;
        }

        const technicianIds = (data || []).map((r: { user_id: string }) => r.user_id);

        if (technicianIds.length === 0) {
          console.warn('No service_technician roles found in database');
          setTechnicians([]);
          return;
        }

        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('*')
          .in('user_id', technicianIds);

        if (profilesError) {
          console.error('Error fetching technician profiles:', profilesError);
          return;
        }

        setTechnicians((profilesData as Profile[]) || []);
      } catch (error) {
        console.error('Error fetching technicians:', error);
      }
    };

    run();
  }, []);

  const handleAssignTechnician = async (requestId: string, technicianId: string) => {
    try {
      const { error } = await supabase
        .from('home_service_requests')
        .update({ assigned_to: technicianId, assigned_at: new Date().toISOString(), status: 'IN_PROGRESS' })
        .eq('id', requestId);

      if (error) throw error;

      toast({ title: 'Technician assigned successfully' });
      setSelectedRequest(null);
      setRefreshTrigger((prev) => prev + 1);
      onRefresh();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      toast({ title: 'Error assigning', description: errorMessage, variant: 'destructive' });
    }
  };

  const handleDeleteRequest = async (request: HomeServiceRequest) => {
    try {
      setDeleting(true);
      // With RLS, a DELETE can "succeed" with 0 affected rows (no error).
      // Request the deleted row back so we can detect no-op deletes.
      const { data, error } = await supabase.from('home_service_requests').delete().eq('id', request.id).select('id');
      if (error) throw error;

      if (!data || data.length === 0) {
        toast({
          title: 'Not deleted',
          description: 'No rows were deleted (permission denied or record not found).',
          variant: 'destructive',
        });
        return;
      }

      toast({ title: 'Request deleted' });
      setSelectedRequest(null);
      setRefreshTrigger((prev) => prev + 1);
      onRefresh();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      toast({ title: 'Error deleting', description: errorMessage, variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <HomeServiceList
        viewMode="service_desk"
        onSelectRequest={setSelectedRequest}
        refreshTrigger={refreshTrigger + externalRefreshTrigger}
        initialSearch={homeSearch}
      />

      <Dialog open={!!selectedRequest && !showResolutionForm} onOpenChange={() => setSelectedRequest(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Service Request Details</DialogTitle>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-4">
              <div className="grid gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Customer:</span>
                  <p className="font-semibold">{selectedRequest.customer_name}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Phone:</span>
                  <p className="font-semibold">{selectedRequest.customer_phone}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Address:</span>
                  <p className="font-semibold">{selectedRequest.address}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Status:</span>
                  <p className="font-semibold">{selectedRequest.status}</p>
                </div>
                {selectedRequest.battery_model && (
                  <div>
                    <span className="text-muted-foreground">Battery Model:</span>
                    <p className="font-semibold">{selectedRequest.battery_model}</p>
                  </div>
                )}
                {selectedRequest.inverter_model && (
                  <div>
                    <span className="text-muted-foreground">Inverter Model:</span>
                    <p className="font-semibold">{selectedRequest.inverter_model}</p>
                  </div>
                )}
                {selectedRequest.spare_supplied && (
                  <div>
                    <span className="text-muted-foreground">Spare Supplied:</span>
                    <p className="font-semibold">{selectedRequest.spare_supplied}</p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Assign Service Technician</Label>
                {technicians.length === 0 ? (
                  <div className="bg-amber-50 dark:bg-amber-950/20 p-3 rounded-lg border border-amber-200 dark:border-amber-800/50">
                    <p className="text-sm text-amber-800 dark:text-amber-200">
                      Warning: No service technicians available. Please assign a service_technician role to a user first.
                    </p>
                  </div>
                ) : (
                  <Select onValueChange={(techId) => handleAssignTechnician(selectedRequest.id, techId)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a technician" />
                    </SelectTrigger>
                    <SelectContent>
                      {technicians.map((tech) => (
                        <SelectItem key={tech.user_id} value={tech.user_id}>
                          {tech.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <Button onClick={() => setShowResolutionForm(true)} className="w-full" disabled={selectedRequest.status === 'CLOSED'}>
                  Resolve & Close
                </Button>
                <Button type="button" variant="destructive" onClick={() => handleDeleteRequest(selectedRequest)} disabled={deleting}>
                  {deleting ? 'Deleting...' : 'Delete Request'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <HomeServiceResolutionForm
        request={selectedRequest}
        isOpen={!!selectedRequest && showResolutionForm}
        onClose={() => setShowResolutionForm(false)}
        onResolved={() => {
          setShowResolutionForm(false);
          setSelectedRequest(null);
          setRefreshTrigger((prev) => prev + 1);
          onRefresh();
        }}
      />
    </div>
  );
}

type HomeServiceCounterStaffViewProps = {
  homeSearch: string;
  externalRefreshTrigger?: number;
};

function HomeServiceCounterStaffView({ homeSearch, externalRefreshTrigger = 0 }: HomeServiceCounterStaffViewProps) {
  const [selectedRequest, setSelectedRequest] = useState<HomeServiceRequest | null>(null);
  const [assignedTechnicianName, setAssignedTechnicianName] = useState<string>('');

  useEffect(() => {
    const assignedId = selectedRequest?.assigned_to;
    if (!assignedId) {
      setAssignedTechnicianName('');
      return;
    }

    void (async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('name')
          .eq('user_id', assignedId)
          .maybeSingle();

        setAssignedTechnicianName(data?.name ?? 'Technician');
      } catch {
        setAssignedTechnicianName('Technician');
      }
    })();
  }, [selectedRequest?.assigned_to]);

  return (
    <div className="space-y-4">
      <HomeServiceList
        viewMode="counter_staff"
        onSelectRequest={setSelectedRequest}
        initialSearch={homeSearch}
        refreshTrigger={externalRefreshTrigger}
      />

      <Dialog open={!!selectedRequest} onOpenChange={() => setSelectedRequest(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Service Request Details</DialogTitle>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-4">
              <div className="grid gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Customer:</span>
                  <p className="font-semibold">{selectedRequest.customer_name}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Phone:</span>
                  <p className="font-semibold">{selectedRequest.customer_phone}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Address:</span>
                  <p className="font-semibold">{selectedRequest.address}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Status:</span>
                  <p className="font-semibold">{selectedRequest.status}</p>
                </div>
                {selectedRequest.battery_model && (
                  <div>
                    <span className="text-muted-foreground">Battery Model:</span>
                    <p className="font-semibold">{selectedRequest.battery_model}</p>
                  </div>
                )}
                {selectedRequest.inverter_model && (
                  <div>
                    <span className="text-muted-foreground">Inverter Model:</span>
                    <p className="font-semibold">{selectedRequest.inverter_model}</p>
                  </div>
                )}
                {selectedRequest.spare_supplied && (
                  <div>
                    <span className="text-muted-foreground">Spare Supplied:</span>
                    <p className="font-semibold">{selectedRequest.spare_supplied}</p>
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">Assigned:</span>
                  <p className="font-semibold">{selectedRequest.assigned_to ? assignedTechnicianName : 'Not yet'}</p>
                </div>
              </div>

              <div className="flex justify-end">
                <Button type="button" variant="outline" onClick={() => setSelectedRequest(null)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

type HomeServiceTechnicianViewProps = {
  homeSearch: string;
  onRefresh: () => void;
  externalRefreshTrigger?: number;
};

function HomeServiceTechnicianView({ homeSearch, onRefresh, externalRefreshTrigger = 0 }: HomeServiceTechnicianViewProps) {
  const [selectedRequest, setSelectedRequest] = useState<HomeServiceRequest | null>(null);
  const [showResolutionForm, setShowResolutionForm] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  return (
    <div className="space-y-4">
      <HomeServiceList
        viewMode="technician"
        onSelectRequest={setSelectedRequest}
        refreshTrigger={refreshTrigger + externalRefreshTrigger}
        initialSearch={homeSearch}
      />

      <Dialog open={!!selectedRequest && !showResolutionForm} onOpenChange={() => setSelectedRequest(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Service Request Details</DialogTitle>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-4">
              <div className="grid gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Customer:</span>
                  <p className="font-semibold">{selectedRequest.customer_name}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Phone:</span>
                  <p className="font-semibold">{selectedRequest.customer_phone}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Address:</span>
                  <p className="font-semibold">{selectedRequest.address}</p>
                </div>
                {selectedRequest.battery_model && (
                  <div>
                    <span className="text-muted-foreground">Battery Model:</span>
                    <p className="font-semibold">{selectedRequest.battery_model}</p>
                  </div>
                )}
                {selectedRequest.inverter_model && (
                  <div>
                    <span className="text-muted-foreground">Inverter Model:</span>
                    <p className="font-semibold">{selectedRequest.inverter_model}</p>
                  </div>
                )}
                {selectedRequest.spare_supplied && (
                  <div>
                    <span className="text-muted-foreground">Spare Supplied:</span>
                    <p className="font-semibold">{selectedRequest.spare_supplied}</p>
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">Issue Description:</span>
                  <p className="font-semibold">{selectedRequest.issue_description}</p>
                </div>
              </div>

              <Button onClick={() => setShowResolutionForm(true)} className="w-full" disabled={selectedRequest.status === 'CLOSED'}>
                Resolve & Close
              </Button>
              {selectedRequest.status === 'CLOSED' && (
                <p className="text-sm text-muted-foreground">This request is already closed.</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <HomeServiceResolutionForm
        request={selectedRequest}
        isOpen={showResolutionForm}
        onClose={() => {
          setShowResolutionForm(false);
          setSelectedRequest(null);
        }}
        onResolved={() => {
          setShowResolutionForm(false);
          setSelectedRequest(null);
          setRefreshTrigger((prev) => prev + 1);
          onRefresh();
        }}
      />
    </div>
  );
}

export default function Services() {
  const location = useLocation();
  const { user, hasRole, hasAnyRole } = useAuth();
  const { toast } = useToast();
  const isServiceTechnician = hasRole('service_technician');
  const [tickets, setTickets] = useState<ServiceTicket[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [spBatteryAgents, setSpBatteryAgents] = useState<string[]>([]);
  const [spInvertorAgents, setSpInvertorAgents] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [homeSearch, setHomeSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<ServiceTicket | null>(null);
  const [ticketToDelete, setTicketToDelete] = useState<ServiceTicket | null>(null);
  const [homeServiceRefreshTrigger, setHomeServiceRefreshTrigger] = useState(0);
  const [activeTab, setActiveTab] = useState<'in-shop' | 'home-service'>(isServiceTechnician ? 'home-service' : 'in-shop');

  // Battery resolution state
  const [ticketToResolveBattery, setTicketToResolveBattery] = useState<ServiceTicket | null>(null);
  const [batteryRechargeable, setBatteryRechargeable] = useState<'yes' | 'no' | ''>('');
  const [batteryPrice, setBatteryPrice] = useState('');

  // Invertor resolution state
  const [ticketToResolveInvertor, setTicketToResolveInvertor] = useState<ServiceTicket | null>(null);
  const [invertorResolved, setInvertorResolved] = useState<'yes' | 'no' | ''>('');
  const [invertorIssueDescription, setInvertorIssueDescription] = useState('');
  const [invertorPrice, setInvertorPrice] = useState('');

  // Close ticket state
  const [ticketToClose, setTicketToClose] = useState<ServiceTicket | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD' | 'UPI' | ''>('');

  // Form state
  const [formData, setFormData] = useState({
    customer_name: '',
    customer_phone: '',
    battery_model: '',
    invertor_model: '',
    issue_description: '',
  });

  const [showNewTicketPrint, setShowNewTicketPrint] = useState<ServiceTicket | null>(null);
  const [showClosedPrint, setShowClosedPrint] = useState<ServiceTicket | null>(null);

  useEffect(() => {
    fetchTickets();
    fetchProfiles();
    fetchServiceAgents();

    const ticketsChannel = supabase
      .channel('service-tickets-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_tickets' }, () => {
        fetchTickets();
      })
      .subscribe();

    const rolesChannel = supabase
      .channel('user-roles-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_roles' }, () => {
        fetchServiceAgents();
      })
      .subscribe();

    return () => {
      ticketsChannel.unsubscribe();
      rolesChannel.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  // Deep-link support: /services?tab=in-shop&q=... or /services?tab=home-service&q=...
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tabParam = params.get('tab');
    const qParam = (params.get('q') || '').trim();

    const normalizedTab = tabParam === 'in-shop' || tabParam === 'home-service' ? tabParam : null;
    const action = params.get('action');

    if (!isServiceTechnician && normalizedTab) {
      setActiveTab(normalizedTab);
    }

    const effectiveTab = normalizedTab ?? (isServiceTechnician ? 'home-service' : 'in-shop');
    if (effectiveTab === 'in-shop') setSearch(qParam);
    else setHomeSearch(qParam);

    if (action === 'create') setIsCreateOpen(true);
  }, [location.search, isServiceTechnician]);

  const fetchTickets = async () => {
    try {
      let query = supabase
        .from('service_tickets')
        .select('*')
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter as ServiceStatus);
      }

      const { data, error } = await query;

      if (error) throw error;
      setTickets((data as ServiceTicket[]) || []);
    } catch (error) {
      console.error('Error fetching tickets:', error);
    } finally {
      setLoading(false);
    }
  };

  // Fallback polling (helps multi-user environments if realtime events are missed)
  usePollingRefresh(fetchTickets, 30000);

  const fetchProfiles = async () => {
    const { data } = await supabase.from('profiles').select('*');
    setProfiles((data as Profile[]) || []);
  };

  const fetchServiceAgents = async () => {
    // Get SP Battery agents
    const { data: batteryData } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'sp_battery');

    // Get SP Invertor agents
    const { data: invertorData } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'sp_invertor');

    setSpBatteryAgents((batteryData || []).map((r: { user_id: string }) => r.user_id));
    setSpInvertorAgents((invertorData || []).map((r: { user_id: string }) => r.user_id));
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) return;

    if (!formData.battery_model && !formData.invertor_model) {
      toast({
        title: 'Validation Error',
        description: 'Please provide at least a Battery Model or an Invertor Model.',
        variant: 'destructive'
      });
      return;
    }

    try {
      const hasBattery = !!formData.battery_model;
      const hasInvertor = !!formData.invertor_model;

      // Auto-assign to SP Battery if battery model is provided
      let batteryAgentId = hasBattery && spBatteryAgents.length > 0 ? spBatteryAgents[0] : null;
      // Auto-assign to SP Invertor if invertor model is provided
      let invertorAgentId = hasInvertor && spInvertorAgents.length > 0 ? spInvertorAgents[0] : null;

      // Fallback: If no SP agent is found and current user is an admin, auto-assign to self
      if (hasBattery && !batteryAgentId && isAdmin) {
        batteryAgentId = user.id;
      }
      if (hasInvertor && !invertorAgentId && isAdmin) {
        invertorAgentId = user.id;
      }

      const status = (batteryAgentId || invertorAgentId) ? 'IN_PROGRESS' : 'OPEN';

      const { data, error } = await supabase.from('service_tickets').insert({
        customer_name: formData.customer_name,
        customer_phone: formData.customer_phone,
        battery_model: formData.battery_model || '-',
        invertor_model: formData.invertor_model || null,
        issue_description: formData.issue_description,
        created_by: user.id,
        assigned_to_battery: batteryAgentId,
        assigned_to_invertor: invertorAgentId,
        assigned_to: batteryAgentId || invertorAgentId, // Keep for backward compatibility
        status: status,
        battery_resolved: hasBattery ? false : null,
        invertor_resolved: hasInvertor ? false : null,
      }).select().single();

      if (error) throw error;

      if ((hasBattery && !batteryAgentId) || (hasInvertor && !invertorAgentId)) {
        toast({
          title: 'Ticket created (Partial assignment)',
          description: 'One or more parts could not be auto-assigned. Please check assignment manually.',
          variant: 'default'
        });
      } else {
        toast({ title: 'Ticket created & auto-assigned' });
      }
      setIsCreateOpen(false);
      setFormData({
        customer_name: '',
        customer_phone: '',
        battery_model: '',
        invertor_model: '',
        issue_description: '',
      });

      // Show print dialog for new ticket
      setShowNewTicketPrint(data as ServiceTicket);

      fetchTickets();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      toast({ title: 'Error creating ticket', description: errorMessage, variant: 'destructive' });
    }
  };

  const handleAssignBattery = async (ticketId: string, assigneeId: string) => {
    try {
      const { error } = await supabase
        .from('service_tickets')
        .update({
          assigned_to_battery: assigneeId,
          assigned_to: assigneeId,
          status: 'IN_PROGRESS'
        })
        .eq('id', ticketId);

      if (error) throw error;

      await supabase.from('service_logs').insert({
        ticket_id: ticketId,
        action: 'Battery assigned to SP',
        user_id: user?.id,
      });

      toast({ title: 'SP Battery assigned successfully' });
      setSelectedTicket(null);
      fetchTickets();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      toast({ title: 'Error assigning', description: errorMessage, variant: 'destructive' });
    }
  };

  const handleAssignInvertor = async (ticketId: string, assigneeId: string) => {
    try {
      const { error } = await supabase
        .from('service_tickets')
        .update({ assigned_to_invertor: assigneeId })
        .eq('id', ticketId);

      if (error) throw error;

      await supabase.from('service_logs').insert({
        ticket_id: ticketId,
        action: 'Invertor assigned to SP',
        user_id: user?.id,
      });

      toast({ title: 'SP Invertor assigned successfully' });
      setSelectedTicket(null);
      fetchTickets();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      toast({ title: 'Error assigning', description: errorMessage, variant: 'destructive' });
    }
  };

  const handleDeleteTicket = async () => {
    if (!ticketToDelete) return;

    try {
      const { error } = await supabase
        .from('service_tickets')
        .delete()
        .eq('id', ticketToDelete.id);

      if (error) throw error;

      toast({ title: 'Ticket deleted successfully' });
      setTicketToDelete(null);
      setSelectedTicket(null);
      fetchTickets();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      toast({ title: 'Error deleting ticket', description: errorMessage, variant: 'destructive' });
    }
  };

  // Handle Battery Resolution
  const handleBatteryResolveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketToResolveBattery || !user || !batteryRechargeable) return;

    const priceNumber = Number(batteryPrice);
    if (Number.isNaN(priceNumber) || priceNumber < 0) {
      toast({ title: 'Enter a valid price', variant: 'destructive' });
      return;
    }

    try {
      const hasInvertor = !!ticketToResolveBattery.invertor_model;
      const invertorAlreadyResolved = ticketToResolveBattery.invertor_resolved === true;

      // Determine if ticket should be marked as RESOLVED
      const shouldResolve = !hasInvertor || invertorAlreadyResolved;

      const updateData: Partial<ServiceTicket> = {
        battery_rechargeable: batteryRechargeable === 'yes',
        battery_resolved: true,
        battery_price: priceNumber,
        battery_resolved_by: user.id,
        battery_resolved_at: new Date().toISOString(),
      };

      if (shouldResolve) {
        updateData.status = 'RESOLVED';
        // Calculate total price
        updateData.service_price = priceNumber + (ticketToResolveBattery.invertor_price || 0);
        updateData.resolution_notes = `Battery: ${batteryRechargeable === 'yes' ? 'Rechargeable' : 'Not rechargeable'}`;
      }

      const { error } = await supabase
        .from('service_tickets')
        .update(updateData)
        .eq('id', ticketToResolveBattery.id);

      if (error) throw error;

      await supabase.from('service_logs').insert({
        ticket_id: ticketToResolveBattery.id,
        action: `Battery resolved - Rechargeable: ${batteryRechargeable}, Price: Rs. ${priceNumber}`,
        user_id: user.id,
      });

      toast({ title: 'Battery resolution saved' });

      setTicketToResolveBattery(null);
      setBatteryRechargeable('');
      setBatteryPrice('');
      setSelectedTicket(null);
      fetchTickets();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      toast({ title: 'Error saving resolution', description: errorMessage, variant: 'destructive' });
    }
  };

  // Handle Invertor Resolution
  const handleInvertorResolveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketToResolveInvertor || !user || !invertorResolved) return;

    const priceNumber = Number(invertorPrice);
    if (Number.isNaN(priceNumber) || priceNumber < 0) {
      toast({ title: 'Enter a valid price', variant: 'destructive' });
      return;
    }

    try {
      const batteryAlreadyResolved = ticketToResolveInvertor.battery_resolved === true;

      // Determine if ticket should be marked as RESOLVED
      const shouldResolve = batteryAlreadyResolved;

      const updateData: Partial<ServiceTicket> = {
        invertor_resolved: true,
        invertor_price: priceNumber,
        invertor_issue_description: invertorIssueDescription || null,
        invertor_resolved_by: user.id,
        invertor_resolved_at: new Date().toISOString(),
      };

      if (shouldResolve) {
        updateData.status = 'RESOLVED';
        // Calculate total price
        updateData.service_price = (ticketToResolveInvertor.battery_price || 0) + priceNumber;
        const batteryNotes = ticketToResolveInvertor.battery_rechargeable !== null
          ? `Battery: ${ticketToResolveInvertor.battery_rechargeable ? 'Rechargeable' : 'Not rechargeable'}`
          : '';
        updateData.resolution_notes = `${batteryNotes}${batteryNotes ? ' | ' : ''}Invertor: ${invertorResolved === 'yes' ? 'Resolved' : 'Not resolved'}${invertorIssueDescription ? ` - ${invertorIssueDescription}` : ''}`;
      }

      const { error } = await supabase
        .from('service_tickets')
        .update(updateData)
        .eq('id', ticketToResolveInvertor.id);

      if (error) throw error;

      await supabase.from('service_logs').insert({
        ticket_id: ticketToResolveInvertor.id,
        action: `Invertor resolved - Resolved: ${invertorResolved}, Price: Rs. ${priceNumber}`,
        notes: invertorIssueDescription || null,
        user_id: user.id,
      });

      toast({ title: 'Invertor resolution saved' });

      setTicketToResolveInvertor(null);
      setInvertorResolved('');
      setInvertorIssueDescription('');
      setInvertorPrice('');
      setSelectedTicket(null);
      fetchTickets();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      toast({ title: 'Error saving resolution', description: errorMessage, variant: 'destructive' });
    }
  };

  const handleCloseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketToClose || !user || !paymentMethod) return;

    try {
      const { error } = await supabase
        .from('service_tickets')
        .update({
          status: 'CLOSED',
          payment_method: paymentMethod,
        })
        .eq('id', ticketToClose.id);

      if (error) throw error;

      await supabase.from('service_logs').insert({
        ticket_id: ticketToClose.id,
        action: `Ticket closed (payment: ${paymentMethod})`,
        user_id: user.id,
      });

      // Get updated ticket with payment info for print
      const { data: updatedTicket } = await supabase
        .from('service_tickets')
        .select('*')
        .eq('id', ticketToClose.id)
        .single();

      toast({ title: 'Ticket closed' });

      // Show print dialog with closed ticket
      setShowClosedPrint(updatedTicket as ServiceTicket);

      setTicketToClose(null);
      setPaymentMethod('');
      setSelectedTicket(null);
      fetchTickets();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      toast({ title: 'Error closing ticket', description: errorMessage, variant: 'destructive' });
    }
  };

  const handleExportSingle = (ticket: ServiceTicket) => {
    const data = [formatTicketForExport(ticket, getProfileName(ticket.assigned_to))];
    downloadCSV(data, `ticket-${ticket.ticket_number || ticket.id}`);
  };

  const handleExportAll = () => {
    const data = filteredTickets.map(ticket =>
      formatTicketForExport(ticket, getProfileName(ticket.assigned_to))
    );
  downloadCSV(data, `service-tickets-${new Date().toISOString().split('T')[0]}`);
  };

  // Role-based access checks (must be before filteredTickets)
  const canCreateTicket = hasAnyRole(['admin', 'counter_staff']);
  const canAssignTicket = hasAnyRole(['admin', 'counter_staff']);
  const canDeleteTicket = hasRole('admin');
  const isAdmin = hasRole('admin');
  const isSpBattery = hasRole('sp_battery');
  const isSpInvertor = hasRole('sp_invertor');
  const isCounterStaff = hasRole('counter_staff');
  const isServiceAgent = hasRole('service_agent');
  const canCloseTicket = isCounterStaff || isAdmin;

  const filteredTickets = tickets.filter(ticket => {
    // First apply search filter
    const matchesSearch =
      ticket.customer_name.toLowerCase().includes(search.toLowerCase()) ||
      ticket.battery_model.toLowerCase().includes(search.toLowerCase()) ||
      (ticket.invertor_model && ticket.invertor_model.toLowerCase().includes(search.toLowerCase())) ||
      (ticket.ticket_number && ticket.ticket_number.toLowerCase().includes(search.toLowerCase()));

    if (!matchesSearch) return false;

    // Role-based filtering
    if (isAdmin || isCounterStaff || isServiceAgent) {
      // Admin, counter_staff, and service_agent see all tickets
      return true;
    }

    if (isSpBattery) {
      // sp_battery only sees tickets with battery component assigned to them AND that actually have a battery
      return ticket.assigned_to_battery === user?.id && ticket.battery_model !== '-' && ticket.battery_model !== null;
    }

    if (isSpInvertor) {
      // sp_invertor only sees tickets with invertor component assigned to them AND that actually have an invertor
      return ticket.assigned_to_invertor === user?.id && ticket.invertor_model !== null && ticket.invertor_model !== '';
    }

    return false;
  });

  const getProfileName = (userId: string | null) => {
    if (!userId) return 'Unassigned';
    const profile = profiles.find(p => p.user_id === userId);
    return profile?.name || 'Unknown';
  };

  // Filter profiles for assignment
  const spBatteryProfiles = profiles.filter(p => spBatteryAgents.includes(p.user_id));
  const spInvertorProfiles = profiles.filter(p => spInvertorAgents.includes(p.user_id));

  // Check if current user can resolve battery part
  const canResolveBattery = (ticket: ServiceTicket) => {
    if (isAdmin || isCounterStaff) return true;
    if (isSpBattery && ticket.assigned_to_battery === user?.id) return true;
    return false;
  };

  // Check if current user can resolve invertor part
  const canResolveInvertor = (ticket: ServiceTicket) => {
    if (!ticket.invertor_model) return false;
    if (isAdmin || isCounterStaff) return true;
    if (isSpInvertor && ticket.assigned_to_invertor === user?.id) return true;
    return false;
  };

  // Calculate total price for display
  const getTotalPrice = (ticket: ServiceTicket) => {
    return (ticket.battery_price || 0) + (ticket.invertor_price || 0);
  };

  return (
    <AppLayout>
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as 'in-shop' | 'home-service')}
        className="w-full space-y-6"
      >
        <TabsList className={`grid w-full max-w-md ${isServiceTechnician ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {!isServiceTechnician && <TabsTrigger value="in-shop">In-Shop Service</TabsTrigger>}
          <TabsTrigger value="home-service">Home Service</TabsTrigger>
        </TabsList>

        {/* IN-SHOP SERVICE TAB */}
        {!isServiceTechnician && (
          <TabsContent value="in-shop" className="space-y-6 relative min-h-[80vh] pb-24">
        {/* Floating New Ticket Button */}
        {canCreateTicket && (
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button size="lg" className="fixed bottom-8 right-8 z-50 rounded-full h-14 px-6 shadow-[0_8px_32px_rgba(79,140,255,0.35)] bg-gradient-to-r from-[#4F8CFF] to-blue-600 hover:scale-105 hover:shadow-[0_8px_32px_rgba(79,140,255,0.5)] transition-all duration-300">
                <Plus className="h-5 w-5 mr-2" />
                <span className="font-semibold tracking-wide">New Ticket</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="glass-card bg-slate-50 dark:bg-[#0B0F19]/95 border-slate-200 dark:border-white/10 text-slate-900 dark:text-white">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold">Create Service Ticket</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateTicket} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="customer_name" className="text-slate-600 dark:text-slate-500 dark:text-slate-400">Customer Name</Label>
                    <Input
                      id="customer_name"
                      value={formData.customer_name}
                      onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                      required
                      className="bg-white dark:bg-[#111827] border-slate-200 dark:border-white/5 focus-visible:ring-[#4F8CFF]/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="customer_phone" className="text-slate-600 dark:text-slate-500 dark:text-slate-400">Phone Number</Label>
                    <Input
                      id="customer_phone"
                      type="tel"
                      value={formData.customer_phone}
                      onChange={(e) => {
                        const value = e.target.value.replace(/\D/g, '');
                        setFormData({ ...formData, customer_phone: value });
                      }}
                      placeholder="Numbers only"
                      required
                      className="bg-white dark:bg-[#111827] border-slate-200 dark:border-white/5 focus-visible:ring-[#4F8CFF]/50"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="battery_model" className="text-slate-600 dark:text-slate-500 dark:text-slate-400">Battery Model (Optional)</Label>
                    <Input
                      id="battery_model"
                      value={formData.battery_model}
                      onChange={(e) => setFormData({ ...formData, battery_model: e.target.value })}
                      placeholder="Leave empty for invertor-only"
                      className="bg-white dark:bg-[#111827] border-slate-200 dark:border-white/5 focus-visible:ring-[#4F8CFF]/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="invertor_model" className="text-slate-600 dark:text-slate-500 dark:text-slate-400">Invertor Model (Optional)</Label>
                    <Input
                      id="invertor_model"
                      value={formData.invertor_model}
                      onChange={(e) => setFormData({ ...formData, invertor_model: e.target.value })}
                      placeholder="Leave empty for battery-only"
                      className="bg-white dark:bg-[#111827] border-slate-200 dark:border-white/5 focus-visible:ring-[#4F8CFF]/50"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="issue_description" className="text-slate-600 dark:text-slate-500 dark:text-slate-400">Issue Description</Label>
                  <Textarea
                    id="issue_description"
                    value={formData.issue_description}
                    onChange={(e) => setFormData({ ...formData, issue_description: e.target.value })}
                    required
                    rows={4}
                    className="bg-white dark:bg-[#111827] border-slate-200 dark:border-white/5 focus-visible:ring-[#4F8CFF]/50"
                  />
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-500 italic">
                  {formData.battery_model && formData.invertor_model
                    ? 'Ticket will be assigned to both Battery and Invertor specialists.'
                    : formData.battery_model
                      ? 'Ticket will be assigned to Battery specialist only.'
                      : formData.invertor_model
                        ? 'Ticket will be assigned to Invertor specialist only.'
                        : 'Please provide at least one model.'}
                </p>
                <Button type="submit" className="w-full bg-[#4F8CFF] hover:bg-blue-600 text-slate-900 dark:text-white font-bold">Create Ticket</Button>
              </form>
            </DialogContent>
          </Dialog>
        )}

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white drop-shadow-md">Service Tickets</h1>
            <p className="text-slate-600 dark:text-slate-500 dark:text-slate-400 mt-1">Manage and track customer service requests</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExportAll} disabled={filteredTickets.length === 0} className="rounded-xl border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-[#1B2438]/50 hover:bg-slate-100 dark:bg-[#1B2438] text-slate-900 dark:text-white">
              <Download className="h-4 w-4 mr-2 text-slate-600 dark:text-slate-500 dark:text-slate-400" />
              Export
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-center justify-between bg-white dark:bg-[#111827]/40 p-2 rounded-2xl border border-slate-200 dark:border-white/5 backdrop-blur-sm">
          {/* Animated Tabs */}
          <div className="flex bg-slate-50 dark:bg-[#0B0F19] p-1 rounded-xl border border-slate-200 dark:border-white/5 overflow-x-auto no-scrollbar">
            {['all', 'OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].map(status => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`flex-shrink-0 px-4 py-2 rounded-lg text-[13px] font-bold tracking-wide uppercase transition-all duration-300 ${statusFilter === status ? 'bg-slate-100 dark:bg-[#1B2438] text-[#4F8CFF] shadow-sm border-b-2 border-[#4F8CFF]' : 'text-slate-600 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-white/5 border-b-2 border-transparent'}`}
              >
                {status === 'all' ? 'All Tickets' : status.replace('_', ' ')}
              </button>
            ))}
          </div>

          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600 dark:text-slate-500 dark:text-slate-400" />
            <Input
              placeholder="Search by customer, ticket ID, model..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 rounded-xl bg-slate-50 dark:bg-[#0B0F19] border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-200 placeholder:text-slate-600 dark:text-slate-500 focus-visible:ring-[#4F8CFF]/50 h-11"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-pulse flex flex-col items-center gap-4">
              <div className="h-10 w-10 border-4 border-[#4F8CFF]/30 border-t-[#4F8CFF] rounded-full animate-spin" />
              <span className="text-slate-600 dark:text-slate-500 dark:text-slate-400 font-medium tracking-wide">Loading tickets...</span>
            </div>
          </div>
        ) : filteredTickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center glass-card rounded-3xl border border-slate-200 dark:border-white/5 bg-white dark:bg-[#111827]/50">
            <Wrench className="h-12 w-12 text-slate-600 mb-4" />
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">No tickets found</h3>
            <p className="text-slate-600 dark:text-slate-500 dark:text-slate-400 max-w-sm">There are no service tickets matching your criteria right now.</p>
          </div>
        ) : (
          <div className="grid gap-4 animate-in slide-in-from-bottom-4 duration-500">
            <style>{`
              @keyframes slideInUp {
                from { opacity: 0; transform: translateY(10px); }
                to { opacity: 1; transform: translateY(0); }
              }
            `}</style>
            {filteredTickets.map((ticket, index) => (
              <div
                key={ticket.id}
                className="group relative cursor-pointer rounded-2xl bg-white dark:bg-[#111827]/80 backdrop-blur-xl border border-slate-200 dark:border-white/5 p-5 transition-all duration-300 hover:-translate-y-1 hover:bg-slate-50 dark:bg-[#151C2F] hover:border-[#4F8CFF]/20 hover:shadow-[0_8px_32px_rgba(0,0,0,0.3)] overflow-hidden"
                style={{ animation: `slideInUp 0.4s ease-out ${index * 0.05}s both` }}
                onClick={() => setSelectedTicket(ticket)}
              >
                {/* Glow effect on hover */}
                <div className="absolute inset-x-0 -bottom-px h-px bg-gradient-to-r from-transparent via-[#4F8CFF]/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between relative z-10">
                  <div className="flex-1 flex items-start gap-4">
                    <div className="hidden sm:flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-200 dark:border-white/5 shadow-inner group-hover:border-[#4F8CFF]/30 transition-colors">
                      <Wrench className="h-5 w-5 text-slate-600 dark:text-slate-500 group-hover:text-[#4F8CFF] transition-colors" />
                    </div>
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        {ticket.ticket_number && (
                          <span className="font-mono text-[10px] tracking-widest text-[#4F8CFF] bg-[#4F8CFF]/10 px-2 py-0.5 rounded border border-[#4F8CFF]/20">
                            {ticket.ticket_number}
                          </span>
                        )}
                        <h3 className="font-bold text-slate-900 dark:text-white tracking-wide text-[16px] group-hover:text-[#4F8CFF] transition-colors">{ticket.customer_name}</h3>
                        <Badge variant="outline" className={`px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-bold ${statusColors[ticket.status]}`}>
                          {ticket.status.replace('_', ' ')}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-slate-600 dark:text-slate-500 dark:text-slate-400">
                        <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-slate-600 dark:text-slate-500" /> {ticket.customer_phone}</span>
                        <span className="flex items-center gap-1.5 truncate max-w-[200px]"><Battery className="h-3.5 w-3.5 text-slate-600 dark:text-slate-500" /> {ticket.battery_model || 'N/A'}</span>
                        {ticket.invertor_model && (
                          <span className="flex items-center gap-1.5 truncate max-w-[200px]"><Zap className="h-3.5 w-3.5 text-slate-600 dark:text-slate-500" /> {ticket.invertor_model}</span>
                        )}
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-500 line-clamp-1 italic group-hover:text-slate-600 dark:text-slate-500 dark:text-slate-400 transition-colors">"{ticket.issue_description}"</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 sm:justify-end mt-2 sm:mt-0">
                    {/* Assigned tech avatars */}
                    <div className="flex -space-x-2">
                      {ticket.assigned_to_battery && (
                        <div className="h-8 w-8 rounded-full border-2 border-[#111827] bg-slate-100 dark:bg-[#1B2438] flex items-center justify-center text-slate-700 dark:text-slate-300 relative group/avatar" title={`Battery: ${getProfileName(ticket.assigned_to_battery)}`}>
                          <span className="text-[10px] font-bold">{getProfileName(ticket.assigned_to_battery).charAt(0)}</span>
                          <div className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-[#111827] bg-emerald-500" />
                        </div>
                      )}
                      {ticket.invertor_model && ticket.assigned_to_invertor && (
                        <div className="h-8 w-8 rounded-full border-2 border-[#111827] bg-slate-100 dark:bg-[#1B2438] flex items-center justify-center text-slate-700 dark:text-slate-300 relative group/avatar" title={`Invertor: ${getProfileName(ticket.assigned_to_invertor)}`}>
                          <span className="text-[10px] font-bold">{getProfileName(ticket.assigned_to_invertor).charAt(0)}</span>
                          <div className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-[#111827] bg-emerald-500" />
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-1 text-sm">
                      <span className="text-[11px] font-semibold tracking-wider text-slate-600 dark:text-slate-500 uppercase">
                        {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true })}
                      </span>
                      {ticket.status === 'RESOLVED' && (
                        <span className="font-bold text-emerald-400 tracking-wide drop-shadow-[0_0_8px_rgba(34,197,94,0.3)]">
                          Rs. {(ticket.battery_price || 0) + (ticket.invertor_price || 0)}
                        </span>
                      )}
                    </div>

                    <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 ml-2">
                      <ChevronRight className="h-5 w-5 text-slate-600 dark:text-slate-500 group-hover:text-[#4F8CFF] group-hover:scale-110 transition-transform" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Ticket Detail Dialog */}
        <Dialog open={!!selectedTicket} onOpenChange={() => setSelectedTicket(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                Ticket Details
                {selectedTicket?.ticket_number && (
                  <Badge variant="outline" className="font-mono">
                    {selectedTicket.ticket_number}
                  </Badge>
                )}
              </DialogTitle>
            </DialogHeader>
            {selectedTicket && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Customer</Label>
                    <p className="font-medium">{selectedTicket.customer_name}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Phone</Label>
                    <p className="font-medium">{selectedTicket.customer_phone}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Battery Model</Label>
                    <p className="font-medium">{selectedTicket.battery_model}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Invertor Model</Label>
                    <p className="font-medium">{selectedTicket.invertor_model || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Status</Label>
                    <Badge variant="outline" className={statusColors[selectedTicket.status]}>
                      {selectedTicket.status.replace('_', ' ')}
                    </Badge>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">SP Battery</Label>
                    <p className="font-medium">{getProfileName(selectedTicket.assigned_to_battery)}</p>
                  </div>
                  {selectedTicket.invertor_model && (
                    <div>
                      <Label className="text-muted-foreground">SP Invertor</Label>
                      <p className="font-medium">{getProfileName(selectedTicket.assigned_to_invertor)}</p>
                    </div>
                  )}
                </div>

                <div>
                  <Label className="text-muted-foreground">Issue Description</Label>
                  <p className="mt-1">{selectedTicket.issue_description}</p>
                </div>

                {/* Battery Resolution Details */}
                {selectedTicket.battery_resolved && (
                  <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                    <h4 className="font-semibold">Battery Resolution</h4>
                    <p>Rechargeable: {selectedTicket.battery_rechargeable ? 'Yes' : 'No'}</p>
                    <p>Price: Rs. {(selectedTicket.battery_price || 0).toFixed(2)}</p>
                  </div>
                )}

                {/* Invertor Resolution Details */}
                {selectedTicket.invertor_model && selectedTicket.invertor_resolved && (
                  <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                    <h4 className="font-semibold">Invertor Resolution</h4>
                    {selectedTicket.invertor_issue_description && (
                      <p>Issue: {selectedTicket.invertor_issue_description}</p>
                    )}
                    <p>Price: Rs. {(selectedTicket.invertor_price || 0).toFixed(2)}</p>
                  </div>
                )}

                {/* Total Price */}
                {(selectedTicket.battery_resolved || selectedTicket.invertor_resolved) && (
                  <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
                    <p className="font-semibold text-lg">
                      Total Service Price: Rs. {getTotalPrice(selectedTicket).toFixed(2)}
                    </p>
                  </div>
                )}

                <div className="flex flex-col gap-4 sm:flex-row sm:justify-between">
                  <div className="flex gap-2 flex-wrap">
                    <PrintTicket
                      ticket={selectedTicket}
                      profileName={getProfileName(selectedTicket.assigned_to_battery)}
                      invertorProfileName={getProfileName(selectedTicket.assigned_to_invertor)}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleExportSingle(selectedTicket)}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Export
                    </Button>
                    {canDeleteTicket && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setTicketToDelete(selectedTicket)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </Button>
                    )}
                  </div>

                  <div className="flex gap-2 flex-wrap">
                    {/* Assign SP Battery */}
                    {canAssignTicket && !selectedTicket.assigned_to_battery && selectedTicket.status === 'OPEN' && (
                      <Select onValueChange={(value) => handleAssignBattery(selectedTicket.id, value)}>
                        <SelectTrigger className="w-[180px]">
                          <SelectValue placeholder="Assign SP Battery..." />
                        </SelectTrigger>
                        <SelectContent>
                          {spBatteryProfiles.map((profile) => (
                            <SelectItem key={profile.id} value={profile.user_id}>
                              {profile.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}

                    {/* Assign SP Invertor */}
                    {canAssignTicket && selectedTicket.invertor_model && !selectedTicket.assigned_to_invertor && (
                      <Select onValueChange={(value) => handleAssignInvertor(selectedTicket.id, value)}>
                        <SelectTrigger className="w-[180px]">
                          <SelectValue placeholder="Assign SP Invertor..." />
                        </SelectTrigger>
                        <SelectContent>
                          {spInvertorProfiles.map((profile) => (
                            <SelectItem key={profile.id} value={profile.user_id}>
                              {profile.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}

                    {/* Resolve Battery */}
                    {canResolveBattery(selectedTicket) &&
                      selectedTicket.status === 'IN_PROGRESS' &&
                      !selectedTicket.battery_resolved && (
                        <Button
                          variant="outline"
                          onClick={() => {
                            const ticket = selectedTicket;
                            setSelectedTicket(null);
                            // Small delay to allow first dialog to close and focus to reset
                            setTimeout(() => {
                              setTicketToResolveBattery(ticket);
                              setBatteryRechargeable('');
                              setBatteryPrice('');
                            }, 100);
                          }}
                        >
                          Resolve Battery
                        </Button>
                      )}

                    {/* Resolve Invertor */}
                    {canResolveInvertor(selectedTicket) &&
                      selectedTicket.status === 'IN_PROGRESS' &&
                      !selectedTicket.invertor_resolved && (
                        <Button
                          variant="outline"
                          onClick={() => {
                            const ticket = selectedTicket;
                            setSelectedTicket(null);
                            // Small delay to allow first dialog to close and focus to reset
                            setTimeout(() => {
                              setTicketToResolveInvertor(ticket);
                              setInvertorResolved('');
                              setInvertorIssueDescription('');
                              setInvertorPrice('');
                            }, 100);
                          }}
                        >
                          Resolve Invertor
                        </Button>
                      )}

                    {/* Close Ticket */}
                    {canCloseTicket && selectedTicket.status === 'RESOLVED' && (
                      <Button
                        onClick={() => {
                          setSelectedTicket(null);
                          setTicketToClose(selectedTicket);
                          setPaymentMethod('');
                        }}
                      >
                        Close Ticket
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Battery Resolution Dialog */}
        <Dialog open={!!ticketToResolveBattery} onOpenChange={() => setTicketToResolveBattery(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Battery Resolution</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleBatteryResolveSubmit} className="space-y-4">
              <div className="space-y-3">
                <Label>Battery Rechargeable?</Label>
                <RadioGroup
                  value={batteryRechargeable}
                  onValueChange={(val) => setBatteryRechargeable(val as 'yes' | 'no')}
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="yes" id="rechargeable-yes" />
                    <Label htmlFor="rechargeable-yes">Yes</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="no" id="rechargeable-no" />
                    <Label htmlFor="rechargeable-no">No</Label>
                  </div>
                </RadioGroup>
              </div>
              <div className="space-y-2">
                <Label htmlFor="battery_price">Price (Rs.)</Label>
                <Input
                  id="battery_price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={batteryPrice}
                  onChange={(e) => setBatteryPrice(e.target.value)}
                  onWheel={(e) => e.currentTarget.blur()}
                  placeholder={batteryRechargeable === 'no' ? 'Can be 0' : 'Enter price'}
                  autoComplete="off"
                  required
                />
                {batteryRechargeable === 'no' && (
                  <p className="text-sm text-muted-foreground">Price can be 0 if battery is not rechargeable</p>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setTicketToResolveBattery(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!batteryRechargeable}>
                  Save Battery Resolution
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Invertor Resolution Dialog */}
        <Dialog open={!!ticketToResolveInvertor} onOpenChange={() => setTicketToResolveInvertor(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invertor Resolution</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleInvertorResolveSubmit} className="space-y-4">
              <div className="space-y-3">
                <Label>Resolved?</Label>
                <RadioGroup
                  value={invertorResolved}
                  onValueChange={(val) => setInvertorResolved(val as 'yes' | 'no')}
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="yes" id="invertor-yes" />
                    <Label htmlFor="invertor-yes">Yes</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="no" id="invertor-no" />
                    <Label htmlFor="invertor-no">No</Label>
                  </div>
                </RadioGroup>
              </div>
              <div className="space-y-2">
                <Label htmlFor="invertor_issue">Issue / Reason Description (Optional)</Label>
                <Textarea
                  id="invertor_issue"
                  value={invertorIssueDescription}
                  onChange={(e) => setInvertorIssueDescription(e.target.value)}
                  rows={3}
                  placeholder="Describe the issue or reason..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invertor_price">Price (Rs.)</Label>
                <Input
                  id="invertor_price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={invertorPrice}
                  onChange={(e) => setInvertorPrice(e.target.value)}
                  onWheel={(e) => e.currentTarget.blur()}
                  placeholder={invertorResolved === 'no' ? 'Can be 0' : 'Enter price'}
                  autoComplete="off"
                  required
                />
                {invertorResolved === 'no' && (
                  <p className="text-sm text-muted-foreground">Price can be 0 if issue could not be resolved</p>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setTicketToResolveInvertor(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!invertorResolved}>
                  Save Invertor Resolution
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Close Ticket Dialog */}
        <Dialog open={!!ticketToClose} onOpenChange={() => setTicketToClose(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Close Ticket</DialogTitle>
            </DialogHeader>
            {ticketToClose && (
              <form onSubmit={handleCloseSubmit} className="space-y-4">
                <div className="p-4 rounded-lg bg-muted/50">
                  <p className="text-lg font-semibold">Total Amount: Rs. {getTotalPrice(ticketToClose).toFixed(2)}</p>
                  {ticketToClose.battery_price !== null && (
                    <p className="text-sm text-muted-foreground">Battery: Rs. {ticketToClose.battery_price.toFixed(2)}</p>
                  )}
                  {ticketToClose.invertor_price !== null && (
                    <p className="text-sm text-muted-foreground">Invertor: Rs. {ticketToClose.invertor_price.toFixed(2)}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Payment Method</Label>
                  <Select
                    value={paymentMethod}
                    onValueChange={(value) =>
                      setPaymentMethod(value as 'CASH' | 'CARD' | 'UPI')
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select payment method" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CASH">Cash</SelectItem>
                      <SelectItem value="CARD">Card</SelectItem>
                      <SelectItem value="UPI">UPI</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end gap-2">
                  <PrintTicket
                    ticket={ticketToClose}
                    profileName={getProfileName(ticketToClose.assigned_to_battery)}
                    invertorProfileName={getProfileName(ticketToClose.assigned_to_invertor)}
                  />
                  <Button type="button" variant="outline" onClick={() => setTicketToClose(null)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={!paymentMethod}>
                    Confirm & Close
                  </Button>
                </div>
              </form>
            )}
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={!!ticketToDelete} onOpenChange={() => setTicketToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Ticket?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete ticket {ticketToDelete?.ticket_number} for {ticketToDelete?.customer_name}.
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteTicket} className="bg-destructive text-destructive-foreground">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Print After Close Dialog */}
        <Dialog open={!!showClosedPrint} onOpenChange={() => setShowClosedPrint(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Ticket Closed Successfully</DialogTitle>
            </DialogHeader>
            {showClosedPrint && (
              <div className="space-y-4">
                <p className="text-muted-foreground">
                  Ticket <strong>{showClosedPrint.ticket_number}</strong> has been closed with payment received.
                  Would you like to print the final ticket?
                </p>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowClosedPrint(null)}>
                    Close
                  </Button>
                  <PrintTicket
                    ticket={showClosedPrint}
                    profileName={getProfileName(showClosedPrint.assigned_to_battery)}
                    invertorProfileName={getProfileName(showClosedPrint.assigned_to_invertor)}
                  />
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Print After Create Dialog */}
        <Dialog open={!!showNewTicketPrint} onOpenChange={() => setShowNewTicketPrint(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Ticket Created Successfully</DialogTitle>
            </DialogHeader>
            {showNewTicketPrint && (
              <div className="space-y-4">
                <p className="text-muted-foreground">
                  Ticket <strong>{showNewTicketPrint.ticket_number}</strong> has been created.
                  Would you like to print the ticket?
                </p>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowNewTicketPrint(null)}>
                    Close
                  </Button>
                  <PrintTicket
                    ticket={showNewTicketPrint}
                    profileName={getProfileName(showNewTicketPrint.assigned_to_battery)}
                    invertorProfileName={getProfileName(showNewTicketPrint.assigned_to_invertor)}
                  />
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
        </TabsContent>
        )}

        {/* HOME SERVICE TAB */}
        <TabsContent value="home-service" className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold">Home Service Requests</h2>
              <p className="text-sm text-muted-foreground">Manage home and office battery/inverter services</p>
            </div>
            {(hasRole('counter_staff') || hasRole('admin')) && (
              <HomeServiceForm onRequestCreated={() => setHomeServiceRefreshTrigger(prev => prev + 1)} />
            )}
          </div>

          {hasRole('service_technician') ? (
            <HomeServiceTechnicianView
              homeSearch={homeSearch}
              onRefresh={() => setHomeServiceRefreshTrigger((prev) => prev + 1)}
              externalRefreshTrigger={homeServiceRefreshTrigger}
            />
          ) : hasRole('admin') ? (
            <HomeServiceAdminView
              homeSearch={homeSearch}
              onRefresh={() => setHomeServiceRefreshTrigger((prev) => prev + 1)}
              externalRefreshTrigger={homeServiceRefreshTrigger}
            />
          ) : hasRole('counter_staff') ? (
            <HomeServiceCounterStaffView
              homeSearch={homeSearch}
              externalRefreshTrigger={homeServiceRefreshTrigger}
            />
          ) : (
            <div className="text-sm text-muted-foreground">You do not have access to Home Service.</div>
          )}
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}
