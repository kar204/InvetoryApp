import { useEffect, useState } from 'react';
import { Plus, Search, Filter, Download, Trash2, Phone, Battery, Zap, Wrench, ChevronRight, X, CheckCircle } from 'lucide-react';
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
import { ServiceTicket, ServiceStatus, Profile, UserRole, HomeServiceRequest, ServiceTicketItem } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { usePollingRefresh } from '@/hooks/usePollingRefresh';
import { formatDistanceToNow } from 'date-fns';
import { PrintTicket } from '@/components/PrintTicket';
import { downloadCSV, formatTicketForExport } from '@/utils/exportUtils';
import { HomeServiceForm } from '@/components/services/HomeServiceForm';
import { HomeServiceList } from '@/components/services/HomeServiceList';
import { HomeServiceResolutionForm } from '@/components/services/HomeServiceResolutionForm';
import { ModelSearchInput } from '@/components/ui/ModelSearchInput';
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

type ServiceTicketItemInsert = Pick<ServiceTicketItem, 'ticket_id' | 'item_type' | 'model' | 'issue_description' | 'product_id'>;

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
  const [batteryItemPrices, setBatteryItemPrices] = useState<Record<string, string>>({});
  const [batteryItemWarranty, setBatteryItemWarranty] = useState<Record<string, 'yes' | 'no'>>({});
  const [inverterItemPrices, setInverterItemPrices] = useState<Record<string, string>>({});
  const [inverterItemResolved, setInverterItemResolved] = useState<Record<string, 'yes' | 'no'>>({});

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

  // Multiple items state
  const [ticketItems, setTicketItems] = useState<Array<{
    item_type: 'BATTERY' | 'INVERTER';
    model: string;
    issue_description: string;
    quantity: number;
  }>>([]);

  const [products, setProducts] = useState<Array<{ id: string; name: string; model: string; category: string }>>([]);

  useEffect(() => {
    const fetchProducts = async () => {
      const { data } = await supabase.from('products').select('*');
      setProducts(data || []);
    };
    fetchProducts();
  }, []);

  const addItem = (type: 'BATTERY' | 'INVERTER') => {
    setTicketItems([...ticketItems, { 
      item_type: type, 
      model: '', 
      issue_description: '', 
      quantity: 1,
    }]);
  };

  const removeItem = (index: number) => {
    setTicketItems(ticketItems.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: string, value: string | number | boolean) => {
    const updated = [...ticketItems];
    updated[index] = { ...updated[index], [field]: value };
    setTicketItems(updated);
  };

  const [showNewTicketPrint, setShowNewTicketPrint] = useState<ServiceTicket | null>(null);
  const [showClosedPrint, setShowClosedPrint] = useState<ServiceTicket | null>(null);

  const getTicketItems = (ticket?: ServiceTicket | null): ServiceTicketItem[] => ticket?.items || [];
  const getBatteryItems = (ticket?: ServiceTicket | null) => getTicketItems(ticket).filter((item) => item.item_type === 'BATTERY');
  const getInverterItems = (ticket?: ServiceTicket | null) => getTicketItems(ticket).filter((item) => item.item_type === 'INVERTER');
  const getResolvedItemCount = (ticket?: ServiceTicket | null) => getTicketItems(ticket).filter((item) => item.resolved).length;
  const getTicketItemsTotal = (ticket?: ServiceTicket | null) => getTicketItems(ticket).reduce((sum, item) => sum + (item.price || 0), 0);
  const formatCurrency = (amount: number) => `Rs. ${amount.toLocaleString('en-IN')}`;

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

      const ticketsData = (data || []) as ServiceTicket[];
      const ticketIds = ticketsData.map((ticket) => ticket.id);
      const itemsMap: Record<string, ServiceTicketItem[]> = {};

      if (ticketIds.length > 0) {
        const { data: items } = await supabase
          .from('service_ticket_items')
          .select('*')
          .in('ticket_id', ticketIds);

        ((items || []) as ServiceTicketItem[]).forEach((item) => {
          if (!itemsMap[item.ticket_id]) itemsMap[item.ticket_id] = [];
          itemsMap[item.ticket_id].push(item);
        });
      }

      const ticketsWithItems = ticketsData.map((ticket) => ({
        ...ticket,
        items: itemsMap[ticket.id] || []
      }));

      setTickets(ticketsWithItems as ServiceTicket[]);
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

    // Use items if added, otherwise fall back to legacy fields
    const hasItems = ticketItems.length > 0;
    const hasBattery = hasItems ? ticketItems.some(i => i.item_type === 'BATTERY') : !!formData.battery_model;
    const hasInvertor = hasItems ? ticketItems.some(i => i.item_type === 'INVERTER') : !!formData.invertor_model;

    if (!hasBattery && !hasInvertor) {
      toast({
        title: 'Validation Error',
        description: 'Please add at least one Battery or Inverter item.',
        variant: 'destructive'
      });
      return;
    }

    // Validate items have models
    if (hasItems && ticketItems.some(i => !i.model)) {
      toast({
        title: 'Validation Error',
        description: 'All items must have a model selected.',
        variant: 'destructive'
      });
      return;
    }

    try {
      // Auto-assign to SP Battery if battery items exist
      let batteryAgentId = hasBattery && spBatteryAgents.length > 0 ? spBatteryAgents[0] : null;
      // Auto-assign to SP Invertor if inverter items exist
      let invertorAgentId = hasInvertor && spInvertorAgents.length > 0 ? spInvertorAgents[0] : null;

      // Fallback: If no SP agent is found and current user is an admin
      if (hasBattery && !batteryAgentId && isAdmin) {
        batteryAgentId = user.id;
      }
      if (hasInvertor && !invertorAgentId && isAdmin) {
        invertorAgentId = user.id;
      }

      const status = (batteryAgentId || invertorAgentId) ? 'IN_PROGRESS' : 'OPEN';

      // Get first battery/inverter for backward compatibility
      const firstBattery = hasItems ? ticketItems.find(i => i.item_type === 'BATTERY') : null;
      const firstInverter = hasItems ? ticketItems.find(i => i.item_type === 'INVERTER') : null;

      const { data: ticket, error } = await supabase.from('service_tickets').insert({
        customer_name: formData.customer_name,
        customer_phone: formData.customer_phone,
        battery_model: firstBattery?.model || formData.battery_model || '-',
        invertor_model: firstInverter?.model || formData.invertor_model || null,
        issue_description: firstBattery?.issue_description || firstInverter?.issue_description || formData.issue_description,
        created_by: user.id,
        assigned_to_battery: batteryAgentId,
        assigned_to_invertor: invertorAgentId,
        assigned_to: batteryAgentId || invertorAgentId,
        status: status,
        battery_resolved: hasBattery ? false : null,
        invertor_resolved: hasInvertor ? false : null,
      }).select().single();

      if (error) throw error;

      // Insert items into service_ticket_items
      if (hasItems && ticket) {
        // Expand items by quantity
        const itemsToInsert: ServiceTicketItemInsert[] = [];
        ticketItems.forEach(item => {
          const qty = Math.max(1, Number(item.quantity) || 1);
          for (let i = 0; i < qty; i++) {
            itemsToInsert.push({
              ticket_id: ticket.id,
              item_type: item.item_type,
              model: item.model,
              issue_description: item.issue_description || null,
              product_id: null,
            });
          }
        });

        if (itemsToInsert.length > 0) {
          const { error: itemsError } = await supabase
            .from('service_ticket_items')
            .insert(itemsToInsert);

          if (itemsError) {
            console.error('Error inserting items:', itemsError);
            toast({ title: 'Warning', description: 'Ticket created but items could not be saved', variant: 'destructive' });
          }
        }
      }

      if ((hasBattery && !batteryAgentId) || (hasInvertor && !invertorAgentId)) {
        toast({
          title: 'Ticket created (Partial assignment)',
          description: 'One or more parts could not be auto-assigned.',
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
      setTicketItems([]);

      setShowNewTicketPrint(ticket as ServiceTicket);
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

  // Handle Battery Resolution - individual per item
  const handleBatteryResolveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketToResolveBattery || !user) return;

    const batteryItems = getBatteryItems(ticketToResolveBattery);
    if (batteryItems.length === 0) {
      toast({ title: 'No batteries to resolve', variant: 'destructive' });
      return;
    }

    // Validate: each item must have warranty and price (if not warranty)
    const hasAllWarranty = batteryItems.every((item) => batteryItemWarranty[item.id]);
    if (!hasAllWarranty) {
      toast({ title: 'Please select warranty status for all batteries', variant: 'destructive' });
      return;
    }

    const hasValidPrices = batteryItems.every((item) => {
      const isWarranty = batteryItemWarranty[item.id] === 'yes';
      if (isWarranty) return true; // No price needed for warranty
      const price = batteryItemPrices[item.id];
      return price && !isNaN(Number(price)) && Number(price) >= 0;
    });
    if (!hasValidPrices) {
      toast({ title: 'Please enter valid price for all non-warranty batteries', variant: 'destructive' });
      return;
    }

    try {
      // Update each battery item individually
      for (const item of batteryItems) {
        const isWarranty = batteryItemWarranty[item.id] === 'yes';
        const price = isWarranty ? 0 : Number(batteryItemPrices[item.id] || 0);

        await supabase
          .from('service_ticket_items')
          .update({
            resolved: true,
            price: price,
            within_warranty: isWarranty,
            resolved_by: user.id,
            resolved_at: new Date().toISOString(),
          })
          .eq('id', item.id);
      }

      // Calculate total battery price from items
      const totalBatteryPrice = batteryItems.reduce((sum, item) => {
        const isWarranty = batteryItemWarranty[item.id] === 'yes';
        return sum + (isWarranty ? 0 : Number(batteryItemPrices[item.id] || 0));
      }, 0);

      // Check if all items (including inverters) are resolved
      const allItems = await supabase
        .from('service_ticket_items')
        .select('resolved')
        .eq('ticket_id', ticketToResolveBattery.id);
      
      const allResolved = ((allItems.data || []) as Array<Pick<ServiceTicketItem, 'resolved'>>).every((item) => item.resolved);

      const updateData: Record<string, unknown> = {
        battery_resolved: true,
        battery_price: totalBatteryPrice,
        battery_resolved_by: user.id,
        battery_resolved_at: new Date().toISOString(),
        service_price: totalBatteryPrice + (ticketToResolveBattery.invertor_price || 0),
      };

      if (allResolved) {
        updateData.status = 'RESOLVED';
      }

      await supabase
        .from('service_tickets')
        .update(updateData)
        .eq('id', ticketToResolveBattery.id);

      await supabase.from('service_logs').insert({
        ticket_id: ticketToResolveBattery.id,
        action: `Battery resolved (${batteryItems.length} items) - Total: ${formatCurrency(totalBatteryPrice)}`,
        user_id: user.id,
      });

      toast({ title: 'Battery resolution saved' });
      setTicketToResolveBattery(null);
      setBatteryItemPrices({});
      setBatteryItemWarranty({});
      setSelectedTicket(null);
      fetchTickets();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      toast({ title: 'Error saving resolution', description: errorMessage, variant: 'destructive' });
    }
  };

  // Handle Inverter Resolution - individual per item
  const handleInverterResolveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketToResolveInvertor || !user) return;

    const inverterItems = getInverterItems(ticketToResolveInvertor);
    if (inverterItems.length === 0) {
      toast({ title: 'No inverters to resolve', variant: 'destructive' });
      return;
    }

    // Validate: each item must have resolution status
    const hasAllResolution = inverterItems.every((item) => inverterItemResolved[item.id]);
    if (!hasAllResolution) {
      toast({ title: 'Please select resolution status for all inverters', variant: 'destructive' });
      return;
    }

    // Validate: if resolved = yes, must have price; if no, price can be 0
    const hasValidPrices = inverterItems.every((item) => {
      const isResolved = inverterItemResolved[item.id] === 'yes';
      if (!isResolved) return true; // Not resolved = no price needed
      const price = inverterItemPrices[item.id];
      return price && !isNaN(Number(price)) && Number(price) >= 0;
    });
    if (!hasValidPrices) {
      toast({ title: 'Please enter price for all resolved inverters', variant: 'destructive' });
      return;
    }

    try {
      // Update each inverter item individually
      for (const item of inverterItems) {
        const isResolved = inverterItemResolved[item.id] === 'yes';
        const price = isResolved ? Number(inverterItemPrices[item.id] || 0) : 0;

        await supabase
          .from('service_ticket_items')
          .update({
            resolved: isResolved,
            price: price,
            notes: invertorIssueDescription || null,
            resolved_by: user.id,
            resolved_at: new Date().toISOString(),
          })
          .eq('id', item.id);
      }

      // Calculate total inverter price from items
      const totalInverterPrice = inverterItems.reduce((sum, item) => {
        const isResolved = inverterItemResolved[item.id] === 'yes';
        return sum + (isResolved ? Number(inverterItemPrices[item.id] || 0) : 0);
      }, 0);

      // Check if all items are resolved
      const allItems = await supabase
        .from('service_ticket_items')
        .select('resolved')
        .eq('ticket_id', ticketToResolveInvertor.id);
      
      const allResolved = ((allItems.data || []) as Array<Pick<ServiceTicketItem, 'resolved'>>).every((item) => item.resolved);

      const updateData: Record<string, unknown> = {
        invertor_resolved: true,
        invertor_price: totalInverterPrice,
        invertor_issue_description: invertorIssueDescription || null,
        invertor_resolved_by: user.id,
        invertor_resolved_at: new Date().toISOString(),
        service_price: (ticketToResolveInvertor.battery_price || 0) + totalInverterPrice,
      };

      if (allResolved) {
        updateData.status = 'RESOLVED';
      }

      await supabase
        .from('service_tickets')
        .update(updateData)
        .eq('id', ticketToResolveInvertor.id);

      await supabase.from('service_logs').insert({
        ticket_id: ticketToResolveInvertor.id,
        action: `Inverter resolved (${inverterItems.length} items) - Total: ${formatCurrency(totalInverterPrice)}`,
        notes: invertorIssueDescription || null,
        user_id: user.id,
      });

      toast({ title: 'Inverter resolution saved' });
      setTicketToResolveInvertor(null);
      setInverterItemPrices({});
      setInverterItemResolved({});
      setInvertorIssueDescription('');
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
          <TabsContent value="in-shop" className="space-y-6 relative min-h-[80vh] pb-32 sm:pb-24">
        {/* Floating New Ticket Button */}
        {canCreateTicket && (
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button size="lg" className="fixed inset-x-4 bottom-4 z-50 h-12 justify-center rounded-full px-4 shadow-[0_8px_32px_rgba(79,140,255,0.35)] bg-gradient-to-r from-[#4F8CFF] to-blue-600 transition-all duration-300 hover:scale-[1.01] hover:shadow-[0_8px_32px_rgba(79,140,255,0.5)] sm:inset-x-auto sm:bottom-8 sm:right-8 sm:h-14 sm:px-6">
                <Plus className="h-5 w-5 mr-2" />
                <span className="font-semibold tracking-wide">New Ticket</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="glass-card bg-slate-50 dark:bg-[#0B0F19]/95 border-slate-200 dark:border-white/10 text-slate-900 dark:text-white sm:max-w-xl max-h-[85vh] overflow-y-auto">
              <DialogHeader className="sticky top-0 bg-slate-50 dark:bg-[#0B0F19]/95 pb-2 z-10">
                <DialogTitle className="text-lg sm:text-xl">Create Service Ticket</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateTicket} className="space-y-4 pb-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="customer_name" className="text-sm text-slate-600 dark:text-slate-400">Customer Name</Label>
                    <Input
                      id="customer_name"
                      value={formData.customer_name}
                      onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                      required
                      placeholder="Customer name"
                      className="h-10 bg-white dark:bg-[#111827] border-slate-200 dark:border-white/5"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="customer_phone" className="text-sm text-slate-600 dark:text-slate-400">Phone Number</Label>
                    <Input
                      id="customer_phone"
                      type="tel"
                      value={formData.customer_phone}
                      onChange={(e) => {
                        const value = e.target.value.replace(/\D/g, '');
                        setFormData({ ...formData, customer_phone: value });
                      }}
                      placeholder="Phone number"
                      required
                      className="h-10 bg-white dark:bg-[#111827] border-slate-200 dark:border-white/5"
                    />
                  </div>
                </div>
                {/* Multiple Items Section */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-sm text-slate-600 dark:text-slate-400">Service Items</Label>
                    <div className="flex gap-1.5">
                      <Button type="button" variant="outline" size="sm" onClick={() => addItem('BATTERY')} className="h-8 text-xs">
                        <Battery className="h-3 w-3 mr-1" /> Battery
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => addItem('INVERTER')} className="h-8 text-xs">
                        <Zap className="h-3 w-3 mr-1" /> Inverter
                      </Button>
                    </div>
                  </div>

                  {ticketItems.length > 0 ? (
                    <div className="space-y-3">
                      {ticketItems.map((item, index) => {
                        return (
                          <div key={index} className="p-3 sm:p-4 border rounded-lg bg-slate-50 dark:bg-slate-900/50 space-y-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge 
                                variant={item.item_type === 'BATTERY' ? 'default' : 'secondary'}
                                className={item.item_type === 'BATTERY' ? 'bg-blue-500' : 'bg-amber-500'}
                              >
                                {item.item_type === 'BATTERY' ? (
                                  <Battery className="h-3 w-3 mr-1" />
                                ) : (
                                  <Zap className="h-3 w-3 mr-1" />
                                )}
                                {item.item_type}
                              </Badge>
                              <span className="text-xs text-muted-foreground ml-auto">
                                Item {index + 1}
                              </span>
                              <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(index)} className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                            
                            <ModelSearchInput
                              value={item.model}
                              onChange={(value) => updateItem(index, 'model', value)}
                              products={products}
                              category={item.item_type === 'BATTERY' ? 'Battery' : 'Inverter'}
                              placeholder={`Search ${item.item_type.toLowerCase()} model...`}
                            />
                            
                            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                              <div>
                                <Label className="text-xs text-muted-foreground block mb-1">Qty</Label>
                                <Input
                                  type="number"
                                  min="1"
                                  value={item.quantity}
                                  onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 1)}
                                  className="text-center"
                                />
                              </div>
                              <div className="col-span-2 sm:col-span-3">
                                <Label className="text-xs text-muted-foreground block mb-1">Issue</Label>
                                <Input
                                  placeholder="Describe issue..."
                                  value={item.issue_description}
                                  onChange={(e) => updateItem(index, 'issue_description', e.target.value)}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-4 border-2 border-dashed rounded-lg text-center text-slate-500">
                      <p className="text-sm">Click "Add Battery" or "Add Inverter" to add items</p>
                    </div>
                  )}
                </div>

                {/* Legacy Fields (fallback) */}
                {ticketItems.length === 0 && (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="battery_model" className="text-sm text-slate-600 dark:text-slate-500 flex items-center gap-1.5">
                          <Battery className="h-3.5 w-3.5" /> Battery Model
                        </Label>
                        <Input
                          id="battery_model"
                          value={formData.battery_model}
                          onChange={(e) => setFormData({ ...formData, battery_model: e.target.value })}
                          placeholder="Type model or leave empty"
                          className="h-10"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="invertor_model" className="text-sm text-slate-600 dark:text-slate-500 flex items-center gap-1.5">
                          <Zap className="h-3.5 w-3.5" /> Inverter Model
                        </Label>
                        <Input
                          id="invertor_model"
                          value={formData.invertor_model}
                          onChange={(e) => setFormData({ ...formData, invertor_model: e.target.value })}
                          placeholder="Type model or leave empty"
                          className="h-10"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="issue_description" className="text-sm text-slate-600 dark:text-slate-500">Issue Description</Label>
                      <Textarea
                        id="issue_description"
                        value={formData.issue_description}
                        onChange={(e) => setFormData({ ...formData, issue_description: e.target.value })}
                        required
                        rows={3}
                        placeholder="Describe the issue..."
                        className="resize-none"
                      />
                    </div>
                  </>
                )}

                <p className="text-xs text-slate-600 dark:text-slate-500 italic">
                  {ticketItems.length > 0
                    ? `${ticketItems.length} item(s) added. Ticket will be auto-assigned.`
                    : formData.battery_model && formData.invertor_model
                      ? 'Will be assigned to Battery & Inverter specialists.'
                      : formData.battery_model
                        ? 'Will be assigned to Battery specialist only.'
                        : formData.invertor_model
                          ? 'Will be assigned to Inverter specialist only.'
                          : 'Add items or provide at least one model.'}
                </p>
                <Button type="submit" className="w-full bg-[#4F8CFF] hover:bg-blue-600 text-slate-900 dark:text-white font-bold h-11">
                  Create Ticket
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white drop-shadow-md">Service Tickets</h1>
            <p className="mt-1 text-slate-600 dark:text-slate-400">Manage and track customer service requests</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExportAll} disabled={filteredTickets.length === 0} className="rounded-xl border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-[#1B2438]/50 hover:bg-slate-100 dark:bg-[#1B2438] text-slate-900 dark:text-white">
              <Download className="mr-2 h-4 w-4 text-slate-600 dark:text-slate-400" />
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
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600 dark:text-slate-400" />
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
              <span className="font-medium tracking-wide text-slate-600 dark:text-slate-400">Loading tickets...</span>
            </div>
          </div>
        ) : filteredTickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center glass-card rounded-3xl border border-slate-200 dark:border-white/5 bg-white dark:bg-[#111827]/50">
            <Wrench className="h-12 w-12 text-slate-600 mb-4" />
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">No tickets found</h3>
            <p className="max-w-sm text-slate-600 dark:text-slate-400">There are no service tickets matching your criteria right now.</p>
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
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-slate-600 dark:text-slate-400">
                        <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-slate-600 dark:text-slate-500" /> {ticket.customer_phone}</span>
                        
                        {/* Show items if available, otherwise legacy fields */}
                        {ticket.items && ticket.items.length > 0 ? (
                          ticket.items.slice(0, 3).map((item, idx) => (
                            <span key={idx} className="flex items-center gap-1.5 truncate max-w-[200px]">
                              {item.item_type === 'BATTERY' ? <Battery className="h-3.5 w-3.5" /> : <Zap className="h-3.5 w-3.5" />}
                              {item.model}
                              {item.within_warranty && <Badge className="text-[9px] px-1 py-0 bg-emerald-500/10 text-emerald-500">W</Badge>}
                              {item.price && item.price > 0 && <span className="text-emerald-500 font-semibold">{formatCurrency(item.price)}</span>}
                              {item.resolved && <span className="text-emerald-500">Done</span>}
                            </span>
                          ))
                        ) : (
                          <>
                            <span className="flex items-center gap-1.5 truncate max-w-[200px]">
                              <Battery className="h-3.5 w-3.5 text-slate-600 dark:text-slate-500" /> 
                              {ticket.battery_model || 'N/A'}
                              {ticket.battery_price && ticket.battery_price > 0 && (
                                <span className="text-emerald-500 font-semibold">{formatCurrency(ticket.battery_price)}</span>
                              )}
                            </span>
                            {ticket.invertor_model && (
                              <span className="flex items-center gap-1.5 truncate max-w-[200px]">
                                <Zap className="h-3.5 w-3.5 text-slate-600 dark:text-slate-500" /> 
                                {ticket.invertor_model}
                                {ticket.invertor_price && ticket.invertor_price > 0 && (
                                  <span className="text-emerald-500 font-semibold">{formatCurrency(ticket.invertor_price)}</span>
                                )}
                              </span>
                            )}
                          </>
                        )}
                        {ticket.items && ticket.items.length > 3 && (
                          <span className="text-xs text-slate-500">+{ticket.items.length - 3} more</span>
                        )}
                      </div>
                      <p className="line-clamp-1 text-sm italic text-slate-600 transition-colors group-hover:text-slate-700 dark:text-slate-400 dark:group-hover:text-slate-300">"{ticket.issue_description}"</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 sm:justify-end mt-2 sm:mt-0">
                    {/* Item count badge */}
                    {ticket.items && ticket.items.length > 0 && (
                      <Badge variant="outline" className="text-xs">
                        {ticket.items.length} item{ticket.items.length > 1 ? 's' : ''}
                        {' · '}
                        {getResolvedItemCount(ticket)}/{ticket.items.length} done
                      </Badge>
                    )}

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
                      {/* Show total from items or legacy fields */}
                      {(() => {
                        const itemsTotal = getTicketItemsTotal(ticket);
                        const legacyTotal = (ticket.battery_price || 0) + (ticket.invertor_price || 0);
                        const total = itemsTotal > 0 ? itemsTotal : legacyTotal;
                        return total > 0 ? (
                          <span className="font-bold text-emerald-400 tracking-wide drop-shadow-[0_0_8px_rgba(34,197,94,0.3)]">
                            {formatCurrency(total)}
                          </span>
                        ) : null;
                      })()}
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

                <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                  {/* Document Actions - Print, Export, Delete */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <PrintTicket
                      ticket={selectedTicket}
                      profileName={getProfileName(selectedTicket.assigned_to_battery)}
                      invertorProfileName={getProfileName(selectedTicket.assigned_to_invertor)}
                    />
                    <Button
                      variant="outline"
                      className="w-full h-10"
                      onClick={() => handleExportSingle(selectedTicket)}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Export
                    </Button>
                    {canDeleteTicket && (
                      <Button
                        variant="destructive"
                        className="w-full h-10"
                        onClick={() => setTicketToDelete(selectedTicket)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </Button>
                    )}
                  </div>

                  {/* Assignment & Resolution Workflow */}
                  <div className="flex gap-2 flex-wrap">
                    {/* Assign SP Battery */}
                    {canAssignTicket && !selectedTicket.assigned_to_battery && selectedTicket.status === 'OPEN' && (
                      <Select onValueChange={(value) => handleAssignBattery(selectedTicket.id, value)}>
                        <SelectTrigger className="h-10 flex-1 sm:flex-none sm:w-[220px]">
                          <SelectValue placeholder="🔋 Assign Battery SP" />
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
                        <SelectTrigger className="h-10 flex-1 sm:flex-none sm:w-[220px]">
                          <SelectValue placeholder="⚡ Assign Invertor SP" />
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
                  </div>

                  {/* Resolve Items Section - Only when IN_PROGRESS */}
                  {selectedTicket.status === 'IN_PROGRESS' && (
                    <div className="p-4 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-100 dark:border-amber-900 space-y-3">
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Item Resolution Status:</p>
                      
                      {/* Show all items as a summary */}
                      {selectedTicket.items?.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {selectedTicket.items.map((item, idx) => (
                            <Badge 
                              key={idx} 
                              variant={item.item_type === 'BATTERY' ? 'default' : 'secondary'}
                              className={item.resolved ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : ''}
                            >
                              {item.item_type === 'BATTERY' ? <Battery className="h-3 w-3 mr-1" /> : <Zap className="h-3 w-3 mr-1" />}
                              {item.model} {item.resolved && '✓'}
                            </Badge>
                          ))}
                        </div>
                      )}

                      {/* Resolve Buttons */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {canResolveBattery(selectedTicket) && !selectedTicket.battery_resolved && (
                          <Button 
                            className="h-10 gap-2 bg-blue-600 hover:bg-blue-700"
                            onClick={() => {
                              const ticket = selectedTicket;
                              setSelectedTicket(null);
                              setTimeout(() => {
                                setTicketToResolveBattery(ticket);
                                setBatteryRechargeable('');
                                setBatteryPrice('');
                              }, 100);
                            }}
                          >
                            <Battery className="h-4 w-4" />
                            Resolve Batteries
                          </Button>
                        )}

                        {canResolveInvertor(selectedTicket) && !selectedTicket.invertor_resolved && (
                          <Button 
                            className="h-10 gap-2 bg-amber-600 hover:bg-amber-700"
                            onClick={() => {
                              const ticket = selectedTicket;
                              setSelectedTicket(null);
                              setTimeout(() => {
                                setTicketToResolveInvertor(ticket);
                                setInvertorResolved('');
                                setInvertorIssueDescription('');
                                setInvertorPrice('');
                              }, 100);
                            }}
                          >
                            <Zap className="h-4 w-4" />
                            Resolve Inverters
                          </Button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Close Ticket - Only when all resolved */}
                  {canCloseTicket && (() => {
                    const allResolved = selectedTicket.items?.length > 0
                      ? selectedTicket.items.every((item) => item.resolved)
                      : selectedTicket.battery_resolved !== false && selectedTicket.invertor_resolved !== false;
                    return selectedTicket.status !== 'CLOSED' && allResolved;
                  })() && (
                    <Button
                      className="w-full h-11 gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-base"
                      onClick={() => {
                        setSelectedTicket(null);
                        setTicketToClose(selectedTicket);
                        setPaymentMethod('');
                      }}
                    >
                      <CheckCircle className="h-5 w-5" />
                      Close Ticket & Collect Payment
                    </Button>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Battery Resolution Dialog */}
        <Dialog open={!!ticketToResolveBattery} onOpenChange={() => { setTicketToResolveBattery(null); }}>
          <DialogContent className="max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Battery className="h-5 w-5 text-blue-500" />
                Battery Resolution (Ticket-wise)
              </DialogTitle>
            </DialogHeader>
              <form onSubmit={handleBatteryResolveSubmit} className="space-y-5">

              {/* Show all battery items with individual warranty and price inputs */}
              {getBatteryItems(ticketToResolveBattery).length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold text-muted-foreground">Resolve each battery:</Label>
                    <Badge variant="outline" className="text-xs">
                      {getBatteryItems(ticketToResolveBattery).length} item(s)
                    </Badge>
                  </div>
                  <div className="max-h-[300px] overflow-y-auto space-y-3">
                    {getBatteryItems(ticketToResolveBattery).map((item, idx) => (
                      <div key={item.id || idx} className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-100 dark:border-blue-900 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <span className="font-semibold text-sm">{item.model}</span>
                            {item.issue_description && (
                              <p className="text-xs text-muted-foreground truncate">{item.issue_description}</p>
                            )}
                          </div>
                          {item.resolved && <Badge className="bg-emerald-500/10 text-emerald-500 text-xs">Done</Badge>}
                        </div>
                        
                        {/* Individual Warranty Selection */}
                        <div className="space-y-1">
                          <Label className="text-xs font-medium text-muted-foreground">Warranty Status</Label>
                          <RadioGroup
                            value={batteryItemWarranty[item.id] || ''}
                            onValueChange={(val) => setBatteryItemWarranty({ ...batteryItemWarranty, [item.id]: val })}
                            className="flex gap-4"
                          >
                            <div className="flex items-center space-x-1.5">
                              <RadioGroupItem value="yes" id={`warranty-${item.id}-yes`} className="h-3.5 w-3.5" />
                              <Label htmlFor={`warranty-${item.id}-yes`} className="text-xs cursor-pointer">Yes - Free</Label>
                            </div>
                            <div className="flex items-center space-x-1.5">
                              <RadioGroupItem value="no" id={`warranty-${item.id}-no`} className="h-3.5 w-3.5" />
                              <Label htmlFor={`warranty-${item.id}-no`} className="text-xs cursor-pointer">No - Charge</Label>
                            </div>
                          </RadioGroup>
                        </div>
                        
                        {/* Individual Price Input */}
                        <div className="space-y-1">
                          <Label className="text-xs font-medium text-muted-foreground">Price (Rs.)</Label>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="Enter price"
                              value={batteryItemPrices[item.id] || ''}
                              onChange={(e) => setBatteryItemPrices({ ...batteryItemPrices, [item.id]: e.target.value })}
                              disabled={batteryItemWarranty[item.id] === 'yes'}
                              className="h-9 text-sm"
                            />
                            {batteryItemWarranty[item.id] === 'yes' && (
                              <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-600">Free</Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Summary */}
              <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-lg">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Batteries:</span>
                  <span className="font-medium">{getBatteryItems(ticketToResolveBattery).length}</span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-muted-foreground">Total Price:</span>
                  <span className="font-semibold">
                    {formatCurrency(Object.values(batteryItemPrices).reduce((sum, price) => sum + (Number(price) || 0), 0))}
                  </span>
                </div>
              </div>

              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2 border-t">
                <Button type="button" variant="outline" onClick={() => { setTicketToResolveBattery(null); setBatteryItemPrices({}); setBatteryItemWarranty({}); }} className="w-full sm:w-auto h-10">
                  Cancel
                </Button>
                <Button type="submit" className="w-full sm:w-auto h-10 gap-2 bg-blue-600 hover:bg-blue-700">
                  <Battery className="h-4 w-4" />
                  Resolve {getBatteryItems(ticketToResolveBattery).length} Battery(s)
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Invertor Resolution Dialog */}
        <Dialog open={!!ticketToResolveInvertor} onOpenChange={() => setTicketToResolveInvertor(null)}>
          <DialogContent className="max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-amber-500" />
                Inverter Resolution (Ticket-wise)
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleInverterResolveSubmit} className="space-y-5">
              {/* Show all inverter items with individual resolution and price inputs */}
              {getInverterItems(ticketToResolveInvertor).length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold text-muted-foreground">Resolve each inverter:</Label>
                    <Badge variant="outline" className="text-xs">
                      {getInverterItems(ticketToResolveInvertor).length} item(s)
                    </Badge>
                  </div>
                  <div className="max-h-[300px] overflow-y-auto space-y-3">
                    {getInverterItems(ticketToResolveInvertor).map((item, idx) => (
                      <div key={item.id || idx} className="p-4 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-100 dark:border-amber-900 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <span className="font-semibold text-sm">{item.model}</span>
                            {item.issue_description && (
                              <p className="text-xs text-muted-foreground truncate">{item.issue_description}</p>
                            )}
                          </div>
                          {item.resolved && <Badge className="bg-emerald-500/10 text-emerald-500 text-xs">Done</Badge>}
                        </div>
                        
                        {/* Individual Resolution Status */}
                        <div className="space-y-1">
                          <Label className="text-xs font-medium text-muted-foreground">Issue Status</Label>
                          <RadioGroup
                            value={inverterItemResolved[item.id] || ''}
                            onValueChange={(val) => setInverterItemResolved({ ...inverterItemResolved, [item.id]: val })}
                            className="flex gap-4"
                          >
                            <div className="flex items-center space-x-1.5">
                              <RadioGroupItem value="yes" id={`inv-resolved-${item.id}-yes`} className="h-3.5 w-3.5" />
                              <Label htmlFor={`inv-resolved-${item.id}-yes`} className="text-xs cursor-pointer">Fixed</Label>
                            </div>
                            <div className="flex items-center space-x-1.5">
                              <RadioGroupItem value="no" id={`inv-resolved-${item.id}-no`} className="h-3.5 w-3.5" />
                              <Label htmlFor={`inv-resolved-${item.id}-no`} className="text-xs cursor-pointer">Not Fixed</Label>
                            </div>
                          </RadioGroup>
                        </div>
                        
                        {/* Individual Price Input */}
                        <div className="space-y-1">
                          <Label className="text-xs font-medium text-muted-foreground">Price (Rs.)</Label>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="Enter price"
                              value={inverterItemPrices[item.id] || ''}
                              onChange={(e) => setInverterItemPrices({ ...inverterItemPrices, [item.id]: e.target.value })}
                              disabled={inverterItemResolved[item.id] === 'no'}
                              className="h-9 text-sm"
                            />
                            {inverterItemResolved[item.id] === 'no' && (
                              <Badge variant="outline" className="text-xs bg-slate-100">No Charge</Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Summary */}
              <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-lg">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Inverters:</span>
                  <span className="font-medium">{getInverterItems(ticketToResolveInvertor).length}</span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-muted-foreground">Total Price:</span>
                  <span className="font-semibold">
                    {formatCurrency(Object.values(inverterItemPrices).reduce((sum, price) => sum + (Number(price) || 0), 0))}
                  </span>
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Notes (Optional)</Label>
                <Textarea
                  value={invertorIssueDescription}
                  onChange={(e) => setInvertorIssueDescription(e.target.value)}
                  rows={2}
                  placeholder="Additional notes..."
                  className="resize-none"
                />
              </div>

              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2 border-t">
                <Button type="button" variant="outline" onClick={() => { setTicketToResolveInvertor(null); setInverterItemPrices({}); setInverterItemResolved({}); }} className="w-full sm:w-auto h-10">
                  Cancel
                </Button>
                <Button type="submit" className="w-full sm:w-auto h-10 gap-2 bg-amber-600 hover:bg-amber-700">
                  <Zap className="h-4 w-4" />
                  Resolve {getInverterItems(ticketToResolveInvertor).length} Inverter(s)
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Close Ticket Dialog */}
        <Dialog open={!!ticketToClose} onOpenChange={() => setTicketToClose(null)}>
          <DialogContent className="max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Close Ticket</DialogTitle>
            </DialogHeader>
            {ticketToClose && (
              <form onSubmit={handleCloseSubmit} className="space-y-4">
                <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800">
                  <p className="text-lg font-semibold text-emerald-700 dark:text-emerald-400">Total Amount: Rs. {getTotalPrice(ticketToClose).toFixed(2)}</p>
                  {ticketToClose.battery_price !== null && ticketToClose.battery_price > 0 && (
                    <p className="text-sm text-muted-foreground">Battery: Rs. {ticketToClose.battery_price.toFixed(2)}</p>
                  )}
                  {ticketToClose.invertor_price !== null && ticketToClose.invertor_price > 0 && (
                    <p className="text-sm text-muted-foreground">Inverter: Rs. {ticketToClose.invertor_price.toFixed(2)}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Payment Method</Label>
                  <Select
                    value={paymentMethod}
                    onValueChange={(value) =>
                      setPaymentMethod(value as 'CASH' | 'CARD' | 'UPI')
                    }
                  >
                    <SelectTrigger className="w-full h-11">
                      <SelectValue placeholder="Select payment method" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CASH">Cash</SelectItem>
                      <SelectItem value="CARD">Card</SelectItem>
                      <SelectItem value="UPI">UPI</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setTicketToClose(null)} className="w-full sm:w-auto">
                    Cancel
                  </Button>
                  <Button type="submit" disabled={!paymentMethod} className="w-full sm:w-auto gap-2">
                    Confirm & Close
                  </Button>
                </div>
                <div className="flex justify-center pt-2">
                  <PrintTicket
                    ticket={ticketToClose}
                    profileName={getProfileName(ticketToClose.assigned_to_battery)}
                    invertorProfileName={getProfileName(ticketToClose.assigned_to_invertor)}
                  />
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
