import { useEffect, useState } from 'react';
import { Recycle, PackageOpen, Check, TrendingUp, TrendingDown, Trash2, Plus, X, Download } from 'lucide-react';
import { SearchBar } from '@/components/ui/SearchBar';
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
import { downloadCSV } from '@/utils/exportUtils';
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
  aged_battery_id?: string | null;
}

type ScrapCategory = (typeof SCRAP_CATEGORIES)[number];

interface ScrapFormLine {
  id: string;
  scrap_item: ScrapCategory | '';
  scrap_model: string;
  scrap_value: string;
  quantity: string;
}

interface ScrapFormState {
  customer_name: string;
  lines: ScrapFormLine[];
}

const createScrapFormLine = (): ScrapFormLine => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  scrap_item: '',
  scrap_model: '',
  scrap_value: '',
  quantity: '1',
});

export default function Scrap() {
  const { user, hasAnyRole } = useAuth();
  const { toast } = useToast();
  const [entries, setEntries] = useState<ScrapEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isRecordOpen, setIsRecordOpen] = useState(false);
  const [entryToMarkOut, setEntryToMarkOut] = useState<ScrapEntry | null>(null);
  const [entryToDelete, setEntryToDelete] = useState<ScrapEntry | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const initialFormState: ScrapFormState = {
    customer_name: '',
    lines: [createScrapFormLine()],
  };

  const [form, setForm] = useState<ScrapFormState>(initialFormState);

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

  const resetForm = () => {
    setForm({
      customer_name: '',
      lines: [createScrapFormLine()],
    });
  };

  const addFormLine = () => {
    setForm((currentForm) => ({
      ...currentForm,
      lines: [...currentForm.lines, createScrapFormLine()],
    }));
  };

  const removeFormLine = (lineId: string) => {
    setForm((currentForm) => ({
      ...currentForm,
      lines: currentForm.lines.length === 1
        ? currentForm.lines
        : currentForm.lines.filter((line) => line.id !== lineId),
    }));
  };

  const updateFormLine = (lineId: string, field: keyof Omit<ScrapFormLine, 'id'>, value: string) => {
    setForm((currentForm) => ({
      ...currentForm,
      lines: currentForm.lines.map((line) => (
        line.id === lineId
          ? { ...line, [field]: value }
          : line
      )),
    }));
  };

  const handleRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const customerName = form.customer_name.trim();
    const activeLines = form.lines.filter((line) =>
      line.scrap_item || line.scrap_model.trim() || line.scrap_value.trim() || line.quantity.trim()
    );

    if (!customerName) {
      toast({ title: 'Customer name is required', variant: 'destructive' });
      return;
    }

    if (activeLines.length === 0) {
      toast({ title: 'Add at least one scrap item', variant: 'destructive' });
      return;
    }

    const hasIncompleteLine = activeLines.some((line) => !line.scrap_item || !line.scrap_model.trim());
    if (hasIncompleteLine) {
      toast({ title: 'Each scrap row needs a category and model', variant: 'destructive' });
      return;
    }

    const payload = activeLines.map((line) => ({
      customer_name: customerName,
      scrap_item: line.scrap_item,
      scrap_model: line.scrap_model.trim(),
      scrap_value: parseFloat(line.scrap_value) || 0,
      quantity: Math.max(1, parseInt(line.quantity) || 1),
      recorded_by: user.id,
    }));

    try {
      setSubmitting(true);
      const { error } = await supabase.from('scrap_entries').insert(payload);
      if (error) throw error;
      toast({
        title: payload.length === 1 ? 'Scrap entry recorded' : 'Scrap entries recorded',
        description: `${payload.length} item(s) added to the scrap register.`,
      });
      setIsRecordOpen(false);
      resetForm();
      fetchEntries();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'An error occurred';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      setSubmitting(false);
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

  const handleDelete = async () => {
    if (!entryToDelete) return;
    try {
      console.log("RPC DELETE SCRAP:", { p_scrap_id: entryToDelete.id });
      
      const { data, error } = await supabase.rpc('delete_scrap_entry', {
        p_scrap_id: entryToDelete.id
      });
      
      if (error) {
        console.error("Delete scrap failed:", error);
        throw error;
      }
      
      console.log("Delete scrap response:", data);
      toast({ title: 'Scrap entry deleted' });
      setEntryToDelete(null);
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

  const totalInUnits = entries.filter(e => e.status === 'IN').reduce((s, e) => s + (e.quantity || 0), 0);
  const totalOutUnits = entries.filter(e => e.status === 'OUT').reduce((s, e) => s + (e.quantity || 0), 0);

  const formatScrapForExport = (entries: ScrapEntry[]) => {
    const formatted = entries.map(entry => ({
      'Customer': entry.customer_name,
      'Category': entry.scrap_item,
      'Model': entry.scrap_model,
      'Qty': entry.quantity,
      'Value (Rs.)': entry.scrap_value || 0,
      'Date': format(new Date(entry.created_at), 'dd/MM/yyyy'),
      'Status': entry.status,
    }));
    
    // Add totals row
    if (formatted.length > 0) {
      const totalQty = entries.reduce((sum, e) => sum + (e.quantity || 0), 0);
      const totalValue = entries.reduce((sum, e) => sum + (e.scrap_value || 0), 0);
      formatted.push({
        'Customer': 'TOTAL',
        'Category': '',
        'Model': '',
        'Qty': totalQty,
        'Value (Rs.)': totalValue,
        'Date': '',
        'Status': '',
      });
    }
    return formatted;
  };

  const handleExportStatus = (entries: ScrapEntry[]) => {
    if (entries.length === 0) {
      toast({ title: 'No entries to export', variant: 'destructive' });
      return;
    }
    const formatted = formatScrapForExport(entries);
    const dateStr = format(new Date(), 'dd-MM-yyyy');
    const inCount = entries.filter(e => e.status === 'IN').length;
    const outCount = entries.filter(e => e.status === 'OUT').length;
    downloadCSV(formatted, `scrap-status-${dateStr}`);
    toast({ title: `Exported ${entries.length} entries`, description: `IN: ${inCount} | OUT: ${outCount}` });
  };

  const renderTable = (items: ScrapEntry[], showMarkOut: boolean) => (
    <div className="overflow-x-auto">
      <Table className="w-full text-sm">
        <TableHeader className="bg-slate-50 dark:bg-[#0B0F19]">
          <TableRow className="border-slate-200 dark:border-white/5 hover:bg-transparent">
            <TableHead className="font-semibold text-slate-600 dark:text-slate-500 tracking-wider uppercase text-xs py-4">Customer</TableHead>
            <TableHead className="font-semibold text-slate-600 dark:text-slate-500 tracking-wider uppercase text-xs py-4">Category</TableHead>
            <TableHead className="font-semibold text-slate-600 dark:text-slate-500 tracking-wider uppercase text-xs py-4">Model</TableHead>
            <TableHead className="font-semibold text-slate-600 dark:text-slate-500 tracking-wider uppercase text-xs text-right py-4">Qty</TableHead>
            <TableHead className="font-semibold text-slate-600 dark:text-slate-500 tracking-wider uppercase text-xs text-right py-4">Value (Rs.)</TableHead>
            <TableHead className="font-semibold text-slate-600 dark:text-slate-500 tracking-wider uppercase text-xs py-4">Date</TableHead>
            <TableHead className="font-semibold text-slate-600 dark:text-slate-500 tracking-wider uppercase text-xs py-4">Status</TableHead>
            {canManage && <TableHead className="font-semibold text-slate-600 dark:text-slate-500 tracking-wider uppercase text-xs w-[180px] py-4">Action</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow className="border-slate-200 dark:border-white/5">
              <TableCell colSpan={canManage ? 8 : 7} className="text-center text-slate-600 dark:text-slate-500 py-12 font-medium">
                No entries found
              </TableCell>
            </TableRow>
          ) : items.map((entry, i) => (
            <TableRow key={entry.id} className="group border-slate-200 dark:border-white/5 hover:bg-white dark:bg-[#111827] transition-colors duration-300">
              <TableCell className="font-semibold text-slate-800 dark:text-slate-200 py-4">{entry.customer_name}</TableCell>
              <TableCell><Badge variant="outline" className="bg-white dark:bg-[#111827] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-white/5">{entry.scrap_item}</Badge></TableCell>
              <TableCell className="text-slate-600 dark:text-slate-500 dark:text-slate-400">{entry.scrap_model}</TableCell>
              <TableCell className="text-right font-bold text-slate-900 dark:text-white tabular-nums drop-shadow-sm">{entry.quantity}</TableCell>
              <TableCell className="text-right font-medium text-emerald-400 tabular-nums">Rs. {entry.scrap_value.toLocaleString('en-IN')}</TableCell>
              <TableCell className="text-slate-600 dark:text-slate-500 text-sm tabular-nums">{format(new Date(entry.created_at), 'dd/MM/yyyy')}</TableCell>
              <TableCell>
                <Badge variant="outline" className={entry.status === 'IN' ? 'bg-[#4F8CFF]/10 text-[#4F8CFF] border-[#4F8CFF]/20 font-bold tracking-wider' : 'bg-slate-500/10 text-slate-600 dark:text-slate-500 dark:text-slate-400 border-slate-500/20 font-bold tracking-wider'}>
                  {entry.status}
                </Badge>
              </TableCell>
              {canManage && (
                <TableCell>
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    {showMarkOut && (
                      <Button variant="outline" size="sm" onClick={() => setEntryToMarkOut(entry)} className="bg-transparent hover:bg-emerald-500/10 hover:text-emerald-400 border-slate-200 dark:border-white/10 hover:border-emerald-500/30">
                        <Check className="h-4 w-4 mr-1" /> Mark Out
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => setEntryToDelete(entry)} className="bg-transparent hover:bg-red-500/10 hover:text-red-400 border-slate-200 dark:border-white/10 hover:border-red-500/30">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
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
            <Dialog open={isRecordOpen} onOpenChange={(open) => {
              setIsRecordOpen(open);
              if (!open) {
                setSubmitting(false);
                resetForm();
              }
            }}>
              <DialogTrigger asChild>
                <Button><Recycle className="h-4 w-4 mr-2" />Record Scrap</Button>
              </DialogTrigger>
              <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
                <DialogHeader><DialogTitle>Record Scrap Entries</DialogTitle></DialogHeader>
                <form onSubmit={handleRecord} className="space-y-5">
                  <div className="space-y-2">
                    <Label>Customer Name</Label>
                    <Input
                      value={form.customer_name}
                      onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
                      placeholder="Enter source or customer name"
                      required
                    />
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">Scrap Lines</Label>
                      <Button type="button" variant="outline" size="sm" onClick={addFormLine}>
                        <Plus className="mr-2 h-4 w-4" />
                        Add Line
                      </Button>
                    </div>
                    <div className="space-y-3">
                      {form.lines.map((line, index) => (
                        <div key={line.id} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-[#111827]/70">
                          <div className="flex items-center justify-between">
                            <Badge variant="outline">Line {index + 1}</Badge>
                            {form.lines.length > 1 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeFormLine(line.id)}
                                className="text-red-500 hover:bg-red-500/10 hover:text-red-400"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-2">
                              <Label>Category</Label>
                              <Select
                                value={line.scrap_item}
                                onValueChange={(value) => updateFormLine(line.id, 'scrap_item', value)}
                              >
                                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                                <SelectContent>
                                  {SCRAP_CATEGORIES.map((category) => (
                                    <SelectItem key={category} value={category}>{category}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>Model</Label>
                              <Input
                                value={line.scrap_model}
                                onChange={(e) => updateFormLine(line.id, 'scrap_model', e.target.value)}
                                placeholder="Enter model"
                              />
                            </div>
                          </div>
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-2">
                              <Label>Quantity</Label>
                              <Input
                                type="number"
                                min="1"
                                value={line.quantity}
                                onChange={(e) => updateFormLine(line.id, 'quantity', e.target.value)}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Scrap Value (Rs.) <span className="text-muted-foreground text-xs">(optional)</span></Label>
                              <Input
                                type="number"
                                min="0"
                                value={line.scrap_value}
                                onChange={(e) => updateFormLine(line.id, 'scrap_value', e.target.value)}
                                placeholder="Enter value"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={submitting}>
                    {submitting ? 'Saving...' : form.lines.length === 1 ? 'Record Entry' : `Record ${form.lines.length} Entries`}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Stats */}
        <div className="grid gap-6 grid-cols-1 sm:grid-cols-3 mb-8">
          <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-[#111827]/80 backdrop-blur-xl border border-slate-200 dark:border-white/5 p-6 group hover:border-[#4F8CFF]/30 transition-colors duration-500">
            <div className="absolute -right-6 -top-6 text-[#4F8CFF]/5 transform group-hover:scale-110 group-hover:rotate-6 transition-transform duration-700">
              <PackageOpen className="w-32 h-32" />
            </div>
            <div className="relative z-10">
              <p className="text-[11px] font-bold tracking-widest text-slate-600 dark:text-slate-500 uppercase mb-3 drop-shadow-sm">Scrap In Stock</p>
              <div className="text-4xl font-black text-slate-900 dark:text-white">{entries.filter(e => e.status === 'IN').reduce((s, e) => s + e.quantity, 0)}</div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-[#111827]/80 backdrop-blur-xl border border-slate-200 dark:border-white/5 p-6 group hover:border-emerald-500/30 transition-colors duration-500">
            <div className="absolute -right-6 -top-6 text-emerald-500/5 transform group-hover:scale-110 group-hover:rotate-6 transition-transform duration-700">
              <TrendingDown className="w-32 h-32" />
            </div>
            <div className="relative z-10">
              <p className="text-[11px] font-bold tracking-widest text-slate-600 dark:text-slate-500 uppercase mb-3 drop-shadow-sm">Total In Units</p>
              <div className="text-4xl font-black text-slate-900 dark:text-white">{totalInUnits.toLocaleString('en-IN')}</div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-[#111827]/80 backdrop-blur-xl border border-slate-200 dark:border-white/5 p-6 group hover:border-amber-500/30 transition-colors duration-500">
            <div className="absolute -right-6 -top-6 text-amber-500/5 transform group-hover:scale-110 group-hover:rotate-6 transition-transform duration-700">
              <TrendingUp className="w-32 h-32" />
            </div>
            <div className="relative z-10">
              <p className="text-[11px] font-bold tracking-widest text-slate-600 dark:text-slate-500 uppercase mb-3 drop-shadow-sm">Total Out Units</p>
              <div className="text-4xl font-black text-slate-900 dark:text-white">{totalOutUnits.toLocaleString('en-IN')}</div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <SearchBar value={search} onChange={setSearch} placeholder="Search scrap entries..." className="flex-1 max-w-md" />
          <Button 
            variant="outline" 
            className="gap-2 h-10"
            onClick={() => handleExportStatus(entries)}
          >
            <Download className="h-4 w-4" />
            Export All
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-pulse text-muted-foreground">Loading scrap entries...</div>
          </div>
        ) : (
          <Tabs defaultValue="in" className="w-full">
            <TabsList className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/5 p-1 rounded-xl w-fit">
              <TabsTrigger value="in" className="rounded-lg data-[state=active]:bg-slate-100 dark:bg-[#1B2438] data-[state=active]:text-[#4F8CFF] data-[state=active]:shadow-sm">In Stock ({inEntries.length})</TabsTrigger>
              <TabsTrigger value="out" className="rounded-lg data-[state=active]:bg-slate-100 dark:bg-[#1B2438] data-[state=active]:text-[#4F8CFF] data-[state=active]:shadow-sm">Out ({outEntries.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="in" className="mt-4">
              <div className="rounded-2xl border border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-[#0B0F19] overflow-hidden shadow-sm">{renderTable(inEntries, true)}</div>
            </TabsContent>
            <TabsContent value="out" className="mt-4">
              <div className="rounded-2xl border border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-[#0B0F19] overflow-hidden shadow-sm">{renderTable(outEntries, false)}</div>
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

        {/* Delete Confirmation */}
        <AlertDialog open={!!entryToDelete} onOpenChange={() => setEntryToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Scrap Entry?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete "{entryToDelete?.scrap_item} - {entryToDelete?.scrap_model}" ({entryToDelete?.quantity} units). This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-600">Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}
