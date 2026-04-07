import { useState, useEffect } from 'react';
import { Loader, X, Battery, Zap } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { HomeServiceRequest, HomeServiceItem } from '@/types/database';

interface HomeServiceResolutionFormProps {
  request: HomeServiceRequest | null;
  isOpen: boolean;
  onClose: () => void;
  onResolved: () => void;
}

export function HomeServiceResolutionForm({
  request,
  isOpen,
  onClose,
  onResolved,
}: HomeServiceResolutionFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<HomeServiceItem[]>([]);

  // Per-item states
  const [batteryItemWarranty, setBatteryItemWarranty] = useState<Record<string, 'yes' | 'no'>>({});
  const [batteryItemPrices, setBatteryItemPrices] = useState<Record<string, string>>({});
  const [batteryItemNotes, setBatteryItemNotes] = useState<Record<string, string>>({});
  const [batteryItemResolved, setBatteryItemResolved] = useState<Record<string, 'yes' | 'no'>>({});

  const [inverterItemResolved, setInverterItemResolved] = useState<Record<string, 'yes' | 'no'>>({});
  const [inverterItemPrices, setInverterItemPrices] = useState<Record<string, string>>({});
  const [inverterItemNotes, setInverterItemNotes] = useState<Record<string, string>>({});

  // General notes
  const [generalNotes, setGeneralNotes] = useState('');

  // Payment state
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD' | 'UPI' | ''>('');

  useEffect(() => {
    if (isOpen && request) {
      loadItems();
      resetStates();
    }
  }, [isOpen, request?.id]);

  const loadItems = async () => {
    if (!request) return;
    try {
      const { data } = await supabase
        .from('home_service_items')
        .select('*')
        .eq('request_id', request.id)
        .order('created_at', { ascending: true });
      
      // If no items found in items table, check legacy fields and create virtual items
      if (!data || data.length === 0) {
        const virtualItems: HomeServiceItem[] = [];
        
        if (request.battery_model) {
          virtualItems.push({
            id: 'bat-legacy',
            request_id: request.id,
            item_type: 'BATTERY',
            model: request.battery_model,
            issue_description: request.issue_description,
            resolved: null,
            price: null,
            within_warranty: null,
            notes: null,
            resolved_by: null,
            resolved_at: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
        
        if (request.inverter_model) {
          virtualItems.push({
            id: 'inv-legacy',
            request_id: request.id,
            item_type: 'INVERTER',
            model: request.inverter_model,
            issue_description: request.issue_description,
            resolved: null,
            price: null,
            within_warranty: null,
            notes: null,
            resolved_by: null,
            resolved_at: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
        
        setItems(virtualItems);
      } else {
        setItems(data);
      }
    } catch (error) {
      console.error('Error loading items:', error);
      setItems([]);
    }
  };

  const resetStates = () => {
    setBatteryItemWarranty({});
    setBatteryItemPrices({});
    setBatteryItemNotes({});
    setBatteryItemResolved({});
    setInverterItemResolved({});
    setInverterItemPrices({});
    setInverterItemNotes({});
    setGeneralNotes('');
    setPaymentMethod('');
  };

  const batteryItems = items.filter(i => i.item_type === 'BATTERY');
  const inverterItems = items.filter(i => i.item_type === 'INVERTER');

  const totalBatteryPrice = batteryItems.reduce((sum, item) => {
    const isWarranty = batteryItemWarranty[item.id] === 'yes';
    return sum + (isWarranty ? 0 : Number(batteryItemPrices[item.id] || 0));
  }, 0);

  const totalInverterPrice = inverterItems.reduce((sum, item) => {
    const isResolved = inverterItemResolved[item.id] === 'yes';
    return sum + (isResolved ? Number(inverterItemPrices[item.id] || 0) : 0);
  }, 0);

  const calculatedTotal = totalBatteryPrice + totalInverterPrice;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!request || !user) return;

    // Validate battery items
    for (const item of batteryItems) {
      if (!batteryItemResolved[item.id]) {
        toast({ title: 'Select resolution status for all batteries', variant: 'destructive' });
        return;
      }
      const isResolved = batteryItemResolved[item.id] === 'yes';
      if (isResolved && !batteryItemWarranty[item.id]) {
        toast({ title: 'Select warranty status for all resolved batteries', variant: 'destructive' });
        return;
      }
      if (isResolved && batteryItemWarranty[item.id] === 'no' && !batteryItemPrices[item.id]) {
        toast({ title: 'Enter price for non-warranty batteries', variant: 'destructive' });
        return;
      }
    }

    // Validate inverter items
    for (const item of inverterItems) {
      if (!inverterItemResolved[item.id]) {
        toast({ title: 'Select resolution status for all inverters', variant: 'destructive' });
        return;
      }
      const isResolved = inverterItemResolved[item.id] === 'yes';
      if (isResolved && !inverterItemPrices[item.id]) {
        toast({ title: 'Enter price for resolved inverters', variant: 'destructive' });
        return;
      }
    }

    if (calculatedTotal > 0 && !paymentMethod) {
      toast({ title: 'Select payment method', variant: 'destructive' });
      return;
    }

    setLoading(true);

    try {
      // Update each battery item
      for (const item of batteryItems) {
        const isResolved = batteryItemResolved[item.id] === 'yes';
        const isWarranty = batteryItemWarranty[item.id] === 'yes';
        const price = isWarranty ? 0 : Number(batteryItemPrices[item.id] || 0);

        await supabase
          .from('home_service_items')
          .update({
            resolved: isResolved,
            price: price,
            within_warranty: isResolved ? isWarranty : null,
            notes: batteryItemNotes[item.id] || null,
            resolved_by: user.id,
            resolved_at: new Date().toISOString(),
          })
          .eq('id', item.id);
      }

      // Update each inverter item
      for (const item of inverterItems) {
        const isResolved = inverterItemResolved[item.id] === 'yes';
        const price = isResolved ? Number(inverterItemPrices[item.id] || 0) : 0;

        await supabase
          .from('home_service_items')
          .update({
            resolved: isResolved,
            price: price,
            notes: inverterItemNotes[item.id] || null,
            resolved_by: user.id,
            resolved_at: new Date().toISOString(),
          })
          .eq('id', item.id);
      }

      // Check if all items resolved
      const allResolved = items.every(item => {
        if (item.item_type === 'BATTERY') return batteryItemResolved[item.id] === 'yes';
        return inverterItemResolved[item.id] === 'yes';
      });

      // Create resolution record
      await supabase
        .from('home_service_resolutions')
        .insert({
          request_id: request.id,
          battery_resolved: batteryItems.length > 0 ? batteryItems.every(i => batteryItemResolved[i.id] === 'yes') : null,
          battery_resolution_notes: generalNotes || null,
          battery_within_warranty: batteryItems.length > 0 ? batteryItems.every(i => batteryItemWarranty[i.id] === 'yes') : null,
          battery_price: totalBatteryPrice,
          inverter_resolved: inverterItems.length > 0 ? inverterItems.every(i => inverterItemResolved[i.id] === 'yes') : null,
          inverter_resolution_notes: generalNotes || null,
          inverter_price: totalInverterPrice,
          total_amount: calculatedTotal,
          payment_method: calculatedTotal > 0 ? (paymentMethod as 'CASH' | 'CARD' | 'UPI') : null,
          resolved_by: user.id,
          resolved_at: new Date().toISOString(),
          closed_by: user.id,
          closed_at: new Date().toISOString(),
        });

      // Update request status
      await supabase
        .from('home_service_requests')
        .update({ status: allResolved ? 'CLOSED' : 'IN_PROGRESS' })
        .eq('id', request.id);

      toast({ title: 'Success', description: 'Service resolved successfully' });
      onClose();
      onResolved();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'An error occurred';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  if (!request) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader className="sticky top-0 bg-white dark:bg-[#0B0F19] pb-2 z-10 border-b">
          <DialogTitle className="text-lg sm:text-xl flex items-center gap-2">
            Resolve Home Service
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 pb-4">
          {/* Request Summary */}
          <Card className="bg-slate-50 dark:bg-slate-900/50">
            <CardContent className="pt-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-muted-foreground text-xs">Customer</div>
                  <div className="font-semibold">{request.customer_name}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">Phone</div>
                  <div className="font-semibold">{request.customer_phone}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">Items</div>
                  <div className="font-semibold">{items.length} ({batteryItems.length} Battery, {inverterItems.length} Inverter)</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Battery Items */}
          {batteryItems.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Battery className="h-5 w-5 text-blue-500" />
                <Label className="text-sm font-semibold">Batteries ({batteryItems.length})</Label>
              </div>
              <div className="max-h-[200px] overflow-y-auto space-y-3">
                {batteryItems.map((item) => (
                  <div key={item.id} className="p-4 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/10 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-semibold text-sm">{item.model}</span>
                        {item.issue_description && (
                          <p className="text-xs text-muted-foreground">{item.issue_description}</p>
                        )}
                      </div>
                      {item.resolved && (
                        <Badge className="bg-emerald-500/10 text-emerald-500 text-xs">Resolved</Badge>
                      )}
                    </div>

                    {/* Resolution Status */}
                    <div className="space-y-1">
                      <Label className="text-xs font-medium text-muted-foreground">Issue Resolved?</Label>
                      <RadioGroup
                        value={batteryItemResolved[item.id] || ''}
                        onValueChange={(val) => setBatteryItemResolved({ ...batteryItemResolved, [item.id]: val as 'yes' | 'no' })}
                        className="flex gap-4"
                      >
                        <div className="flex items-center space-x-1.5">
                          <RadioGroupItem value="yes" id={`bat-res-${item.id}-yes`} className="h-3.5 w-3.5" />
                          <Label htmlFor={`bat-res-${item.id}-yes`} className="text-sm cursor-pointer">Yes</Label>
                        </div>
                        <div className="flex items-center space-x-1.5">
                          <RadioGroupItem value="no" id={`bat-res-${item.id}-no`} className="h-3.5 w-3.5" />
                          <Label htmlFor={`bat-res-${item.id}-no`} className="text-sm cursor-pointer">No</Label>
                        </div>
                      </RadioGroup>
                    </div>

                    {batteryItemResolved[item.id] === 'yes' && (
                      <>
                        {/* Warranty */}
                        <div className="space-y-1">
                          <Label className="text-xs font-medium text-muted-foreground">Warranty</Label>
                          <RadioGroup
                            value={batteryItemWarranty[item.id] || ''}
                            onValueChange={(val) => setBatteryItemWarranty({ ...batteryItemWarranty, [item.id]: val as 'yes' | 'no' })}
                            className="flex gap-4"
                          >
                            <div className="flex items-center space-x-1.5">
                              <RadioGroupItem value="yes" id={`bat-war-${item.id}-yes`} className="h-3.5 w-3.5" />
                              <Label htmlFor={`bat-war-${item.id}-yes`} className="text-sm cursor-pointer">Yes - Free</Label>
                            </div>
                            <div className="flex items-center space-x-1.5">
                              <RadioGroupItem value="no" id={`bat-war-${item.id}-no`} className="h-3.5 w-3.5" />
                              <Label htmlFor={`bat-war-${item.id}-no`} className="text-sm cursor-pointer">No - Charge</Label>
                            </div>
                          </RadioGroup>
                        </div>

                        {/* Price */}
                        {batteryItemWarranty[item.id] === 'no' && (
                          <div className="space-y-1">
                            <Label className="text-xs font-medium text-muted-foreground">Price (₹)</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={batteryItemPrices[item.id] || ''}
                              onChange={(e) => setBatteryItemPrices({ ...batteryItemPrices, [item.id]: e.target.value })}
                              placeholder="Enter price"
                              className="h-9 text-sm"
                            />
                          </div>
                        )}

                        {/* Notes */}
                        <div className="space-y-1">
                          <Label className="text-xs font-medium text-muted-foreground">Notes</Label>
                          <Input
                            value={batteryItemNotes[item.id] || ''}
                            onChange={(e) => setBatteryItemNotes({ ...batteryItemNotes, [item.id]: e.target.value })}
                            placeholder="Service details..."
                            className="h-8 text-sm"
                          />
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Inverter Items */}
          {inverterItems.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-amber-500" />
                <Label className="text-sm font-semibold">Inverters ({inverterItems.length})</Label>
              </div>
              <div className="max-h-[200px] overflow-y-auto space-y-3">
                {inverterItems.map((item) => (
                  <div key={item.id} className="p-4 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/10 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-semibold text-sm">{item.model}</span>
                        {item.issue_description && (
                          <p className="text-xs text-muted-foreground">{item.issue_description}</p>
                        )}
                      </div>
                      {item.resolved && (
                        <Badge className="bg-emerald-500/10 text-emerald-500 text-xs">Resolved</Badge>
                      )}
                    </div>

                    {/* Resolution Status */}
                    <div className="space-y-1">
                      <Label className="text-xs font-medium text-muted-foreground">Issue Resolved?</Label>
                      <RadioGroup
                        value={inverterItemResolved[item.id] || ''}
                        onValueChange={(val) => setInverterItemResolved({ ...inverterItemResolved, [item.id]: val as 'yes' | 'no' })}
                        className="flex gap-4"
                      >
                        <div className="flex items-center space-x-1.5">
                          <RadioGroupItem value="yes" id={`inv-res-${item.id}-yes`} className="h-3.5 w-3.5" />
                          <Label htmlFor={`inv-res-${item.id}-yes`} className="text-sm cursor-pointer">Yes - Fixed</Label>
                        </div>
                        <div className="flex items-center space-x-1.5">
                          <RadioGroupItem value="no" id={`inv-res-${item.id}-no`} className="h-3.5 w-3.5" />
                          <Label htmlFor={`inv-res-${item.id}-no`} className="text-sm cursor-pointer">No - Persists</Label>
                        </div>
                      </RadioGroup>
                    </div>

                    {inverterItemResolved[item.id] === 'yes' && (
                      <>
                        {/* Price */}
                        <div className="space-y-1">
                          <Label className="text-xs font-medium text-muted-foreground">Price (₹)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={inverterItemPrices[item.id] || ''}
                            onChange={(e) => setInverterItemPrices({ ...inverterItemPrices, [item.id]: e.target.value })}
                            placeholder="Enter price"
                            className="h-9 text-sm"
                          />
                        </div>

                        {/* Notes */}
                        <div className="space-y-1">
                          <Label className="text-xs font-medium text-muted-foreground">Notes</Label>
                          <Input
                            value={inverterItemNotes[item.id] || ''}
                            onChange={(e) => setInverterItemNotes({ ...inverterItemNotes, [item.id]: e.target.value })}
                            placeholder="Service details..."
                            className="h-8 text-sm"
                          />
                        </div>
                      </>
                    )}

                    {inverterItemResolved[item.id] === 'no' && (
                      <div className="text-xs text-muted-foreground bg-slate-100 dark:bg-slate-800 p-2 rounded">
                        Issue could not be resolved - no charge
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* No items case */}
          {items.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No items to resolve
            </div>
          )}

          {/* Payment Section */}
          {calculatedTotal > 0 && (
            <div className="p-4 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/10 space-y-3">
              <Label className="text-sm font-semibold">Payment Details</Label>
              
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Battery:</span>
                <span className="font-semibold">₹{totalBatteryPrice.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Inverter:</span>
                <span className="font-semibold">₹{totalInverterPrice.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between text-lg font-bold border-t border-emerald-200 dark:border-emerald-700 pt-2">
                <span>Total:</span>
                <span className="text-emerald-700 dark:text-emerald-400">₹{calculatedTotal.toLocaleString('en-IN')}</span>
              </div>

              <div className="space-y-1">
                <Label className="text-sm font-medium">Payment Method</Label>
                <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as 'CASH' | 'CARD' | 'UPI')}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Select payment method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CASH">Cash</SelectItem>
                    <SelectItem value="CARD">Card</SelectItem>
                    <SelectItem value="UPI">UPI</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* No Charge Message */}
          {items.length > 0 && calculatedTotal === 0 && items.every(item => {
            if (item.item_type === 'BATTERY') return batteryItemResolved[item.id] === 'yes' && batteryItemWarranty[item.id] === 'yes';
            return inverterItemResolved[item.id] === 'no';
          }) && (
            <div className="p-4 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/10 text-center">
              <div className="text-emerald-600 dark:text-emerald-400 font-semibold">
                All items under warranty or not resolved - No charge
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2 border-t">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading} className="w-full sm:w-auto h-10">
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="w-full sm:w-auto h-10 gap-2 bg-emerald-600 hover:bg-emerald-700">
              {loading && <Loader className="w-4 h-4 animate-spin" />}
              Resolve {items.length} Item(s)
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}