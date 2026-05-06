import { useEffect, useRef, useState, useCallback } from 'react';
import { Plus, Minus, Package, ArrowUpCircle, ArrowDownCircle, Download, Upload, AlertTriangle, Calendar, User, Phone, MapPin, ShoppingCart, FileText, ArrowLeft, ArrowRight, Trash2, Clock, Activity, Info, ArrowUpRight } from 'lucide-react';
import { SearchBar } from '@/components/ui/SearchBar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AppLayout } from '@/components/layout/AppLayout';
import { useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { Product, Profile, SecondHandLifecycleRecord, SecondHandTransactionType, SecondHandLifecycleStatus, WarehouseStock } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { usePollingRefresh } from '@/hooks/usePollingRefresh';
import { Badge } from '@/components/ui/badge';
import { SECOND_HAND_CATEGORIES, SECOND_HAND_TRANSACTION_TYPES, SECOND_HAND_TRANSACTION_LABELS, SECOND_HAND_STATUS_LABELS, isSecondHandCategory } from '@/lib/secondHand';
import * as XLSX from 'xlsx';
import { downloadCSV, formatStockForExport } from '@/utils/exportUtils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { format, differenceInDays, isPast } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface BulkUploadRow {
  'Product ID'?: string | number;
  'Product Name'?: string | number;
  'Model'?: string | number;
  'Category'?: string | number;
  'Capacity'?: string | number;
  'Current Quantity'?: string | number;
  'New Quantity'?: string | number;
}

type SecondHandPaymentMethod = 'CASH' | 'CARD' | 'UPI';

