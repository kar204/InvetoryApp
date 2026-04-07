import { useState, useEffect } from 'react';
import { Plus, Loader, Battery, Zap, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ModelSearchInput } from '@/components/ui/ModelSearchInput';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Product } from '@/types/database';

interface HomeServiceFormProps {
  onRequestCreated: () => void;
}

type HomeServiceItem = {
  item_type: 'BATTERY' | 'INVERTER';
  model: string;
  issue_description: string;
  quantity: number;
};

type HomeServiceFormData = {
  customer_name: string;
  customer_phone: string;
  address: string;
  issue_description: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
};

export function HomeServiceForm({ onRequestCreated }: HomeServiceFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [serviceItems, setServiceItems] = useState<HomeServiceItem[]>([]);

  const initialFormData: HomeServiceFormData = {
    customer_name: '',
    customer_phone: '',
    address: '',
    issue_description: '',
    priority: 'MEDIUM',
  };

  const [formData, setFormData] = useState<HomeServiceFormData>(initialFormData);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const { data } = await supabase.from('products').select('*');
      setProducts((data || []) as Product[]);
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  };

  const addItem = (type: 'BATTERY' | 'INVERTER') => {
    setServiceItems([...serviceItems, { 
      item_type: type, 
      model: '', 
      issue_description: '', 
      quantity: 1,
    }]);
  };

  const removeItem = (index: number) => {
    setServiceItems(serviceItems.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof HomeServiceItem, value: string | number) => {
    const updated = [...serviceItems];
    updated[index] = { ...updated[index], [field]: value };
    setServiceItems(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) return;

    if (!formData.customer_name || !formData.customer_phone || !formData.address || !formData.issue_description) {
      toast({ title: 'Validation Error', description: 'Please fill all required fields.', variant: 'destructive' });
      return;
    }

    if (serviceItems.length === 0) {
      toast({ title: 'Validation Error', description: 'Please add at least one battery or inverter.', variant: 'destructive' });
      return;
    }

    setLoading(true);

    try {
      // Get service technician
      let assignedTechnicianId: string | null = null;
      try {
        const { data: technicianData } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('role', 'service_technician')
          .limit(1);

        if (technicianData && technicianData.length > 0) {
          assignedTechnicianId = technicianData[0].user_id;
        }
      } catch {}

      // Create request
      const { data: requestData, error: requestError } = await supabase
        .from('home_service_requests')
        .insert({
          customer_name: formData.customer_name,
          customer_phone: formData.customer_phone,
          address: formData.address,
          issue_description: formData.issue_description,
          priority: formData.priority,
          created_by: user.id,
          assigned_to: assignedTechnicianId,
          assigned_at: assignedTechnicianId ? new Date().toISOString() : null,
          status: assignedTechnicianId ? 'IN_PROGRESS' : 'OPEN',
          // Legacy fields - populate from first items if any
          battery_model: serviceItems.find(i => i.item_type === 'BATTERY')?.model || null,
          inverter_model: serviceItems.find(i => i.item_type === 'INVERTER')?.model || null,
        })
        .select('id, request_number')
        .single();

      if (requestError) throw requestError;

      // Add items
      for (const item of serviceItems) {
        const qty = Math.max(1, item.quantity || 1);
        for (let i = 0; i < qty; i++) {
          await supabase.from('home_service_items').insert({
            request_id: requestData.id,
            item_type: item.item_type,
            model: item.model,
            issue_description: item.issue_description || null,
          });
        }
      }

      toast({
        title: 'Home Service Request Created',
        description: `Request #${requestData.request_number} created with ${serviceItems.length} item(s).`,
      });

      setFormData({ ...initialFormData });
      setServiceItems([]);
      setIsOpen(false);
      onRequestCreated();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      toast({ title: 'Error creating request', description: errorMessage, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600">
          <Plus className="w-4 h-4" />
          Create Home Service Request
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader className="sticky top-0 bg-white dark:bg-[#0B0F19] pb-2 z-10 border-b">
          <DialogTitle className="text-lg sm:text-xl">Create Home Service Request</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 pb-4">
          {/* Customer Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="customer_name" className="text-sm">Customer Name *</Label>
              <Input
                id="customer_name"
                value={formData.customer_name}
                onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                placeholder="Enter customer name"
                required
                className="h-10"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="customer_phone" className="text-sm">Phone Number *</Label>
              <Input
                id="customer_phone"
                value={formData.customer_phone}
                onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value.replace(/\D/g, '') })}
                placeholder="Enter phone number"
                type="tel"
                required
                className="h-10"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="address" className="text-sm">Address for Service *</Label>
            <Textarea
              id="address"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="Enter complete service address"
              rows={2}
              required
              className="resize-none"
            />
          </div>

          {/* Service Items */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Service Items</Label>
              <div className="flex gap-1.5">
                <Button type="button" variant="outline" size="sm" onClick={() => addItem('BATTERY')} className="h-8 text-xs">
                  <Battery className="h-3 w-3 mr-1" /> Battery
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => addItem('INVERTER')} className="h-8 text-xs">
                  <Zap className="h-3 w-3 mr-1" /> Inverter
                </Button>
              </div>
            </div>

            {serviceItems.length > 0 ? (
              <div className="space-y-3 max-h-[250px] overflow-y-auto">
                {serviceItems.map((item, index) => (
                  <div key={index} className="p-3 border rounded-lg bg-slate-50 dark:bg-slate-900/50 space-y-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge 
                        variant={item.item_type === 'BATTERY' ? 'default' : 'secondary'}
                        className={item.item_type === 'BATTERY' ? 'bg-blue-500' : 'bg-amber-500'}
                      >
                        {item.item_type === 'BATTERY' ? <Battery className="h-3 w-3 mr-1" /> : <Zap className="h-3 w-3 mr-1" />}
                        {item.item_type}
                      </Badge>
                      <span className="text-xs text-muted-foreground ml-auto">Item {index + 1}</span>
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(index)} className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 h-6 w-6 p-0">
                        <X className="h-3 w-3" />
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
                          className="h-8 text-center text-sm"
                        />
                      </div>
                      <div className="col-span-2 sm:col-span-3">
                        <Label className="text-xs text-muted-foreground block mb-1">Issue</Label>
                        <Input
                          placeholder="Describe issue..."
                          value={item.issue_description}
                          onChange={(e) => updateItem(index, 'issue_description', e.target.value)}
                          className="h-8 text-sm"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground border-2 border-dashed rounded-lg">
                <p className="text-sm">No items added yet.</p>
                <p className="text-xs mt-1">Click above to add batteries or inverters</p>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="issue_description" className="text-sm">Issue Description *</Label>
            <Textarea
              id="issue_description"
              value={formData.issue_description}
              onChange={(e) => setFormData({ ...formData, issue_description: e.target.value })}
              placeholder="Additional notes about the service..."
              rows={2}
              required
              className="resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="priority" className="text-sm">Priority *</Label>
            <Select
              value={formData.priority}
              onValueChange={(value) => setFormData({ ...formData, priority: value as HomeServiceFormData['priority'] })}
            >
              <SelectTrigger id="priority" className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="LOW">Low</SelectItem>
                <SelectItem value="MEDIUM">Medium</SelectItem>
                <SelectItem value="HIGH">High</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2 border-t">
            <Button type="button" variant="outline" onClick={() => { setIsOpen(false); setServiceItems([]); }} className="w-full sm:w-auto h-10">
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="w-full sm:w-auto h-10 gap-2">
              {loading && <Loader className="w-4 h-4 animate-spin" />}
              Create Request
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}