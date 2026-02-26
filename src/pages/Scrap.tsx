import { useEffect, useState } from 'react';
import { Search, Recycle, PackageOpen, Check } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
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

const SCRAP_CATEGORIES = ['Car Battery', 'Bike Battery', 'Inverter Battery', 'SMF'] as const;

interface ScrapEntry {
  id: string;
  customer_name: string;
  scrap_item: string;
  scrap_model: string;
  scrap_value: number;
  quantity: number;
  status: string;
  marked_out_at: string | null;
  marked_out_by: string | null;
  recorded_by: string;
  created_at: string;
}

export default function Scrap() {
  const { user, hasAnyRole } = useAuth();
  const { toast } = useToast();
  const [entries, setEntries] = useState<ScrapEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isRecordOpen, setIsRecordOpen] = useState(false);
  const [entryToMarkOut, setEntryToMarkOut] = useState<ScrapEntry | null>(null);

  const [form, setForm] = useState({ customer_name: '', scrap_item: '', scrap_model: '', scrap_value: '', quantity: '1' });

  const canManage = hasAnyRole(['admin', 'counter_staff', 'scrap_manager']);

  useEffect(() => {
    fetchEntries();
  }, []);

  const fetchEntries = async () => {
    try {
      const { data } = await supabase.from('scrap_entries').select('*').order('created_at', { ascending: false });
      setEntries((data as ScrapEntry[]) || []);
    } catch (error) {
      console.error('Error fetching scrap:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      const { error } = await supabase.from('scrap_entries').insert({
        customer_name: form.customer_name.trim(),
        scrap_item: form.scrap_item,
        scrap_model: form.scrap_model.trim(),
        scrap_value: parseFloat(form.scrap_value) || 0,
        quantity: parseInt(form.quantity) || 1,
        recorded_by: user.id,
      });
      if (error) throw error;
      toast({ title: 'Scrap entry recorded' });
      setIsRecordOpen(false);
      setForm({ customer_name: '', scrap_item: '', scrap_model: '', scrap_value: '', quantity: '1' });
      fetchEntries();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'An error occurred';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    }
  };

  const handleMarkOut = async () => {
    if (!entryToMarkOut || !user) return;
    try {
      const { error } = await supabase.from('scrap_entries')
        .update({ status: 'OUT', marked_out_at: new Date().toISOString(), marked_out_by: user.id })
        .eq('id', entryToMarkOut.id);
      if (error) throw error;
      toast({ title: 'Scrap marked as out' });
      setEntryToMarkOut(null);
      fetchEntries();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'An error occurred';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    }
  };

  const inEntries = entries.filter(e => e.status === 'IN' && (
    e.customer_name.toLowerCase().includes(search.toLowerCase()) ||
    e.scrap_item.toLowerCase().includes(search.toLowerCase()) ||
    e.scrap_model.toLowerCase().includes(search.toLowerCase())
  ));
  const outEntries = entries.filter(e => e.status === 'OUT' && (
    e.customer_name.toLowerCase().includes(search.toLowerCase()) ||
    e.scrap_item.toLowerCase().includes(search.toLowerCase()) ||
    e.scrap_model.toLowerCase().includes(search.toLowerCase())
  ));

  const totalInValue = entries.filter(e => e.status === 'IN').reduce((s, e) => s + e.scrap_value, 0);
  const totalOutValue = entries.filter(e => e.status === 'OUT').reduce((s, e) => s + e.scrap_value, 0);

  const renderTable = (items: ScrapEntry[], showMarkOut: boolean) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Customer</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Model</TableHead>
          <TableHead className="text-right">Qty</TableHead>
          <TableHead className="text-right">Value (₹)</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Status</TableHead>
          {showMarkOut && canManage && <TableHead className="w-[100px]">Action</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.length === 0 ? (
          <TableRow>
            <TableCell colSpan={showMarkOut && canManage ? 8 : 7} className="text-center text-muted-foreground py-8">
              No entries found
            </TableCell>
          </TableRow>
        ) : items.map(entry => (
          <TableRow key={entry.id}>
            <TableCell className="font-medium">{entry.customer_name}</TableCell>
            <TableCell><Badge variant="outline">{entry.scrap_item}</Badge></TableCell>
            <TableCell>{entry.scrap_model}</TableCell>
            <TableCell className="text-right">{entry.quantity}</TableCell>
            <TableCell className="text-right">₹{entry.scrap_value.toLocaleString('en-IN')}</TableCell>
            <TableCell>{format(new Date(entry.created_at), 'dd/MM/yyyy')}</TableCell>
            <TableCell>
              <Badge variant={entry.status === 'IN' ? 'default' : 'secondary'}>{entry.status}</Badge>
            </TableCell>
            {showMarkOut && canManage && (
              <TableCell>
                <Button variant="outline" size="sm" onClick={() => setEntryToMarkOut(entry)}>
                  <Check className="h-3 w-3 mr-1" /> Mark Out
                </Button>
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Scrap</h1>
            <p className="text-muted-foreground">Record and manage scrap entries</p>
          </div>
          {canManage && (
            <Dialog open={isRecordOpen} onOpenChange={setIsRecordOpen}>
              <DialogTrigger asChild>
                <Button><Recycle className="h-4 w-4 mr-2" />Record Scrap</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Record Scrap Entry</DialogTitle></DialogHeader>
                <form onSubmit={handleRecord} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Customer Name</Label>
                    <Input value={form.customer_name} onChange={e => setForm({ ...form, customer_name: e.target.value })} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Scrap Category</Label>
                    <Select value={form.scrap_item} onValueChange={v => setForm({ ...form, scrap_item: v })} required>
                      <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                      <SelectContent>
                        {SCRAP_CATEGORIES.map(cat => (
                          <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Model</Label>
                    <Input value={form.scrap_model} onChange={e => setForm({ ...form, scrap_model: e.target.value })} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Quantity</Label>
                    <Input type="number" min="1" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Scrap Value (₹) <span className="text-muted-foreground text-xs">(optional)</span></Label>
                    <Input type="number" value={form.scrap_value} onChange={e => setForm({ ...form, scrap_value: e.target.value })} min="0" />
                  </div>
                  <Button type="submit" className="w-full" disabled={!form.scrap_item}>Record Entry</Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Stats */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Scrap In Stock</CardTitle>
              <PackageOpen className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">{entries.filter(e => e.status === 'IN').reduce((s, e) => s + e.quantity, 0)}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total In Value</CardTitle>
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">₹{totalInValue.toLocaleString('en-IN')}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Out Value</CardTitle>
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">₹{totalOutValue.toLocaleString('en-IN')}</div></CardContent>
          </Card>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search scrap entries..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 max-w-md" />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-pulse text-muted-foreground">Loading scrap entries...</div>
          </div>
        ) : (
          <Tabs defaultValue="in">
            <TabsList>
              <TabsTrigger value="in">In Stock ({inEntries.length})</TabsTrigger>
              <TabsTrigger value="out">Out ({outEntries.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="in">
              <Card><CardContent className="pt-6">{renderTable(inEntries, true)}</CardContent></Card>
            </TabsContent>
            <TabsContent value="out">
              <Card><CardContent className="pt-6">{renderTable(outEntries, false)}</CardContent></Card>
            </TabsContent>
          </Tabs>
        )}

        {/* Mark Out Confirmation */}
        <AlertDialog open={!!entryToMarkOut} onOpenChange={() => setEntryToMarkOut(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Mark Scrap as Out?</AlertDialogTitle>
              <AlertDialogDescription>
                This will mark "{entryToMarkOut?.scrap_item} - {entryToMarkOut?.scrap_model}" as out from the shop.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleMarkOut}>Confirm</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}
