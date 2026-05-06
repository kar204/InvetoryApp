import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Trash2, Users } from 'lucide-react';
import { SearchBar } from '@/components/ui/SearchBar';
import { useLocation } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePollingRefresh } from '@/hooks/usePollingRefresh';
import { useToast } from '@/hooks/use-toast';
import type { Customer } from '@/types/database';

export default function Customers() {
  const location = useLocation();
  const { hasRole } = useAuth();
  const { toast } = useToast();
  const isAdmin = hasRole('admin');

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState(false);
  const deferredSearch = useDeferredValue(search);
  const fetchCustomersRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setSearch((params.get('q') || '').trim());
  }, [location.search]);

  const fetchCustomers = async () => {
    if (!isAdmin) return;

    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setCustomers((data as Customer[]) || []);
    } catch (error) {
      console.error('Error fetching customers:', error);
    } finally {
      setLoading(false);
    }
  };

  fetchCustomersRef.current = fetchCustomers;

  useEffect(() => {
    void fetchCustomersRef.current();
  }, [isAdmin]);

  usePollingRefresh(fetchCustomers, 60000, { enabled: isAdmin });

  const visibleCustomers = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    if (!q) return customers;

    return customers.filter((customer) => {
      return (
        customer.name.toLowerCase().includes(q) ||
        customer.phone.toLowerCase().includes(q) ||
        (customer.email || '').toLowerCase().includes(q) ||
        (customer.city || '').toLowerCase().includes(q) ||
        (customer.address || '').toLowerCase().includes(q)
      );
    });
  }, [customers, deferredSearch]);

  const handleDeleteCustomer = async () => {
    if (!customerToDelete) return;

    try {
      setDeleting(true);

      const { data, error } = await supabase
        .from('customers')
        .delete()
        .eq('id', customerToDelete.id)
        .select('id');

      if (error) throw error;

      if (!data || data.length === 0) {
        toast({
          title: 'Delete failed',
          description: 'Customer was not deleted. Check the active RLS policies for this role.',
          variant: 'destructive',
        });
        return;
      }

      setCustomers((prev) => prev.filter((customer) => customer.id !== customerToDelete.id));
      setCustomerToDelete(null);
      toast({ title: 'Customer deleted' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast({ title: 'Error deleting customer', description: message, variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white">
              <Users className="h-5 w-5" />
              Customers
            </h1>
            <p className="text-sm text-muted-foreground">Customer records captured from Service Tickets and Home Service.</p>
          </div>
          <Badge variant="outline" className="w-fit">
            {visibleCustomers.length} shown
          </Badge>
        </div>

        {!isAdmin ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Only admins can view the customer list.
            </CardContent>
          </Card>
        ) : (
          <>
            <SearchBar
              value={search}
              onChange={setSearch}
              placeholder="Search name, phone, email, city..."
              className="max-w-md"
            />

            {loading ? (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">Loading customers...</CardContent>
              </Card>
            ) : visibleCustomers.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">No customers found.</CardContent>
              </Card>
            ) : (
              <div className="grid gap-3">
                {visibleCustomers.map((customer) => (
                  <Card key={customer.id} className="bg-white dark:bg-[#111827]/70">
                    <CardContent className="p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-1">
                          <div className="font-semibold text-slate-900 dark:text-white">{customer.name}</div>
                          <div className="text-sm text-muted-foreground">{customer.phone}</div>
                          {(customer.email || customer.city || customer.address) && (
                            <div className="text-xs text-muted-foreground">
                              {[customer.email, customer.city, customer.address].filter(Boolean).join(' | ')}
                            </div>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigator.clipboard?.writeText(customer.phone)}
                            className="w-fit"
                          >
                            Copy phone
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setCustomerToDelete(customer)}
                            className="w-fit"
                          >
                            <Trash2 className="mr-1 h-4 w-4" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <AlertDialog open={!!customerToDelete} onOpenChange={() => setCustomerToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete customer?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the customer master record only. Existing service tickets and home service requests remain in place.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteCustomer} disabled={deleting}>
              {deleting ? 'Deleting...' : 'Delete Customer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
