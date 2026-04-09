import { useEffect, useState } from 'react';
import { ArrowUpCircle, ArrowDownCircle, Search, RefreshCw, ShoppingCart, Package, Trash2 } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { StockTransaction, Profile, Product } from '@/types/database';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { usePollingRefresh } from '@/hooks/usePollingRefresh';
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

interface ScrapTransactionRow {
  key: string;
  date: string;
  customer_name: string;
  scrap_item: string;
  scrap_model: string;
  quantity: number;
  scrap_value: number;
  type: 'IN' | 'OUT';
  recorded_by: string;
}

interface SaleRecord {
  id: string;
  created_at: string;
  customer_name: string;
  payment_method: string;
  total_amount: number;
  sold_by: string;
  items: SaleItemRecord[];
}

interface SaleItemRecord {
  id: string;
  product_id: string;
  model_number: string;
  quantity: number;
  price: number;
  product?: Product | null;
}

type StockTypeFilter = 'ALL' | 'IN' | 'OUT';
type DateRangeFilter = 'ALL' | 'TODAY' | '7D' | '30D' | '90D';

export default function Transactions() {
  const { hasRole } = useAuth();
  const { toast } = useToast();
  const [transactions, setTransactions] = useState<StockTransaction[]>([]);
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [scrapEntries, setScrapEntries] = useState<ScrapEntry[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stockTypeFilter, setStockTypeFilter] = useState<StockTypeFilter>('ALL');
  const [dateRange, setDateRange] = useState<DateRangeFilter>('30D');
  const [refreshing, setRefreshing] = useState(false);
  const [deletingSaleId, setDeletingSaleId] = useState<string | null>(null);
  const [saleToDelete, setSaleToDelete] = useState<SaleRecord | null>(null);
  const [transactionToDelete, setTransactionToDelete] = useState<StockTransaction | null>(null);
  const [deletingTransactionId, setDeletingTransactionId] = useState<string | null>(null);

  const isAdmin = hasRole('admin');

  const fetchData = async () => {
    try {
      const [transRes, salesRes, scrapRes, profilesRes] = await Promise.all([
        supabase
          .from('stock_transactions')
          .select('*, product:products(*)')
          .order('created_at', { ascending: false }),
        supabase
          .from('warehouse_sales')
          .select('*, items:warehouse_sale_items(*, product:products(*))')
          .order('created_at', { ascending: false }),
        supabase
          .from('scrap_entries')
          .select('*')
          .order('created_at', { ascending: false }),
        supabase.from('profiles').select('*'),
      ]);

      setTransactions((transRes.data as StockTransaction[]) || []);
      setSales((salesRes.data as SaleRecord[]) || []);
      setScrapEntries((scrapRes.data as ScrapEntry[]) || []);
      setProfiles((profilesRes.data as Profile[]) || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  usePollingRefresh(fetchData, 30000);

  const isWithinSelectedRange = (dateValue: string) => {
    if (dateRange === 'ALL') return true;

    const entryDate = new Date(dateValue);
    const now = new Date();
    const rangeStart = new Date(now);

    if (dateRange === 'TODAY') {
      rangeStart.setHours(0, 0, 0, 0);
    } else if (dateRange === '7D') {
      rangeStart.setDate(now.getDate() - 7);
    } else if (dateRange === '30D') {
      rangeStart.setDate(now.getDate() - 30);
    } else if (dateRange === '90D') {
      rangeStart.setDate(now.getDate() - 90);
    }

    return entryDate >= rangeStart;
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
  };

  const getProfileName = (userId: string) => {
    const profile = profiles.find(p => p.user_id === userId);
    return profile?.name || 'Unknown';
  };

  const filteredTransactions = transactions
    .filter((trans, index, arr) => arr.findIndex(t => t.id === trans.id) === index)
    .filter(trans => {
      if (stockTypeFilter !== 'ALL' && trans.transaction_type !== stockTypeFilter) {
        return false;
      }

      if (!isWithinSelectedRange(trans.created_at)) {
        return false;
      }

      const searchLower = search.trim().toLowerCase();
      if (!searchLower) return true;

      const productName = trans.product?.name?.toLowerCase() || '';
      const productModel = trans.product?.model?.toLowerCase() || '';
      const remarks = trans.remarks?.toLowerCase() || '';
      const source = trans.source?.toLowerCase() || '';
      const type = trans.transaction_type?.toLowerCase() || '';
      const combinedName = `${productName} ${productModel} ${remarks} ${source} ${type}`;

      const searchTerms = searchLower.split(/\s+/);
      return searchTerms.every(term => combinedName.includes(term));
    });

  const filteredSales = sales.filter((sale) => {
    if (!isWithinSelectedRange(sale.created_at)) {
      return false;
    }

    const searchLower = search.trim().toLowerCase();
    if (!searchLower) return true;

    const customerName = sale.customer_name?.toLowerCase() || 'walking customer';
    const paymentMethod = sale.payment_method?.toLowerCase() || '';
    const itemSummary = (sale.items || [])
      .map((item) => `${item.product?.name || ''} ${item.product?.model || ''} ${item.model_number || ''}`)
      .join(' ')
      .toLowerCase();

    const combined = `${customerName} ${paymentMethod} ${itemSummary}`;
    const searchTerms = searchLower.split(/\s+/);
    return searchTerms.every((term) => combined.includes(term));
  });

  // Build dual IN/OUT rows for scrap transactions
  const scrapTransactionRows: ScrapTransactionRow[] = [];
  for (const entry of scrapEntries) {
    // Every entry has an IN record (when it was created)
    scrapTransactionRows.push({
      key: `${entry.id}-in`,
      date: entry.created_at,
      customer_name: entry.customer_name,
      scrap_item: entry.scrap_item,
      scrap_model: entry.scrap_model,
      quantity: entry.quantity || 1,
      scrap_value: entry.scrap_value,
      type: 'IN',
      recorded_by: entry.recorded_by,
    });
    // If status is OUT, also add an OUT record
    if (entry.status === 'OUT' && entry.marked_out_at) {
      scrapTransactionRows.push({
        key: `${entry.id}-out`,
        date: entry.marked_out_at,
        customer_name: entry.customer_name,
        scrap_item: entry.scrap_item,
        scrap_model: entry.scrap_model,
        quantity: entry.quantity || 1,
        scrap_value: entry.scrap_value,
        type: 'OUT',
        recorded_by: entry.marked_out_by || entry.recorded_by,
      });
    }
  }
  // Sort by date descending
  scrapTransactionRows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const filteredScrapRows = scrapTransactionRows.filter(row => {
    if (!isWithinSelectedRange(row.date)) {
      return false;
    }

    const searchLower = search.trim().toLowerCase();
    if (!searchLower) return true;

    const customer = row.customer_name.toLowerCase();
    const item = row.scrap_item.toLowerCase();
    const model = row.scrap_model.toLowerCase();
    const type = row.type.toLowerCase();
    const combined = `${customer} ${item} ${model} ${type}`;

    const searchTerms = searchLower.split(/\s+/);
    return searchTerms.every(term => combined.includes(term));
  });

  // Handle delete Stock In transaction
  const handleDeleteTransaction = async () => {
    if (!transactionToDelete || deletingTransactionId || transactionToDelete.transaction_type !== 'IN') return;
    setDeletingTransactionId(transactionToDelete.id);

    try {
      // Get current stock
      const { data: currentStock, error: stockError } = await supabase
        .from('warehouse_stock')
        .select('quantity')
        .eq('product_id', transactionToDelete.product_id)
        .single();

      if (stockError) throw stockError;

      // Calculate new quantity (subtract the previously added stock)
      const newQuantity = (currentStock?.quantity || 0) - transactionToDelete.quantity;
      if (newQuantity < 0) {
        throw new Error('Cannot revert. Removing this stock in would result in negative quantity.');
      }

      // Update stock
      const { error: updateError } = await supabase
        .from('warehouse_stock')
        .update({ quantity: newQuantity })
        .eq('product_id', transactionToDelete.product_id);

      if (updateError) throw updateError;

      // Delete the transaction record
      const { error: deleteError } = await supabase
        .from('stock_transactions')
        .delete()
        .eq('id', transactionToDelete.id);

      if (deleteError) throw deleteError;

      toast({ title: 'Transaction reverted successfully', description: 'Stock has been adjusted' });
      setTransactionToDelete(null);
      fetchData();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      toast({ title: 'Error reverting transaction', description: errorMessage, variant: 'destructive' });
    } finally {
      setDeletingTransactionId(null);
    }
  };

  // Handle delete sale - reverts the sale and restores stock
  const handleDeleteSale = async () => {
    if (!saleToDelete || deletingSaleId) return;

    setDeletingSaleId(saleToDelete.id);

    try {
      // First, get the sale items to restore stock
      const { data: saleItems, error: fetchItemsError } = await supabase
        .from('warehouse_sale_items')
        .select('*')
        .eq('sale_id', saleToDelete.id);

      if (fetchItemsError) throw fetchItemsError;

      // Restore stock for each item
      for (const item of saleItems || []) {
        // Get current stock
        const { data: currentStock, error: stockError } = await supabase
          .from('warehouse_stock')
          .select('quantity')
          .eq('product_id', item.product_id)
          .single();

        if (stockError) throw stockError;

        // Calculate new quantity (add back the sold quantity)
        const newQuantity = (currentStock?.quantity || 0) + item.quantity;

        // Update stock
        const { error: updateError } = await supabase
          .from('warehouse_stock')
          .update({ quantity: newQuantity })
          .eq('product_id', item.product_id);

        if (updateError) throw updateError;
      }

      // Delete sale items first (due to foreign key)
      const { error: deleteItemsError } = await supabase
        .from('warehouse_sale_items')
        .delete()
        .eq('sale_id', saleToDelete.id);

      if (deleteItemsError) throw deleteItemsError;

      // Delete the sale
      const { error: deleteSaleError } = await supabase
        .from('warehouse_sales')
        .delete()
        .eq('id', saleToDelete.id);

      if (deleteSaleError) throw deleteSaleError;

      toast({ title: 'Sale reverted successfully', description: 'Stock has been restored' });
      setSaleToDelete(null);
      fetchData();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      toast({ title: 'Error reverting sale', description: errorMessage, variant: 'destructive' });
    } finally {
      setDeletingSaleId(null);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Transactions</h1>
          <p className="text-muted-foreground">View stock movement, sales, and scrap history with live refresh and filters.</p>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search transactions..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 max-w-md"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Select value={stockTypeFilter} onValueChange={(value) => setStockTypeFilter(value as StockTypeFilter)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Stock movement" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All stock movement</SelectItem>
                <SelectItem value="IN">Stock in only</SelectItem>
                <SelectItem value="OUT">Stock out only</SelectItem>
              </SelectContent>
            </Select>

            <Select value={dateRange} onValueChange={(value) => setDateRange(value as DateRangeFilter)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Date range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TODAY">Today</SelectItem>
                <SelectItem value="7D">Last 7 days</SelectItem>
                <SelectItem value="30D">Last 30 days</SelectItem>
                <SelectItem value="90D">Last 90 days</SelectItem>
                <SelectItem value="ALL">All dates</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-pulse text-muted-foreground">Loading transactions...</div>
          </div>
        ) : (
          <Tabs defaultValue="stock" className="w-full">
            <TabsList className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/5 p-1 rounded-xl w-fit mb-4">
              <TabsTrigger value="stock" className="rounded-lg data-[state=active]:bg-slate-100 dark:bg-[#1B2438] data-[state=active]:text-[#4F8CFF] data-[state=active]:shadow-sm">Stock Movement ({filteredTransactions.length})</TabsTrigger>
              <TabsTrigger value="sales" className="rounded-lg data-[state=active]:bg-slate-100 dark:bg-[#1B2438] data-[state=active]:text-emerald-500 data-[state=active]:shadow-sm">Sales ({filteredSales.length})</TabsTrigger>
              <TabsTrigger value="scrap" className="rounded-lg data-[state=active]:bg-slate-100 dark:bg-[#1B2438] data-[state=active]:text-[#4F8CFF] data-[state=active]:shadow-sm">Scrap ({filteredScrapRows.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="stock" className="mt-4">
              <div className="space-y-6 relative before:absolute before:left-[70px] sm:before:left-[110px] before:top-2 before:bottom-2 before:w-px before:bg-white/10 ml-0 sm:ml-4 animate-in fade-in duration-500 pb-12">
                {filteredTransactions.length === 0 ? (
                  <div className="text-center text-slate-600 dark:text-slate-500 py-12 font-medium">No transactions found</div>
                ) : (
                  filteredTransactions.map((trans) => {
                    const isIn = trans.transaction_type === 'IN';
                    const typeColor = isIn ? 'text-[#4F8CFF] bg-[#4F8CFF]/10 border-[#4F8CFF]/20 shadow-[0_0_10px_rgba(79,140,255,0.2)]' : 'text-red-400 bg-red-400/10 border-red-400/20 shadow-[0_0_10px_rgba(248,113,113,0.2)]';
                    const qtyColor = isIn ? 'text-[#4F8CFF]' : 'text-red-400';
                    const sign = isIn ? '+' : '-';

                    return (
                      <div key={trans.id} className="relative flex gap-4 sm:gap-8 items-start group overflow-hidden sm:overflow-visible p-1 sm:p-0">
                        <div className="w-14 sm:w-20 shrink-0 text-right pt-4 relative z-10 pl-0 sm:pl-2">
                          <div className="text-[11px] font-bold text-slate-600 dark:text-slate-500 dark:text-slate-400 uppercase tracking-widest leading-tight">{format(new Date(trans.created_at), 'MMM dd')}</div>
                          <div className="text-[10px] text-slate-600 dark:text-slate-500 font-medium">{format(new Date(trans.created_at), 'HH:mm')}</div>
                          <div className="absolute right-[-23px] sm:right-[-37px] top-[22px] w-3 h-3 rounded-full bg-white dark:bg-[#111827] border-2 border-[#4F8CFF] shadow-[0_0_8px_rgba(79,140,255,0.5)] group-hover:scale-[1.7] transition-transform duration-300" />
                        </div>
                        <div className="flex-1 bg-white dark:bg-[#111827]/80 backdrop-blur-xl border border-slate-200 dark:border-white/5 rounded-2xl p-6 hover:-translate-y-1 hover:bg-slate-50 dark:bg-[#151C2F] hover:border-[#4F8CFF]/30 hover:shadow-[0_8px_32px_rgba(0,0,0,0.3)] transition-all duration-300 cursor-pointer">
                          <div className="flex flex-col sm:flex-row gap-4 sm:items-center justify-between">
                            <div className="space-y-2">
                              <div className="flex items-center gap-3 flex-wrap">
                                <h3 className="font-bold text-slate-800 dark:text-slate-200 text-lg tracking-wide group-hover:text-slate-900 dark:hover:text-white transition-colors">{trans.product?.name} <span className="font-normal text-slate-600 dark:text-slate-500 dark:text-slate-400 text-sm ml-1">- {trans.product?.model}</span></h3>
                                <Badge variant="outline" className={`px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-bold ${typeColor}`}>
                                  {isIn ? 'STOCK IN' : 'STOCK OUT'}
                                </Badge>
                                <Badge variant="outline" className="bg-slate-50 dark:bg-[#0B0F19] text-slate-600 dark:text-slate-500 dark:text-slate-400 border-slate-200 dark:border-white/10">{trans.source}</Badge>
                              </div>
                              <p className="text-[13px] text-slate-600 dark:text-slate-500 max-w-lg truncate italic group-hover:text-slate-600 dark:text-slate-500 dark:text-slate-400 transition-colors">"{trans.remarks || 'No remarks provided'}"</p>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="flex flex-col items-end gap-1 shrink-0">
                                <div className={`text-2xl font-black drop-shadow-md tracking-tight ${qtyColor}`}>
                                  {sign}{trans.quantity}
                                </div>
                                <p className="text-[10px] text-slate-600 dark:text-slate-500 uppercase tracking-widest font-bold max-w-[120px] sm:max-w-none truncate" title={`By ${getProfileName(trans.handled_by)}`}>By {getProfileName(trans.handled_by)}</p>
                              </div>
                              {isAdmin && isIn && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 rounded-full text-slate-500 hover:text-red-500 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setTransactionToDelete(trans);
                                  }}
                                  title="Revert this transaction"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </TabsContent>

            <TabsContent value="sales" className="mt-4">
              <div className="space-y-6 relative before:absolute before:left-[70px] sm:before:left-[110px] before:top-2 before:bottom-2 before:w-px before:bg-white/10 ml-0 sm:ml-4 animate-in fade-in duration-500 pb-12">
                {filteredSales.length === 0 ? (
                  <div className="text-center text-slate-600 dark:text-slate-500 py-12 font-medium">No sales found</div>
                ) : (
                  filteredSales.map((sale) => {
                    const totalQty = sale.items?.reduce((acc, cur) => acc + (cur.quantity || 0), 0) || 0;
                    
                    return (
                      <div key={sale.id} className="relative flex gap-4 sm:gap-8 items-start group overflow-hidden sm:overflow-visible p-1 sm:p-0">
                        <div className="w-14 sm:w-20 shrink-0 text-right pt-4 relative z-10 pl-0 sm:pl-2">
                          <div className="text-[11px] font-bold text-slate-600 dark:text-slate-500 dark:text-slate-400 uppercase tracking-widest leading-tight">{format(new Date(sale.created_at), 'MMM dd')}</div>
                          <div className="text-[10px] text-slate-600 dark:text-slate-500 font-medium">{format(new Date(sale.created_at), 'HH:mm')}</div>
                          <div className="absolute right-[-23px] sm:right-[-37px] top-[22px] w-3 h-3 rounded-full bg-white dark:bg-[#111827] border-2 border-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] group-hover:scale-[1.7] transition-transform duration-300" />
                        </div>
                        <div className="flex-1 bg-white dark:bg-[#111827]/80 backdrop-blur-xl border border-slate-200 dark:border-white/5 rounded-2xl p-6 hover:-translate-y-1 hover:bg-slate-50 dark:bg-[#151C2F] hover:border-emerald-500/30 hover:shadow-[0_8px_32px_rgba(0,0,0,0.3)] transition-all duration-300 cursor-pointer">
                          <div className="flex flex-col sm:flex-row gap-4 sm:items-center justify-between">
                            <div className="space-y-2">
                              <div className="flex items-center gap-3 flex-wrap">
                                <h3 className="font-bold text-slate-800 dark:text-slate-200 text-lg tracking-wide group-hover:text-slate-900 dark:hover:text-white transition-colors">{sale.customer_name || 'Walking Customer'}</h3>
                                <Badge variant="outline" className="px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-bold text-emerald-500 bg-emerald-500/10 border-emerald-500/20">
                                  SALE
                                </Badge>
                                <Badge variant="outline" className="bg-slate-50 dark:bg-[#0B0F19] text-slate-600 dark:text-slate-500 dark:text-slate-400 border-slate-200 dark:border-white/10">{sale.payment_method}</Badge>
                              </div>
{sale.items && sale.items.length > 0 && (
                                <div className="text-[11px] text-muted-foreground flex flex-wrap gap-1">
                                  {sale.items.map((item, idx) => (
                                    <span key={idx} className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                                      {item.quantity}x {item.product?.model || item.model_number}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="flex flex-col items-end gap-1 shrink-0">
                                <div className="text-2xl font-black drop-shadow-md tracking-tight text-red-400">
                                  -{totalQty}
                                </div>
                                <div className="text-sm font-bold text-emerald-500">
                                  Rs. {sale.total_amount?.toLocaleString('en-IN')}
                                </div>
                                <p className="text-[10px] text-slate-600 dark:text-slate-500 uppercase tracking-widest font-bold max-w-[120px] sm:max-w-none truncate" title={`By ${getProfileName(sale.sold_by)}`}>By {getProfileName(sale.sold_by)}</p>
                              </div>
                              {isAdmin && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 rounded-full text-slate-500 hover:text-red-500 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSaleToDelete(sale);
                                  }}
                                  title="Revert this sale"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </TabsContent>

            <TabsContent value="scrap" className="mt-4">
              <div className="space-y-6 relative before:absolute before:left-[70px] sm:before:left-[110px] before:top-2 before:bottom-2 before:w-px before:bg-white/10 ml-0 sm:ml-4 animate-in fade-in duration-500 pb-12">
                {filteredScrapRows.length === 0 ? (
                  <div className="text-center text-slate-600 dark:text-slate-500 py-12 font-medium">No scrap transactions found</div>
                ) : (
                  filteredScrapRows.map((row) => {
                    const isIn = row.type === 'IN';
                    const typeColor = isIn ? 'text-[#4F8CFF] bg-[#4F8CFF]/10 border-[#4F8CFF]/20 shadow-[0_0_10px_rgba(79,140,255,0.2)]' : 'text-amber-500 bg-amber-500/10 border-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.2)]';
                    const qtyColor = isIn ? 'text-[#4F8CFF]' : 'text-amber-500';
                    const sign = isIn ? '+' : '-';

                    return (
                      <div key={row.key} className="relative flex gap-4 sm:gap-8 items-start group overflow-hidden sm:overflow-visible p-1 sm:p-0">
                        <div className="w-14 sm:w-20 shrink-0 text-right pt-4 relative z-10 pl-0 sm:pl-2">
                          <div className="text-[11px] font-bold text-slate-600 dark:text-slate-500 dark:text-slate-400 uppercase tracking-widest leading-tight">{format(new Date(row.date), 'MMM dd')}</div>
                          <div className="text-[10px] text-slate-600 dark:text-slate-500 font-medium">{format(new Date(row.date), 'HH:mm')}</div>
                          <div className={`absolute right-[-23px] sm:right-[-37px] top-[22px] w-3 h-3 rounded-full border-2 bg-white dark:bg-[#111827] group-hover:scale-[1.7] transition-transform duration-300 ${isIn ? 'border-[#4F8CFF] shadow-[0_0_8px_rgba(79,140,255,0.5)]' : 'border-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]'}`} />
                        </div>
                        <div className="flex-1 bg-white dark:bg-[#111827]/80 backdrop-blur-xl border border-slate-200 dark:border-white/5 rounded-2xl p-6 hover:-translate-y-1 hover:bg-slate-50 dark:bg-[#151C2F] hover:border-[#4F8CFF]/30 hover:shadow-[0_8px_32px_rgba(0,0,0,0.3)] transition-all duration-300 cursor-pointer">
                          <div className="flex flex-col sm:flex-row gap-4 sm:items-center justify-between">
                            <div className="space-y-2">
                              <div className="flex items-center gap-3 flex-wrap">
                                <h3 className="font-bold text-slate-800 dark:text-slate-200 text-lg tracking-wide group-hover:text-slate-900 dark:hover:text-white transition-colors">{row.customer_name}</h3>
                                <Badge variant="outline" className={`px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-bold ${typeColor}`}>
                                  SCRAP {row.type}
                                </Badge>
                                <Badge variant="outline" className="bg-slate-50 dark:bg-[#0B0F19] text-slate-600 dark:text-slate-500 dark:text-slate-400 border-slate-200 dark:border-white/10">{row.scrap_item}</Badge>
                              </div>
                              <p className="text-[13px] text-slate-600 dark:text-slate-500 max-w-lg truncate">{row.scrap_model}</p>
                            </div>
                            <div className="flex items-center gap-8 border-t sm:border-t-0 sm:border-l border-slate-200 dark:border-white/10 pt-4 sm:pt-0 sm:pl-6 mt-2 sm:mt-0">
                              <div className="text-right">
                                <p className="text-[10px] text-slate-600 dark:text-slate-500 uppercase tracking-widest font-bold mb-1">Value</p>
                                <div className="text-lg font-bold text-emerald-400 drop-shadow-md tracking-tight">Rs. {row.scrap_value.toLocaleString('en-IN')}</div>
                              </div>
                              <div className="text-right">
                                <p className="text-[10px] text-slate-600 dark:text-slate-500 uppercase tracking-widest font-bold mb-1">Qty</p>
                                <div className={`text-xl font-black drop-shadow-md tracking-tight ${qtyColor}`}>{sign}{row.quantity}</div>
                              </div>
                              <div className="text-right">
                                <p className="text-[10px] text-slate-600 dark:text-slate-500 uppercase tracking-widest font-bold mb-1">By</p>
                                <p className="text-xs font-medium text-slate-700 dark:text-slate-300 max-w-[100px] sm:max-w-none truncate" title={getProfileName(row.recorded_by)}>{getProfileName(row.recorded_by)}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </div>
      {/* Delete Sale Confirmation Dialog */}
      <AlertDialog open={!!saleToDelete} onOpenChange={() => !deletingSaleId && setSaleToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revert This Sale?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the sale record and restore the stock quantities. 
              This action cannot be undone.
              {saleToDelete && (
                <div className="mt-2 p-2 bg-muted rounded-md text-sm">
                  <p><strong>Customer:</strong> {saleToDelete.customer_name || 'Walking Customer'}</p>
                  <p><strong>Amount:</strong> Rs. {saleToDelete.total_amount?.toLocaleString('en-IN')}</p>
                  <p><strong>Items:</strong> {saleToDelete.items?.length || 0} product(s)</p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!deletingSaleId}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSale}
              disabled={!!deletingSaleId}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              {deletingSaleId ? 'Reverting...' : 'Yes, Revert Sale'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Transaction Confirmation Dialog */}
      <AlertDialog open={!!transactionToDelete} onOpenChange={() => !deletingTransactionId && setTransactionToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revert This Stock In?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this record and reduce the warehouse stock quantity.
              This action cannot be undone.
              {transactionToDelete && (
                <div className="mt-2 p-2 bg-muted rounded-md text-sm">
                  <p><strong>Product:</strong> {transactionToDelete.product?.name || 'Unknown'}</p>
                  <p><strong>Quantity:</strong> {transactionToDelete.quantity}</p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!deletingTransactionId}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTransaction}
              disabled={!!deletingTransactionId}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              {deletingTransactionId ? 'Reverting...' : 'Yes, Revert'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
