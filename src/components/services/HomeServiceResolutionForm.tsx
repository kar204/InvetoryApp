import { useState } from 'react';
import { Loader, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { HomeServiceRequest } from '@/types/database';

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

  // Battery state
  const [batteryResolved, setBatteryResolved] = useState<'yes' | 'no' | ''>('');
  const [batteryResolutionNotes, setBatteryResolutionNotes] = useState('');

  // Inverter state
  const [inverterResolved, setInverterResolved] = useState<'yes' | 'no' | ''>('');
  const [inverterResolutionNotes, setInverterResolutionNotes] = useState('');

  // Payment state (only for resolved items)
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD' | 'UPI' | ''>('');
  const [totalAmount, setTotalAmount] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!request || !user) return;

    // Validation
    const hasTrackedProduct = Boolean(request.battery_model || request.inverter_model);
    if (hasTrackedProduct && !batteryResolved && !inverterResolved) {
      toast({
        title: 'Validation Error',
        description: 'Please resolve at least one item (Battery or Inverter).',
        variant: 'destructive',
      });
      return;
    }

	    // If any item is resolved, require payment details
	    const anyResolved = batteryResolved === 'yes' || inverterResolved === 'yes';
	    if (anyResolved && (!paymentMethod || !totalAmount)) {
      toast({
        title: 'Validation Error',
        description: 'Please fill payment method and amount for resolved items.',
        variant: 'destructive',
      });
	      return;
	    }

	    const resolvedPaymentMethod = anyResolved ? (paymentMethod as 'CASH' | 'CARD' | 'UPI') : null;

	    setLoading(true);

    try {
      // Prevent duplicate resolution attempts (request_id is UNIQUE in the DB)
      const { data: existingResolution, error: existingError } = await supabase
        .from('home_service_resolutions')
        .select('id')
        .eq('request_id', request.id)
        .maybeSingle();

      if (existingError) throw existingError;

      if (existingResolution) {
        toast({
          title: 'Already resolved',
          description: 'This service request already has a resolution entry.',
          variant: 'destructive',
        });
        onClose();
        onResolved();
        return;
      }

      // Create resolution record
      const { error: resolutionError } = await supabase
        .from('home_service_resolutions')
        .insert({
          request_id: request.id,
          battery_resolved: request.battery_model ? batteryResolved === 'yes' : null,
          battery_resolution_notes: batteryResolved ? batteryResolutionNotes : null,
	          inverter_resolved: request.inverter_model ? inverterResolved === 'yes' : null,
	          inverter_resolution_notes: inverterResolved ? inverterResolutionNotes : null,
	          total_amount: anyResolved ? parseFloat(totalAmount) : null,
	          payment_method: resolvedPaymentMethod,
	          resolved_by: user.id,
          resolved_at: new Date().toISOString(),
          closed_by: user.id,
          closed_at: new Date().toISOString(),
        });

      if (resolutionError) {
        // Unique constraint on request_id: avoid surfacing a scary DB error to users.
        if ((resolutionError as any).code === '23505') {
          toast({
            title: 'Already resolved',
            description: 'This service request already has a resolution entry.',
            variant: 'destructive',
          });
          onClose();
          onResolved();
          return;
        }
        throw resolutionError;
      }

      // Update request status to CLOSED
      const { error: updateError } = await supabase
        .from('home_service_requests')
        .update({ status: 'CLOSED' })
        .eq('id', request.id);

      if (updateError) throw updateError;

      toast({
        title: 'Success',
        description: 'Service request resolved and closed successfully.',
      });

      onClose();
      onResolved();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  if (!request) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Resolve Service Request</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Request Summary */}
          <Card className="bg-muted/50">
            <CardContent className="pt-6">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground">Customer</div>
                  <div className="font-semibold">{request.customer_name}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Phone</div>
                  <div className="font-semibold">{request.customer_phone}</div>
                </div>
                {request.battery_model && (
                  <div>
                    <div className="text-muted-foreground">Battery Model</div>
                    <div className="font-semibold">{request.battery_model}</div>
                  </div>
                )}
                {request.inverter_model && (
                  <div>
                    <div className="text-muted-foreground">Inverter Model</div>
                    <div className="font-semibold">{request.inverter_model}</div>
                  </div>
                )}
                {request.spare_supplied && (
                  <div>
                    <div className="text-muted-foreground">Spare Supplied</div>
                    <div className="font-semibold">{request.spare_supplied}</div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Battery Resolution */}
          {request.battery_model && (
            <div className="space-y-3 p-4 border rounded-lg bg-blue-50/30 dark:bg-blue-950/10">
              <Label className="text-base font-semibold">🔋 Battery - Resolved?</Label>
              <RadioGroup value={batteryResolved} onValueChange={(v) => setBatteryResolved(v as 'yes' | 'no')}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="yes" id="battery-yes" />
                  <Label htmlFor="battery-yes" className="font-normal cursor-pointer">
                    Yes
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="no" id="battery-no" />
                  <Label htmlFor="battery-no" className="font-normal cursor-pointer">
                    No
                  </Label>
                </div>
              </RadioGroup>

              {batteryResolved && (
                <Textarea
                  placeholder={
                    batteryResolved === 'yes'
                      ? 'Describe the service/repair done...'
                      : 'Explain why it could not be resolved...'
                  }
                  value={batteryResolutionNotes}
                  onChange={(e) => setBatteryResolutionNotes(e.target.value)}
                  rows={2}
                  required
                />
              )}
            </div>
          )}

          {/* Inverter Resolution */}
          {request.inverter_model && (
            <div className="space-y-3 p-4 border rounded-lg bg-amber-50/30 dark:bg-amber-950/10">
              <Label className="text-base font-semibold">⚡ Inverter - Resolved?</Label>
              <RadioGroup value={inverterResolved} onValueChange={(v) => setInverterResolved(v as 'yes' | 'no')}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="yes" id="inverter-yes" />
                  <Label htmlFor="inverter-yes" className="font-normal cursor-pointer">
                    Yes
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="no" id="inverter-no" />
                  <Label htmlFor="inverter-no" className="font-normal cursor-pointer">
                    No
                  </Label>
                </div>
              </RadioGroup>

              {inverterResolved && (
                <Textarea
                  placeholder={
                    inverterResolved === 'yes'
                      ? 'Describe the service/repair done...'
                      : 'Explain why it could not be resolved...'
                  }
                  value={inverterResolutionNotes}
                  onChange={(e) => setInverterResolutionNotes(e.target.value)}
                  rows={2}
                  required
                />
              )}
            </div>
          )}

          {/* Payment Details - Only if something is resolved */}
          {(batteryResolved === 'yes' || inverterResolved === 'yes') && (
            <div className="space-y-4 p-4 border rounded-lg bg-green-50/30 dark:bg-green-950/10">
              <Label className="text-base font-semibold">💰 Payment Details</Label>

              <div>
                <Label htmlFor="payment_method">Payment Method *</Label>
                <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as 'CASH' | 'CARD' | 'UPI')}>
                  <SelectTrigger id="payment_method">
                    <SelectValue placeholder="Select payment method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CASH">Cash</SelectItem>
                    <SelectItem value="CARD">Credit</SelectItem>
                    <SelectItem value="UPI">UPI</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="total_amount">Amount (₹) *</Label>
                <Input
                  id="total_amount"
                  type="number"
                  step="0.01"
                  value={totalAmount}
                  onChange={(e) => setTotalAmount(e.target.value)}
                  placeholder="Enter amount"
                  required
                />
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="gap-2">
              {loading && <Loader className="w-4 h-4 animate-spin" />}
              Resolve & Close Request
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
