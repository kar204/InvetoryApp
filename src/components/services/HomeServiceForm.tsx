import { useState, useEffect } from 'react';
import { Plus, Loader } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Product } from '@/types/database';

interface HomeServiceFormProps {
  onRequestCreated: () => void;
}

type HomeServiceFormData = {
  customer_name: string;
  customer_phone: string;
  address: string;
  selected_battery_model: string;
  custom_battery_model: string;
  selected_inverter_model: string;
  custom_inverter_model: string;
  issue_description: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
};

export function HomeServiceForm({ onRequestCreated }: HomeServiceFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);

  const initialFormData: HomeServiceFormData = {
    customer_name: '',
    customer_phone: '',
    address: '',
    selected_battery_model: '',
    custom_battery_model: '',
    selected_inverter_model: '',
    custom_inverter_model: '',
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

  const resolveModelValue = (customValue: string, selectedValue: string) => {
    const trimmedCustomValue = customValue.trim();
    return trimmedCustomValue || selectedValue.trim();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) return;

    const batteryModel = resolveModelValue(formData.custom_battery_model, formData.selected_battery_model);
    const inverterModel = resolveModelValue(formData.custom_inverter_model, formData.selected_inverter_model);

    if (!formData.customer_name || !formData.customer_phone || !formData.address || !formData.issue_description) {
      toast({
        title: 'Validation Error',
        description: 'Please fill all required fields.',
        variant: 'destructive'
      });
      return;
    }

    if (!batteryModel && !inverterModel) {
      toast({
        title: 'Validation Error',
        description: 'Please select at least Battery Model or Inverter Model.',
        variant: 'destructive'
      });
      return;
    }

    setLoading(true);

    try {
      // Get service technician user (without .single() to avoid errors if not found)
      let assignedTechnicianId: string | null = null;

      try {
        const { data: technicianData, error: techError } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('role', 'service_technician')
          .limit(1);

        if (!techError && technicianData && technicianData.length > 0) {
          assignedTechnicianId = technicianData[0].user_id;
        }
      } catch (techError) {
        console.warn('Could not auto-assign technician:', techError);
        // Continue without auto-assignment
      }

      const { data, error } = await supabase
        .from('home_service_requests')
        .insert({
        customer_name: formData.customer_name,
        customer_phone: formData.customer_phone,
        address: formData.address,
        battery_model: batteryModel || null,
        inverter_model: inverterModel || null,
        issue_description: formData.issue_description,
        priority: formData.priority,
        created_by: user.id,
        assigned_to: assignedTechnicianId,
        assigned_at: assignedTechnicianId ? new Date().toISOString() : null,
        status: assignedTechnicianId ? 'IN_PROGRESS' : 'OPEN',
        })
        .select('request_number')
        .single();

      if (error) throw error;

      toast({
        title: 'Home Service Request Created',
        description: `Request #${data?.request_number ?? ''} created successfully.`,
      });

      setFormData({ ...initialFormData });

      setIsOpen(false);

      // Trigger parent refresh
      onRequestCreated();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      toast({
        title: 'Error creating request',
        description: errorMessage,
        variant: 'destructive'
      });
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

      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Home Service Request</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="customer_name">Customer Name *</Label>
              <Input
                id="customer_name"
                value={formData.customer_name}
                onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                placeholder="Enter customer name"
                required
              />
            </div>

            <div>
              <Label htmlFor="customer_phone">Phone Number *</Label>
              <Input
                id="customer_phone"
                value={formData.customer_phone}
                onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
                placeholder="Enter phone number"
                type="tel"
                required
              />
            </div>
          </div>

          <div>
            <Label htmlFor="address">Address for Service *</Label>
            <Textarea
              id="address"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="Enter complete service address"
              rows={2}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="battery_model">Battery Model (Optional)</Label>
              <div className="flex gap-2">
                <Select
                  value={formData.selected_battery_model}
                  onValueChange={(value) => setFormData({ ...formData, selected_battery_model: value })}
                >
                  <SelectTrigger id="battery_model" className="flex-1">
                    <SelectValue placeholder="Select from list" />
                  </SelectTrigger>
                  <SelectContent>
                    {products
                      .filter((p) => p.category === 'Battery')
                      .map((product) => (
                        <SelectItem key={product.id} value={product.model}>
                          {product.name} - {product.model}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <Input
                placeholder="Or type custom model"
                value={formData.custom_battery_model}
                onChange={(e) => setFormData({ ...formData, custom_battery_model: e.target.value })}
                className="mt-2"
              />
            </div>

            <div>
              <Label htmlFor="inverter_model">Inverter Model (Optional)</Label>
              <div className="flex gap-2">
                <Select
                  value={formData.selected_inverter_model}
                  onValueChange={(value) => setFormData({ ...formData, selected_inverter_model: value })}
                >
                  <SelectTrigger id="inverter_model" className="flex-1">
                    <SelectValue placeholder="Select from list" />
                  </SelectTrigger>
                  <SelectContent>
                    {products
                      .filter((p) => p.category === 'Inverter')
                      .map((product) => (
                        <SelectItem key={product.id} value={product.model}>
                          {product.name} - {product.model}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <Input
                placeholder="Or type custom model"
                value={formData.custom_inverter_model}
                onChange={(e) => setFormData({ ...formData, custom_inverter_model: e.target.value })}
                className="mt-2"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="issue_description">Issue Description *</Label>
            <Textarea
              id="issue_description"
              value={formData.issue_description}
              onChange={(e) => setFormData({ ...formData, issue_description: e.target.value })}
              placeholder="Describe the issue in detail"
              rows={3}
              required
            />
          </div>

          <div>
            <Label htmlFor="priority">Priority *</Label>
            <Select
              value={formData.priority}
              onValueChange={(value) => setFormData({ ...formData, priority: value as HomeServiceFormData['priority'] })}
            >
              <SelectTrigger id="priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="LOW">Low</SelectItem>
                <SelectItem value="MEDIUM">Medium</SelectItem>
                <SelectItem value="HIGH">High</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="gap-2">
              {loading && <Loader className="w-4 h-4 animate-spin" />}
              Create Request
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