export default function SecondHand() {
  const { user, hasRole, hasAnyRole } = useAuth();
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [shStock, setShStock] = useState<WarehouseStock[]>([]);
  const [lifecycleRecords, setLifecycleRecords] = useState<SecondHandLifecycleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'stock' | 'history' | 'dashboard'>('stock');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Forms
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [productForm, setProductForm] = useState({ name: '', model: '', capacity: '', category: SECOND_HAND_CATEGORIES[0] as string, initialQuantity: '' });

  // Transaction states
  const [isTransactionOpen, setIsTransactionOpen] = useState(false);
  const [transactionType, setTransactionType] = useState<SecondHandTransactionType>('SALE');
  const [transactionForm, setTransactionForm] = useState({
    customer_name: '',
    mobile_number: '',
    address: '',
    payment_method: 'CASH' as SecondHandPaymentMethod,
    start_date: '',
    end_date: '',
    remarks: ''
  });
  const [transactionItems, setTransactionItems] = useState<{ productId: string; quantity: number; price?: number }[]>([]);
  const [transactionProductSearch, setTransactionProductSearch] = useState('');

  // Return states
  const [isReturnOpen, setIsReturnOpen] = useState(false);
  const [selectedGroupForReturn, setSelectedGroupForReturn] = useState<string | null>(null);
  const [returnForm, setReturnForm] = useState({
    returned_quantity: '',
    return_remarks: '',
    return_date: format(new Date(), 'yyyy-MM-dd')
  });
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [deletingGroups, setDeletingGroups] = useState<Set<string>>(new Set());

  // Popover states to allow auto-closing
  const [isStartDateOpen, setIsStartDateOpen] = useState(false);
  const [isEndDateOpen, setIsEndDateOpen] = useState(false);
  const [isReturnDateOpen, setIsReturnDateOpen] = useState(false);

  const isAdmin = hasRole('admin');
  const canManage = hasAnyRole(['admin', 'warehouse_staff', 'procurement_staff']);

  // Filtered SH products
  const shProducts = products.filter(p => isSecondHandCategory(p.category));
  const filteredTransactionProducts = shProducts.filter(p => {
    const stockItem = shStock.find(s => s.product_id === p.id);
    return (stockItem?.quantity || 0) > 0 &&
      !transactionItems.some(item => item.productId === p.id) &&
      (p.name.toLowerCase().includes(transactionProductSearch.toLowerCase()) ||
        p.model.toLowerCase().includes(transactionProductSearch.toLowerCase()));
  });

  useEffect(() => {
    fetchData();
    fetchLifecycle();
    fetchProfiles();

    const stockChannel = supabase
      .channel('sh-stock-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'warehouse_stock' }, () => fetchData())
      .subscribe();

    const lifecycleChannel = supabase
      .channel('sh-lifecycle-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'second_hand_lifecycle' }, () => fetchLifecycle())
      .subscribe();

    return () => {
      stockChannel.unsubscribe();
      lifecycleChannel.unsubscribe();
    };
  }, []);

  usePollingRefresh(() => {
    fetchData();
    fetchLifecycle();
  }, 60000);

  const fetchProfiles = async () => {
    const { data } = await supabase.from('profiles').select('*');
    setProfiles(data || []);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [productsRes, stockRes] = await Promise.all([
        supabase.from('products').select('*').in('category', SECOND_HAND_CATEGORIES).order('name'),
        supabase.from('warehouse_stock').select('*, product:products(*)'),
      ]);
      const shProducts = productsRes.data as Product[] || [];
      const allStock = stockRes.data as WarehouseStock[] || [];
      setProducts(shProducts);
      setShStock(allStock.filter(item => isSecondHandCategory(item.product?.category)));
    } catch (error) {
      console.error('Error fetching SH data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchLifecycle = async () => {
    try {
      const { data } = await supabase
        .from('second_hand_lifecycle')
        .select('*, product:products(*)')
        .order('transaction_group_id', { ascending: false })
        .order('created_at', { ascending: false });
      setLifecycleRecords(data || []);
    } catch (error) {
      console.error('Error fetching lifecycle:', error);
    }
  };

  const getProfileName = (userId: string) => profiles.find(p => p.id === userId || p.user_id === userId)?.name || 'N/A';

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const nameWithPrefix = `SH ${productForm.name}`; // Always prefix
    try {
      const { data: product } = await supabase
        .from('products')
        .insert({
          name: nameWithPrefix,
          model: productForm.model,
          capacity: productForm.capacity || null,
          category: productForm.category,
        })
        .select()
        .single();

      const initialQty = parseInt(productForm.initialQuantity) || 0;
      if (initialQty > 0) {
        await supabase.from('warehouse_stock').insert({ product_id: product!.id, quantity: initialQty });
      }

      toast({ title: 'SH Product added' });
      setIsAddProductOpen(false);
      setProductForm({ name: '', model: '', capacity: '', category: SECOND_HAND_CATEGORIES[0], initialQuantity: '' });
      fetchData();
    } catch (error) {
      toast({ title: 'Error adding product', variant: 'destructive' });
    }
  };

  // Transaction handlers
  const addToTransaction = (productId: string) => {
    if (transactionItems.some(item => item.productId === productId)) return;
    setTransactionItems([...transactionItems, { productId, quantity: 1, price: 0 }]);
    setTransactionProductSearch('');
  };

  const updateTransactionQty = (productId: string, quantity: number) => {
    setTransactionItems(items => items.map(item =>
      item.productId === productId ? { ...item, quantity: Math.max(1, quantity) } : item
    ));
  };

  const updateTransactionPrice = (productId: string, price: number) => {
    setTransactionItems(items => items.map(item =>
      item.productId === productId ? { ...item, price: Math.max(0, price) } : item
    ));
  };

  const removeFromTransaction = (productId: string) => {
    setTransactionItems(items => items.filter(item => item.productId !== productId));
  };

  const handleTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || transactionItems.length === 0 || !transactionForm.customer_name) return;

    const groupId = window.crypto.randomUUID();
    try {
      // Stock out
      await Promise.all(transactionItems.map(async (item) => {
        const stockItem = shStock.find(s => s.product_id === item.productId)!;
        const newStockQty = stockItem.quantity - item.quantity;
        if (newStockQty < 0) throw new Error(`Insufficient stock`);
        await supabase.from('warehouse_stock').update({ quantity: newStockQty }).eq('id', stockItem.id);
      }));

      // Lifecycle records
      const records = transactionItems.map(item => {
        const product = products.find(p => p.id === item.productId)!;
        const status: SecondHandLifecycleStatus = transactionType === 'SALE' ? 'SOLD' : 'ACTIVE';
        return {
          transaction_group_id: groupId,
          transaction_type: transactionType,
          lifecycle_status: status,
          customer_name: transactionForm.customer_name,
          mobile_number: transactionForm.mobile_number || null,
          address: transactionForm.address || null,
          product_id: product.id,
          product_name: product.name,
          product_model: product.model,
          product_category: product.category,
          quantity: item.quantity,
          returned_quantity: 0,
          unit_price: Number(item.price || 0),
          payment_method: transactionType === 'SALE' ? transactionForm.payment_method : null,
          start_date: transactionType !== 'SALE' ? transactionForm.start_date : null,
          end_date: transactionType !== 'SALE' ? transactionForm.end_date : null,
          remarks: transactionForm.remarks || null,
          recorded_by: user.id,
        };
      });

      await supabase.from('second_hand_lifecycle').insert(records);
      toast({ title: `${SECOND_HAND_TRANSACTION_LABELS[transactionType]} recorded` });
      resetTransactionForm();
      fetchData();
      fetchLifecycle();
    } catch (error) {
      toast({ title: 'Error recording transaction', variant: 'destructive' });
    }
  };

  const resetTransactionForm = () => {
    setIsTransactionOpen(false);
    setTransactionType('SALE');
    setTransactionForm({ customer_name: '', mobile_number: '', address: '', payment_method: 'CASH', start_date: '', end_date: '', remarks: '' });
    setTransactionItems([]);
    setTransactionProductSearch('');
  };

  // Return handler
  const handleReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroupForReturn || !user) return;

    const returnedQty = parseInt(returnForm.returned_quantity);
    try {
      // 1. Fetch fresh records to avoid stale state
      const { data: records } = await supabase
        .from('second_hand_lifecycle')
        .select('*')
        .eq('transaction_group_id', selectedGroupForReturn)
        .in('lifecycle_status', ['ACTIVE', 'PARTIALLY_RETURNED']);

      if (records && records.length > 0) {
        const totalAvailableToReturn = records.reduce((sum, r) => sum + (r.quantity - r.returned_quantity), 0);
        if (returnedQty > totalAvailableToReturn) {
          toast({ title: 'Invalid quantity', description: `Only ${totalAvailableToReturn} items available to return`, variant: 'destructive' });
          return;
        }

        let remainingToReturn = returnedQty;
        
        for (const record of records) {
          if (remainingToReturn <= 0) break;

          const recordAvailable = record.quantity - record.returned_quantity;
          const returnFromThisRecord = Math.min(recordAvailable, remainingToReturn);
          
          if (returnFromThisRecord <= 0) continue;

          const newReturnedQty = record.returned_quantity + returnFromThisRecord;
          const isFullyReturned = newReturnedQty >= record.quantity;
          const newStatus: SecondHandLifecycleStatus = isFullyReturned ? 'RETURNED' : 'PARTIALLY_RETURNED';

          // Update lifecycle
          await supabase
            .from('second_hand_lifecycle')
            .update({
              returned_quantity: newReturnedQty,
              returned_at: new Date(returnForm.return_date || new Date()).toISOString(),
              return_remarks: returnForm.return_remarks,
              lifecycle_status: newStatus,
            })
            .eq('id', record.id);

          // Fetch LATEST stock to avoid stale state in loop
          const { data: currentStock } = await supabase
            .from('warehouse_stock')
            .select('quantity')
            .eq('product_id', record.product_id)
            .single();

          if (currentStock) {
            await supabase
              .from('warehouse_stock')
              .update({ quantity: currentStock.quantity + returnFromThisRecord })
              .eq('product_id', record.product_id);
          }
          
          remainingToReturn -= returnFromThisRecord;
        }
      }

      toast({ title: 'Return processed' });
      setSelectedGroupForReturn(null);
      setReturnForm({ returned_quantity: '', return_remarks: '', return_date: format(new Date(), 'yyyy-MM-dd') });
      fetchData();
      fetchLifecycle();
    } catch (error) {
      toast({ title: 'Error processing return', variant: 'destructive' });
    }
  };

  const handleDeleteTransactionGroup = async (groupId: string) => {
    if (!isAdmin || deletingGroups.has(groupId)) return;

    // 1. Mark as deleting and optimistic update
    setDeletingGroups(prev => new Set(prev).add(groupId));
    const originalRecords = [...lifecycleRecords];
    setLifecycleRecords(prev => prev.filter(r => r.transaction_group_id !== groupId));

    try {
      // 2. Atomic Delete: Remove from DB first and see what was actually removed
      const { data: deletedRecords, error: deleteError } = await supabase
        .from('second_hand_lifecycle')
        .delete()
        .eq('transaction_group_id', groupId)
        .select();

      if (deleteError) {
        console.error('Delete error:', deleteError);
        throw new Error(deleteError.message || 'Database deletion failed - check permissions');
      }

      // 3. ONLY restore stock if the records were successfully deleted
      if (deletedRecords && deletedRecords.length > 0) {
        for (const record of deletedRecords) {
          // Calculate what actually needs to go back to stock
          const unreturnedQty = record.quantity - (record.returned_quantity || 0);
          
          if (unreturnedQty > 0) {
            // Fresh fetch of current stock to avoid race conditions
            const { data: stockEntry } = await supabase
              .from('warehouse_stock')
              .select('quantity')
              .eq('product_id', record.product_id)
              .single();

            if (stockEntry) {
              await supabase
                .from('warehouse_stock')
                .update({ quantity: (stockEntry.quantity || 0) + unreturnedQty })
                .eq('product_id', record.product_id);
            }
          }
        }
        toast({ title: 'Transaction Demolished', description: 'Records removed and inventory restored.' });
      } else {
        // This case hits if the record was already gone or RLS blocked it without an error
        toast({ title: 'Demolition Bypassed', description: 'No records were matched for deletion.', variant: 'default' });
      }

      // Small cooldown then refresh
      await new Promise(resolve => setTimeout(resolve, 300));
      fetchData();
      fetchLifecycle();
    } catch (error: unknown) {
      // Rollback optimistic update on error
      setLifecycleRecords(originalRecords);
      const errorMessage = error instanceof Error ? error.message : 'An error occurred';
      toast({ title: 'Error deleting transaction', description: errorMessage, variant: 'destructive' });
    } finally {
      setDeletingGroups(prev => {
        const next = new Set(prev);
        next.delete(groupId);
        return next;
      });
    }
  };

  const handleDeleteProduct = async () => {
    if (!productToDelete) return;

    try {
      // 1. Delete stock record first
      await supabase
        .from('warehouse_stock')
        .delete()
        .eq('product_id', productToDelete.id);

      // 2. Delete the product itself
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', productToDelete.id);

      if (error) throw error;

      toast({ title: 'Product deleted successfully' });
      setProductToDelete(null);
      fetchData();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      toast({ title: 'Error deleting product', description: errorMessage, variant: 'destructive' });
    }
  };

  const filteredStock = shStock.filter(item => {
    const searchLower = search.toLowerCase();
    return item.product?.name.toLowerCase().includes(searchLower) || item.product?.model.toLowerCase().includes(searchLower);
  });

  const groupedLifecycle = lifecycleRecords.reduce((groups, record) => {
    if (!groups[record.transaction_group_id]) groups[record.transaction_group_id] = [];
    groups[record.transaction_group_id].push(record);
    return groups;
  }, {} as Record<string, SecondHandLifecycleRecord[]>);

  // Downloads
  const handleDownloadStockList = () => {
    const data = filteredStock.map(item => formatStockForExport(item));
    downloadCSV(data, `sh-stock-${new Date().toISOString().split('T')[0]}`);
  };


  const handleDownloadTemplate = () => {
    const templateData: Record<string, string | number>[] = shStock.map(item => ({
      'Product ID': item.product_id,
      'Product Name': item.product?.name || '',
      'Model': item.product?.model || '',
      'Category': item.product?.category || '',
      'Capacity': item.product?.capacity || '',
      'Current Quantity': item.quantity,
      'New Quantity': item.quantity,
    }));
    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'SH Inventory');
    XLSX.writeFile(wb, `sh-template-${new Date().toISOString().split('T')[0]}.xlsx`);
    toast({ title: 'SH Template downloaded' });
  };

  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<BulkUploadRow>(ws);

      let updated = 0;
      let created = 0;

      for (const row of rows) {
        const productId = row['Product ID']?.toString().trim();
        const newQtyValue = row['New Quantity'];
        const newQty = typeof newQtyValue === 'number' ? newQtyValue : parseInt(String(newQtyValue ?? ''), 10);
        const productName = row['Product Name']?.toString().trim();
        const model = row['Model']?.toString().trim();
        const category = row['Category']?.toString().trim();
        const capacity = row['Capacity']?.toString().trim() || null;

        // Update existing SH
        if (productId && !isNaN(newQty) && newQty >= 0) {
          const stockItem = shStock.find(item => item.product_id === productId);
          if (!stockItem || !isSecondHandCategory(stockItem.product?.category)) continue;

          const { error } = await supabase
            .from('warehouse_stock')
            .update({ quantity: newQty })
            .eq('product_id', productId);
          if (!error) updated++;
          continue;
        }

        // Create new SH product
        if (!productId && productName && model && category && isSecondHandCategory(category)) {
          const qty = !isNaN(newQty) && newQty >= 0 ? parseInt(String(newQty), 10) : 0;

          const { data: newProduct, error: productError } = await supabase
            .from('products')
            .insert({ name: `SH ${productName}`, model, category, capacity })
            .select()
            .single();

          if (productError) {
            console.error('Error creating product:', productError);
            continue;
          }

          const { error: stockError } = await supabase
            .from('warehouse_stock')
            .insert({ product_id: newProduct!.id, quantity: qty });


          if (!stockError) created++;
        }
      }

      toast({ title: 'SH Bulk upload complete', description: `${updated} updated, ${created} created` });
      fetchData();
    } catch (error: unknown) {
      toast({ title: 'Upload error', description: (error as Error).message, variant: 'destructive' });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const renderDashboard = () => {
    // 1. Get all active RENT_OUT and GOOD_WILL records
    const activeTracking = Object.entries(groupedLifecycle)
      .filter(([_, records]) => {
        const first = records[0];
        const totalQty = records.reduce((sum, r) => sum + r.quantity, 0);
        const returned = records.reduce((sum, r) => sum + r.returned_quantity, 0);
        return (first.transaction_type === 'RENT_OUT' || first.transaction_type === 'GOOD_WILL') && returned < totalQty;
      })
      .map(([groupId, records]) => ({ groupId, records }));

    // 2. Stats
    const totalRented = activeTracking.filter(g => g.records[0].transaction_type === 'RENT_OUT').length;
    const totalGoodWill = activeTracking.filter(g => g.records[0].transaction_type === 'GOOD_WILL').length;
    const overdue = activeTracking.filter(g => g.records[0].end_date && isPast(new Date(g.records[0].end_date)) && !isPast(new Date(format(new Date(), 'yyyy-MM-dd')))).length;

    return (
      <div className="space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20 shadow-sm overflow-hidden group">
            <CardContent className="p-6 relative">
              <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <Activity className="h-16 w-16 text-blue-600" />
              </div>
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-500/20 rounded-xl">
                  <Package className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Items Out</p>
                  <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{activeTracking.length}</h3>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20 shadow-sm overflow-hidden group">
            <CardContent className="p-6 relative">
              <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <ArrowUpRight className="h-16 w-16 text-green-600" />
              </div>
              <div className="flex items-center gap-4">
                <div className="p-3 bg-green-500/20 rounded-xl">
                  <Clock className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Active Rents</p>
                  <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{totalRented}</h3>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20 shadow-sm overflow-hidden group">
            <CardContent className="p-6 relative">
              <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <User className="h-16 w-16 text-purple-600" />
              </div>
              <div className="flex items-center gap-4">
                <div className="p-3 bg-purple-500/20 rounded-xl">
                  <Info className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Good Will Tracking</p>
                  <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{totalGoodWill}</h3>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className={`bg-gradient-to-br from-red-500/10 to-red-600/5 border-red-500/20 shadow-sm overflow-hidden group ${overdue > 0 ? 'animate-pulse' : ''}`}>
            <CardContent className="p-6 relative">
              <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <AlertTriangle className="h-16 w-16 text-red-600" />
              </div>
              <div className="flex items-center gap-4">
                <div className="p-3 bg-red-500/20 rounded-xl">
                  <Clock className="h-6 w-6 text-red-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Overdue Returns</p>
                  <h3 className="text-2xl font-bold text-red-600 dark:text-red-400">{overdue}</h3>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tracking List */}
        <Card className="rounded-2xl border-slate-200 dark:border-white/10 overflow-hidden shadow-xl shadow-slate-200/50 dark:shadow-none">
          <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-white/10">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-bold">Live Tracking: Rents & Good Will</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">Real-time status of products awaiting return</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50/50 dark:bg-slate-900/50">
                  <TableRow>
                    <TableHead className="font-bold py-4">Customer Details</TableHead>
                    <TableHead className="font-bold">Product Information</TableHead>
                    <TableHead className="font-bold">Transaction Type</TableHead>
                    <TableHead className="font-bold">Return Schedule</TableHead>
                    <TableHead className="font-bold">Status Indicator</TableHead>
                    <TableHead className="text-right pr-6 font-bold">Quick Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeTracking.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                        No active rents or good-will tracking at the moment
                      </TableCell>
                    </TableRow>
                  ) : (
                    activeTracking.map(({ groupId, records }) => {
                      const first = records[0];
                      const totalQty = records.reduce((sum, r) => sum + r.quantity, 0);
                      const returned = records.reduce((sum, r) => sum + r.returned_quantity, 0);
                      const daysLeft = first.end_date ? differenceInDays(new Date(first.end_date), new Date()) : null;
                      
                      const isOverdue = daysLeft !== null && daysLeft < 0;
                      const isDueSoon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 3;

                      return (
                        <TableRow key={groupId} className="group hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                          <TableCell className="py-4">
                            <div className="flex flex-col gap-1">
                              <span className="font-bold text-slate-900 dark:text-white">{first.customer_name}</span>
                              <div className="flex items-center gap-2 text-xs text-slate-500">
                                <Phone className="h-3 w-3" /> {first.mobile_number || 'No contact'}
                              </div>
                              <div className="flex items-center gap-2 text-[10px] text-slate-400">
                                <MapPin className="h-3 w-3" /> {first.address || 'No address provided'}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              {records.map((r, idx) => (
                                <div key={idx} className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-[10px] py-0">{r.product_name}</Badge>
                                  <span className="text-[11px] font-bold">x{r.quantity - r.returned_quantity}</span>
                                </div>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={first.transaction_type === 'RENT_OUT' ? 'bg-green-500' : 'bg-purple-500'}>
                              {first.transaction_type}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1 text-xs">
                              <div className="flex items-center gap-1.5 text-slate-500">
                                <Clock className="h-3.5 w-3.5" /> Out: {first.start_date ? format(new Date(first.start_date), 'MMM d, yyyy') : 'N/A'}
                              </div>
                              <div className={`flex items-center gap-1.5 font-bold ${isOverdue ? 'text-red-500' : 'text-slate-700 dark:text-slate-300'}`}>
                                <Calendar className="h-3.5 w-3.5" /> Due: {first.end_date ? format(new Date(first.end_date), 'MMM d, yyyy') : 'N/A'}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {daysLeft !== null ? (
                              <div className="flex items-center gap-2">
                                <div className={`h-2 w-2 rounded-full ${isOverdue ? 'bg-red-500 animate-pulse' : isDueSoon ? 'bg-amber-400' : 'bg-green-500'}`} />
                                <span className={`text-xs font-bold ${isOverdue ? 'text-red-500' : isDueSoon ? 'text-amber-600' : 'text-green-600'}`}>
                                  {isOverdue ? `${Math.abs(daysLeft)} days overdue` : isDueSoon ? `${daysLeft} days remaining` : `${daysLeft} days left`}
                                </span>
                              </div>
                            ) : (
                              <Badge variant="secondary">No limit</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right pr-6">
                            <Button variant="ghost" size="sm" className="rounded-xl border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 transition-all font-bold text-xs" onClick={() => setSelectedGroupForReturn(groupId)}>
                              Process Return
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  if (!canManage) {
    return (
      <AppLayout>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Card className="w-full max-w-lg rounded-2xl border-slate-200 dark:border-white/10 shadow-sm">
            <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
              <Info className="h-10 w-10 text-amber-500" />
              <div className="space-y-1">
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Second Hand access required</h2>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Your account does not currently have permission to manage second-hand inventory.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-4 mb-1">
              <h1 className="text-3xl font-bold tracking-tight">Second Hand Inventory</h1>
              <div className="flex items-center bg-muted/50 p-1 rounded-lg border">
                <button onClick={() => setActiveTab('dashboard')} className={`px-3 py-1 text-sm font-medium rounded-md ${activeTab === 'dashboard' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                  Dashboard
                </button>
                <button onClick={() => setActiveTab('stock')} className={`px-3 py-1 text-sm font-medium rounded-md ${activeTab === 'stock' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                  Current Stock
                </button>
                <button onClick={() => setActiveTab('history')} className={`px-3 py-1 text-sm font-medium rounded-md ${activeTab === 'history' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                  Lifecycle History
                </button>
              </div>
            </div>
            <p className="text-muted-foreground">Manage SH Battery & SH Inverter stock, transactions, and returns</p>
          </div>
          <div className="flex gap-2 flex-wrap sm:flex-nowrap items-center">
            <Button variant="outline" className="rounded-xl border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5 transition-all" onClick={handleDownloadStockList} disabled={filteredStock.length === 0}>
              <Download className="h-4 w-4 mr-2" /> Stock List
            </Button>
            <Button variant="outline" className="rounded-xl border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5 transition-all" onClick={handleDownloadTemplate}>
              <Download className="h-4 w-4 mr-2" /> Template
            </Button>
            <Button variant="outline" className="rounded-xl border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5 transition-all" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4 mr-2" /> Bulk Upload
            </Button>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleBulkUpload} className="hidden" />
            <Dialog open={isAddProductOpen} onOpenChange={setIsAddProductOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="rounded-xl border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5 transition-all">
                  <Plus className="h-4 w-4 mr-2" /> Add Product
                </Button>
              </DialogTrigger>
              <DialogContent>
                <form onSubmit={handleAddProduct} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Product Name</Label>
                    <Input value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select value={productForm.category} onValueChange={(v) => setProductForm({ ...productForm, category: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {SECOND_HAND_CATEGORIES.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Model</Label>
                      <Input value={productForm.model} onChange={(e) => setProductForm({ ...productForm, model: e.target.value })} required />
                    </div>
                    <div className="space-y-2">
                      <Label>Capacity</Label>
                      <Input value={productForm.capacity} onChange={(e) => setProductForm({ ...productForm, capacity: e.target.value })} />
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="space-y-2">
                      <Label>Initial Quantity</Label>
                      <Input type="number" value={productForm.initialQuantity} onChange={(e) => setProductForm({ ...productForm, initialQuantity: e.target.value })} />
                    </div>
                  )}
                  <Button type="submit" className="w-full">Add SH Product</Button>
                </form>
              </DialogContent>
            </Dialog>
            <Dialog open={isTransactionOpen} onOpenChange={setIsTransactionOpen}>
              <DialogTrigger asChild>
                <Button className="rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 hover:scale-[1.02] hover:shadow-[0_8px_32px_rgba(59,130,246,0.35)] text-white shadow-lg border-0 transition-all duration-300 font-bold tracking-wide">
                  <Plus className="h-4 w-4 mr-2 text-blue-200" /> Record Transaction
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Record Transaction</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleTransaction} className="space-y-4 pt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2 md:col-span-2">
                      <Label>Transaction Type</Label>
                      <Select
                        value={transactionType}
                        onValueChange={(value) => setTransactionType(value as SecondHandTransactionType)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(SECOND_HAND_TRANSACTION_LABELS).map(([key, label]) => (
                            <SelectItem key={key} value={key}>{label as string}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Customer Name</Label>
                      <Input value={transactionForm.customer_name} onChange={(e) => setTransactionForm({ ...transactionForm, customer_name: e.target.value })} required />
                    </div>
                    <div className="space-y-2">
                      <Label>Mobile</Label>
                      <Input value={transactionForm.mobile_number} onChange={(e) => setTransactionForm({ ...transactionForm, mobile_number: e.target.value })} />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Address</Label>
                      <Input value={transactionForm.address} onChange={(e) => setTransactionForm({ ...transactionForm, address: e.target.value })} />
                    </div>
                    {transactionType !== 'SALE' && (
                      <>
                        <div className="space-y-2">
                          <Label>Start Date</Label>
                          <Popover open={isStartDateOpen} onOpenChange={setIsStartDateOpen}>
                            <PopoverTrigger asChild>
                              <Button variant="outline" className="w-full justify-start text-left font-normal">
                                <Calendar className="mr-2 h-4 w-4" />
                                {transactionForm.start_date ? format(new Date(transactionForm.start_date), 'PPP') : <span>Pick a date</span>}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                              <CalendarComponent
                                mode="single"
                                selected={transactionForm.start_date ? new Date(transactionForm.start_date) : undefined}
                                onSelect={(date) => {
                                  setTransactionForm({ ...transactionForm, start_date: date ? format(date, 'yyyy-MM-dd') : '' });
                                  setIsStartDateOpen(false);
                                }}
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
                        <div className="space-y-2">
                          <Label>End Date</Label>
                          <Popover open={isEndDateOpen} onOpenChange={setIsEndDateOpen}>
                            <PopoverTrigger asChild>
                              <Button variant="outline" className="w-full justify-start text-left font-normal">
                                <Calendar className="mr-2 h-4 w-4" />
                                {transactionForm.end_date ? format(new Date(transactionForm.end_date), 'PPP') : <span>Pick a date</span>}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                              <CalendarComponent
                                mode="single"
                                selected={transactionForm.end_date ? new Date(transactionForm.end_date) : undefined}
                                onSelect={(date) => {
                                  setTransactionForm({ ...transactionForm, end_date: date ? format(date, 'yyyy-MM-dd') : '' });
                                  setIsEndDateOpen(false);
                                }}
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
                      </>
                    )}
                    {transactionType === 'SALE' && (
                      <div className="space-y-2">
                        <Label>Payment Method</Label>
                        <Select
                          value={transactionForm.payment_method}
                          onValueChange={(value) =>
                            setTransactionForm({
                              ...transactionForm,
                              payment_method: value as SecondHandPaymentMethod,
                            })
                          }
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="CASH">Cash</SelectItem>
                            <SelectItem value="CARD">Card</SelectItem>
                            <SelectItem value="UPI">UPI</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Add Products</Label>
                    <div className="relative">
                      <SearchBar placeholder="Search SH products to add..." value={transactionProductSearch} onChange={setTransactionProductSearch} />
                      {transactionProductSearch && filteredTransactionProducts.length > 0 && (
                        <div className="absolute z-10 w-full mt-1 bg-background border rounded-md shadow-lg max-h-48 overflow-auto">
                          {filteredTransactionProducts.map(p => (
                            <button key={p.id} type="button" className="w-full text-left px-3 py-2 hover:bg-accent" onClick={() => addToTransaction(p.id)}>
                              <div>{p.name} - {p.model}</div>
                              <div className="text-xs text-muted-foreground">{shStock.find(s => s.product_id === p.id)?.quantity} in stock</div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  {transactionItems.length > 0 && (
                    <div className="space-y-2">
                      <Label>Items</Label>
                      <div className="border rounded-md divide-y">
                        {transactionItems.map(item => {
                          const p = products.find(pr => pr.id === item.productId);
                          const stock = shStock.find(s => s.product_id === item.productId);
                          return (
                            <div key={item.productId} className="p-3 flex items-center justify-between gap-4">
                              <div className="flex-1">
                                <div className="font-medium">{p?.name}</div>
                                <div className="text-sm text-muted-foreground">{p?.model}</div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button type="button" variant="outline" size="sm" onClick={() => updateTransactionQty(item.productId, item.quantity - 1)}>
                                  <Minus className="h-3 w-3" />
                                </Button>
                                <Input type="number" value={item.quantity} onChange={(e) => updateTransactionQty(item.productId, parseInt(e.target.value))} className="w-16 text-center" />
                                <Button type="button" variant="outline" size="sm" onClick={() => updateTransactionQty(item.productId, item.quantity + 1)}>
                                  <Plus className="h-3 w-3" />
                                </Button>
                              </div>
                              {transactionType === 'SALE' && (
                                <Input type="number" value={item.price || ''} onChange={(e) => updateTransactionPrice(item.productId, parseFloat(e.target.value))} className="w-24" placeholder="Price" />
                              )}
                              <Button type="button" variant="ghost" size="sm" onClick={() => removeFromTransaction(item.productId)}>
                                X
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label>Remarks</Label>
                    <Textarea value={transactionForm.remarks} onChange={(e) => setTransactionForm({ ...transactionForm, remarks: e.target.value })} />
                  </div>
                  <Button type="submit" className="w-full" disabled={transactionItems.length === 0}>Record Transaction</Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {activeTab === 'stock' && (
          <div className="w-full bg-white dark:bg-[#111827]/80 backdrop-blur-xl border border-slate-200 dark:border-white/5 rounded-2xl overflow-hidden shadow-2xl animate-in fade-in duration-500">
            <div className="flex justify-between items-center px-6 py-4 border-b border-slate-200 dark:border-white/10 bg-slate-50/30 dark:bg-slate-900/30">
              <SearchBar
                value={search}
                onChange={setSearch}
                placeholder="Search SH products..."
                className="w-full max-w-md"
              />
            </div>
            <div className="flex flex-col">
              <div className="hidden lg:grid lg:grid-cols-[2fr_1.5fr_1fr_1fr_1.5fr_auto] gap-4 px-6 py-3 bg-slate-50 dark:bg-[#0B0F19]/50 border-b border-slate-200 dark:border-white/10">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Product</div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Model</div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Capacity</div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 text-right pr-2">Quantity</div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Health Status</div>
                <div className="w-8"></div>
              </div>

              <div className="divide-y divide-slate-100 dark:divide-white/5 max-h-[650px] smooth-scroll-list styled-scrollbar pb-8">
                {loading ? (
                  <div className="p-12 text-center text-slate-400 italic">Loading stock...</div>
                ) : filteredStock.length === 0 ? (
                  <div className="p-12 text-center text-slate-400 italic flex flex-col items-center gap-3">
                    <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-full">
                      <Package className="h-8 w-8 opacity-20" />
                    </div>
                    No SH stock found
                  </div>
                ) : (
                  filteredStock.map(item => {
                    const health = item.quantity < 5 ? 'critical' : item.quantity < 20 ? 'warning' : 'good';
                    const healthColor = health === 'critical' ? 'bg-red-500' : health === 'warning' ? 'bg-amber-400' : 'bg-[#4F8CFF]';
                    const healthGlow = health === 'critical' ? 'shadow-[0_0_12px_rgba(239,68,68,0.5)]' : health === 'warning' ? 'shadow-[0_0_10px_rgba(251,191,36,0.3)]' : 'shadow-[0_0_10px_rgba(79,140,255,0.3)]';

                    return (
                      <div key={item.id} className="stock-row group relative flex flex-col lg:grid lg:grid-cols-[2fr_1.5fr_1fr_1fr_1.5fr_auto] gap-3 lg:gap-4 p-4 lg:items-center hover:bg-slate-50 dark:hover:bg-[#1B2438]/60 transition-colors duration-150">
                        <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#4F8CFF] scale-y-0 lg:group-hover:scale-y-100 transition-transform origin-center" />

                        <div className="flex justify-between items-center w-full lg:hidden mb-1">
                          <div className="font-bold text-slate-800 dark:text-slate-200 truncate pr-4 text-[16px]">{item.product?.name}</div>
                          <div className="text-right font-bold text-[18px] text-slate-900 dark:text-white tabular-nums drop-shadow-sm">{item.quantity} units</div>
                        </div>

                        <div className="hidden lg:block font-bold text-slate-800 dark:text-slate-200 truncate pr-4 text-[14px]">
                          {item.product?.name}
                          <Badge variant="outline" className="ml-2 mt-1 text-[10px]">{item.product?.category}</Badge>
                        </div>
                        <div className="text-slate-600 dark:text-slate-500 dark:text-slate-400 text-[13px] truncate flex items-center gap-2"><span className="lg:hidden uppercase text-[10px] font-bold opacity-60">Model</span>{item.product?.model}</div>
                        <div className="text-slate-600 dark:text-slate-500 text-[13px] flex items-center gap-2"><span className="lg:hidden uppercase text-[10px] font-bold opacity-60">Capacity</span>{item.product?.capacity || '-'}</div>

                        <div className="hidden lg:block text-right font-bold text-lg text-slate-900 dark:text-white tabular-nums drop-shadow-sm">
                          {item.quantity}
                        </div>

                        <div className="flex flex-col gap-2 relative lg:pl-2 mt-2 lg:mt-0">
                          <div className="flex items-center gap-2">
                            {health === 'critical' ? (
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider text-red-500 bg-red-500/10 border border-red-500/20 ${healthGlow} animate-pulse shadow-red-500/20`}>
                                <AlertTriangle className="h-3 w-3" /> Critical Low
                              </span>
                            ) : health === 'warning' ? (
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider text-amber-500 bg-amber-500/10 border border-amber-500/20 ${healthGlow}`}>
                                <ArrowDownCircle className="h-3 w-3" /> Reorder Soon
                              </span>
                            ) : (
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider text-[#4F8CFF] bg-[#4F8CFF]/10 border border-[#4F8CFF]/20 ${healthGlow}`}>
                                <ArrowUpCircle className="h-3 w-3" /> Healthy Stock
                              </span>
                            )}
                          </div>
                          <div className="h-1.5 w-full max-w-[120px] bg-slate-50 dark:bg-[#0B0F19] rounded-full overflow-hidden shadow-inner hidden sm:block border border-slate-200 dark:border-white/5">
                            <div
                              className={`h-full rounded-full ${healthColor} transition-all duration-1000 ease-out`}
                              style={{ width: `${Math.min(100, (item.quantity / 50) * 100)}%` }}
                            />
                          </div>
                        </div>
                        {isAdmin ? (
                          <div className="w-8 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-full text-slate-600 dark:text-slate-500 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                              onClick={() => item.product && setProductToDelete(item.product as Product)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : <div className="w-0"></div>}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'dashboard' && renderDashboard()}

        {activeTab === 'history' && (
          <Card className="rounded-2xl overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Products</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>By</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(groupedLifecycle).map(([groupId, records]) => {
                  const first = records[0];
                  const totalQty = records.reduce((sum, r) => sum + r.quantity, 0);
                  const returned = records.reduce((sum, r) => sum + r.returned_quantity, 0);
                  const status: SecondHandLifecycleStatus = returned >= totalQty ? 'RETURNED' : (returned > 0 ? 'PARTIALLY_RETURNED' : first!.lifecycle_status as SecondHandLifecycleStatus);
                  return (
                    <TableRow key={groupId}>
                      <TableCell>{new Date(first!.created_at).toLocaleString()}</TableCell>
                      <TableCell><Badge>{SECOND_HAND_TRANSACTION_LABELS[first!.transaction_type]}</Badge></TableCell>
                      <TableCell>{first!.customer_name}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {records.map((r, i) => (
                            <div key={i} className="text-sm">
                              {r.product_name} <span className="text-muted-foreground text-xs">x{r.quantity}</span>
                            </div>
                          ))}
                          {(first?.start_date || first?.end_date) && (
                            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-100 dark:border-white/5">
                              <Calendar className="h-3 w-3 text-blue-400" />
                              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-tight">Rental Duration</span>
                            </div>
                          )}
                          <div className="text-[11px] text-slate-600 dark:text-slate-400 font-medium">
                            {first?.start_date && format(new Date(first.start_date), 'MMM d, yyyy')}
                            {first?.end_date && ` → ${format(new Date(first.end_date), 'MMM d, yyyy')}`}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <Badge variant={status === 'RETURNED' ? 'default' : status === 'SOLD' ? 'destructive' : 'outline'}>
                            {SECOND_HAND_STATUS_LABELS[status as SecondHandLifecycleStatus]}
                          </Badge>
                          {returned > 0 && first?.returned_at && (
                            <div className="text-[10px] text-muted-foreground italic flex items-center gap-1">
                              <Calendar className="h-2.5 w-2.5" />
                              Ret: {format(new Date(first.returned_at), 'MMM d, p')}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{totalQty} ({returned > 0 ? `${returned} returned` : ''})</TableCell>
                      <TableCell>{getProfileName(first!.recorded_by)}</TableCell>
                      <TableCell className="text-right">
                        {status !== 'RETURNED' && records.every(r => r.transaction_type !== 'SALE') && (
                          <Button variant="ghost" size="sm" onClick={() => setSelectedGroupForReturn(groupId)}>
                            Return
                          </Button>
                        )}
                        <Dialog open={selectedGroupForReturn === groupId} onOpenChange={(open) => { if (!open) setSelectedGroupForReturn(null); }}>
                          <DialogContent>
                            <form onSubmit={handleReturn} className="space-y-4">
                              <h3>Return Group {groupId.slice(0, 8)}...</h3>
                              <div className="space-y-2">
                                <Label>Returned Quantity (Total: {totalQty})</Label>
                                <Input type="number" value={returnForm.returned_quantity} onChange={(e) => setReturnForm({ ...returnForm, returned_quantity: e.target.value })} required />
                              </div>
                              <div className="space-y-2">
                                <Label>Return Date</Label>
                                <Popover open={isReturnDateOpen} onOpenChange={setIsReturnDateOpen}>
                                  <PopoverTrigger asChild>
                                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                                      <Calendar className="mr-2 h-4 w-4" />
                                      {returnForm.return_date ? format(new Date(returnForm.return_date), 'PPP') : <span>Pick return date</span>}
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-auto p-0">
                                    <CalendarComponent
                                      mode="single"
                                      selected={returnForm.return_date ? new Date(returnForm.return_date) : undefined}
                                      onSelect={(date) => {
                                        setReturnForm({ ...returnForm, return_date: date ? format(date, 'yyyy-MM-dd') : '' });
                                        setIsReturnDateOpen(false);
                                      }}
                                      initialFocus
                                    />
                                  </PopoverContent>
                                </Popover>
                              </div>
                              <div className="space-y-2">
                                <Label>Remarks</Label>
                                <Textarea value={returnForm.return_remarks} onChange={(e) => setReturnForm({ ...returnForm, return_remarks: e.target.value })} />
                              </div>
                              <Button type="submit" className="w-full">Process Return</Button>
                            </form>
                          </DialogContent>
                        </Dialog>
                        {isAdmin && status !== 'RETURNED' && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-100 ml-2"
                                disabled={deletingGroups.has(groupId)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Demolish Transaction?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently delete this transaction from history and restore the inventory stock for remaining items.
                                  This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteTransactionGroup(groupId)} className="bg-red-500 hover:bg-red-600">
                                  Demolish
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {Object.keys(groupedLifecycle).length === 0 && <div className="p-12 text-center text-muted-foreground">No SH lifecycle records</div>}
          </Card>
        )}

        {/* Delete Product Confirmation Dialog */}
        <AlertDialog open={!!productToDelete} onOpenChange={() => setProductToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete SH Product?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete "{productToDelete?.name} - {productToDelete?.model}" and its stock record.
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteProduct} className="bg-destructive text-destructive-foreground">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}

